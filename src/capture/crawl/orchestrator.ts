/**
 * Crawl orchestrator (SDD 06 crawl design).
 *
 * Etiquette, all enforced here and all tested with injected fakes:
 * - ONE reused tab, sequential navigation only, never parallel (NFR-07).
 * - `crawlDelayMs` sleep between every navigation (default 1500).
 * - Closed scope: every URL checked against the crawl state's scope AND the
 *   *.digikala.com guard before navigating (D-02/D-03).
 * - State persisted after every step via the injected persister (R-08).
 * - Per-item failure containment: one broken item never aborts the crawl.
 * - Abort honored between pages.
 * - No cart writes anywhere: the orchestrator only GETs (D-01).
 */
import type { CrawlState } from './state';
import {
  initialState,
  seedFromCart,
  markCartDone,
  recordItemResult,
  pendingItems,
  isComplete,
  assertResumable,
  assertInScope,
} from './state';
import { CART_API_URL, productApiUrl } from '../readers/url';
import { readCartPayload, type CartItemView } from '../readers/cart';
import { readProductPayload } from '../readers/product';
import { CaptureError } from '../errors';

/** Injected I/O surface - the only places the orchestrator touches the world. */
export interface CrawlDeps {
  /** Fetch JSON from a Digikala API URL (service-worker fetch w/ session). */
  fetchJson: (url: string) => Promise<unknown>;
  /** Sleep between steps (injected so tests run instantly). */
  delay: (ms: number) => Promise<void>;
  /** Persist state after every step. */
  persistState: (state: CrawlState) => Promise<void>;
  /** Load persisted state at start (null = fresh). */
  loadState: () => Promise<CrawlState | null>;
  /** Called once with the raw cart payload view. */
  onCart: (items: CartItemView[]) => Promise<void>;
  /** Called per item with the raw product payload (already read). */
  onProduct: (productId: string, variantId: string, payload: unknown) => Promise<void>;
  /** Progress sink. */
  onProgress?: (p: { step: number; total: number; done: number; failed: number }) => void;
  /** Cooperative abort check, polled between pages. */
  shouldAbort?: () => boolean;
  /** NFR-07 delay in ms. */
  crawlDelayMs: number;
}

export interface CrawlResult {
  state: CrawlState;
  aborted: boolean;
  done: number;
  failed: number;
}

function count(state: CrawlState): { done: number; failed: number; total: number } {
  return {
    done: state.items.filter((i) => i.status === 'done').length,
    failed: state.items.filter((i) => i.status === 'failed').length,
    total: state.items.length,
  };
}

/**
 * Runs the crawl to completion (or abort). Resumable: pass the persisted
 * state via deps.loadState; completed items are skipped, never re-fetched.
 */
export async function runCrawl(deps: CrawlDeps): Promise<CrawlResult> {
  let state: CrawlState = (await deps.loadState()) ?? initialState();
  assertResumable(state);

  // Step 1: cart payload (skipped when resuming a crawl past it).
  if (!state.cartDone) {
    await deps.delay(deps.crawlDelayMs);
    const cartRaw = await deps.fetchJson(CART_API_URL);
    const cartItems = readCartPayload(cartRaw);
    await deps.onCart(cartItems);
    state = markCartDone(
      seedFromCart(
        state,
        cartItems.map((i) => ({ productId: i.productId, variantId: i.variantId ?? '' })),
      ),
    );
    await deps.persistState(state);
  }

  let aborted = false;

  // Step 2: per-item product payloads, sequential, delay before each.
  // Bounded retry loop: each pass attempts every still-pending item once;
  // items flip to done or (after MAX_ATTEMPTS_PER_ITEM) failed, so the loop
  // always terminates. A broken item never aborts the crawl (containment).
  let madeProgress = true;
  while (!aborted && madeProgress && pendingItems(state).length > 0) {
    madeProgress = false;
    for (const item of pendingItems(state)) {
      if (deps.shouldAbort?.()) {
        aborted = true;
        break;
      }
      await deps.delay(deps.crawlDelayMs);
      const url = productApiUrl(item.productId, item.variantId);
      assertInScope(state, url); // throws before any fetch if out of scope
      try {
        const raw = await deps.fetchJson(url);
        readProductPayload(raw); // validate shape; malformed => contained failure
        await deps.onProduct(item.productId, item.variantId, raw);
        state = recordItemResult(state, item.productId, item.variantId, { ok: true });
      } catch (e) {
        const code = e instanceof CaptureError ? e.code : 'UNKNOWN';
        state = recordItemResult(state, item.productId, item.variantId, {
          ok: false,
          errorCode: code,
        });
      }
      madeProgress = true;
      await deps.persistState(state);
      const c = count(state);
      deps.onProgress?.({ step: state.step, total: c.total, done: c.done, failed: c.failed });
    }
  }

  if (!aborted && isComplete(state)) {
    state = { ...state, phase: 'complete', updatedAt: new Date().toISOString() };
    await deps.persistState(state);
  }

  const c = count(state);
  return { state, aborted, done: c.done, failed: c.failed };
}
