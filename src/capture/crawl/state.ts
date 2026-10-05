/**
 * Crawl state (SDD 06: resumable, no duplicate snapshots, closed scope).
 *
 * The MV3 service worker can die mid-crawl; state is persisted after every
 * step so a resumed crawl continues from where it stopped without re-fetching
 * or re-storing anything already done (FR-02, R-08).
 *
 * The state is plain serializable data + a pure reducer - the orchestrator
 * owns I/O, so tests can drive the machine with no browser at all.
 */
import { assertDigikalaUrl } from '../readers/url';

export type CrawlPhase = 'idle' | 'cart' | 'product' | 'complete' | 'failed';

export interface CrawlItemState {
  productId: string;
  variantId: string;
  /** done | failed | pending */
  status: 'pending' | 'done' | 'failed';
  errorCode?: string;
  attempts: number;
}

export interface CrawlState {
  phase: CrawlPhase;
  /** Cart capture done? The cart payload seeds the item list (closed scope). */
  cartDone: boolean;
  items: CrawlItemState[];
  /** Monotonic step counter for progress reporting. */
  step: number;
  updatedAt: string;
}

export const MAX_ATTEMPTS_PER_ITEM = 2;

export function initialState(): CrawlState {
  return { phase: 'idle', cartDone: false, items: [], step: 0, updatedAt: '' };
}

/** All items the crawl must still work on (scope = exactly this list). */
export function pendingItems(state: CrawlState): CrawlItemState[] {
  return state.items.filter((i) => i.status === 'pending');
}

export function isComplete(state: CrawlState): boolean {
  return (
    state.phase === 'complete' ||
    (state.cartDone && state.items.length > 0 && state.items.every((i) => i.status !== 'pending'))
  );
}

/** Adds cart-derived items to the scope. Existing entries are never reset. */
export function seedFromCart(
  state: CrawlState,
  items: Array<{ productId: string; variantId: string }>,
): CrawlState {
  const known = new Set(state.items.map((i) => `${i.productId}::${i.variantId}`));
  const additions = items
    .filter((i) => i.productId && i.variantId)
    .filter((i) => !known.has(`${i.productId}::${i.variantId}`))
    .map((i) => ({
      productId: i.productId,
      variantId: i.variantId,
      status: 'pending' as const,
      attempts: 0,
    }));
  return {
    ...state,
    items: [...state.items, ...additions],
    updatedAt: new Date().toISOString(),
  };
}

/** Marks the cart step done (its payload is stored by the orchestrator). */
export function markCartDone(state: CrawlState): CrawlState {
  return {
    ...state,
    cartDone: true,
    phase: 'product',
    step: state.step + 1,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Closed scope check: the only permitted navigation targets are the API URLs
 * of items currently in the state's scope. Anything else throws before a
 * network byte moves (D-02/D-03, NFR-07).
 */
export function assertInScope(state: CrawlState, url: string): void {
  assertDigikalaUrl(url);
  const ok = state.items.some((i) => {
    return (
      url.includes(`/products/${encodeURIComponent(i.productId)}/`) &&
      url.includes(`variant_id=${encodeURIComponent(i.variantId)}`)
    );
  });
  if (!ok) {
    const err = new Error(`URL not in crawl scope: ${url}`);
    err.name = 'OutOfScopeError';
    throw err;
  }
}

/** Records one item attempt result. Failed items retry up to MAX_ATTEMPTS. */
export function recordItemResult(
  state: CrawlState,
  productId: string,
  variantId: string,
  result: { ok: true } | { ok: false; errorCode: string },
): CrawlState {
  const items = state.items.map((i) => {
    if (i.productId !== productId || i.variantId !== variantId) return i;
    if (result.ok) return { ...i, status: 'done' as const, errorCode: undefined };
    const attempts = i.attempts + 1;
    // Stay pending while retries remain; flip failed only when exhausted.
    return attempts >= MAX_ATTEMPTS_PER_ITEM
      ? { ...i, status: 'failed' as const, attempts, errorCode: result.errorCode }
      : { ...i, attempts, errorCode: result.errorCode };
  });
  const done = items.every((i) => i.status !== 'pending');
  return {
    ...state,
    items,
    phase: done && state.cartDone ? 'complete' : state.phase === 'idle' ? 'product' : state.phase,
    step: state.step + 1,
    updatedAt: new Date().toISOString(),
  };
}

/** Resume guard: a completed crawl must never re-run (no duplicate work). */
export function assertResumable(state: CrawlState): void {
  if (state.phase === 'complete') {
    throw new Error('Crawl already complete; refusing to restart (no duplicate snapshots).');
  }
}
