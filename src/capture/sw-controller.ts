/**
 * Service-worker capture controller (SDD 06 components 1-3 wiring).
 *
 * Owns: PDP capture (fetch -> read -> normalize -> append-only storage),
 * the crawl lifecycle (start/abort/progress over the orchestrator), the
 * toolbar badge, and crawl-state persistence in chrome.storage.local
 * (R-08: survives MV3 restarts; a completed crawl re-opens FRESH on the
 * next explicit start, so re-optimizing never hits the resume guard).
 *
 * D-01: this controller only ever GETs; no cart write calls exist here.
 * D-02: every fetch target passes the *.digikala.com guard (digikalaFetch).
 */
import type { ComparisonItem, Snapshot, Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import type { DbFactory } from '../shared/storage/db';
import { getAllItems, putItem, appendSnapshot } from '../shared/storage/db';
import { coerceSettings, type StorageAreaLike } from '../shared/settings/settings';
import { digikalaFetchJson, type RawFetch } from './fetch/digikala-fetch';
import { readProductPayload, type ProductVariantView } from './readers/product';
import { productApiUrl } from './readers/url';
import { normalizeVariantToOffer, buildSnapshot } from './normalize';
import { cartViewsToEntries, mergeCartIntoItems } from './cart-merge';
import { runCrawl } from './crawl/orchestrator';
import { initialState, type CrawlState } from './crawl/state';
import type { CaptureProgressMessage, CaptureResponse } from './messaging';

export const CRAWL_STATE_KEY = 'crawlState';

/** Settings area with fallback defaults when storage is unavailable. */
async function loadSettingsSafe(area?: StorageAreaLike): Promise<Settings> {
  if (!area) return { ...DEFAULT_SETTINGS };
  try {
    return await (async () => {
      const bag = await area.get('settings');
      return coerceSettings(bag['settings']);
    })();
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** Injectable world surface - everything a test needs to fake. */
export interface ControllerDeps {
  dbFactory: DbFactory;
  /** chrome.storage.local; optional so node tests can omit it. */
  settingsArea?: StorageAreaLike;
  /** Crawl-state persistence area; optional, falls back to settingsArea. */
  stateArea?: StorageAreaLike;
  fetch: RawFetch;
  /**
   * Delegates a GET to the content script on a tab (D-16: the
   * checkout API 401s fetches without the site's routing
   * header set, which only the page context sends). Optional:
   * tests inject fakes; production passes delegateFetchJson.
   */
  delegateFetch?: (tabId: number, url: string) => Promise<unknown>;
  now?: () => Date;
  /** Sleep between crawl steps; injectable so tests run instantly. */
  delay?: (ms: number) => Promise<void>;
  onProgress?: (msg: CaptureProgressMessage) => void;
  /** Badge surface (chrome.action); optional in tests. */
  badge?: { setBadgeText(text: { text: string }): void };
}

function errResponse(e: unknown): CaptureResponse {
  const code =
    e instanceof Error && 'code' in e ? String((e as { code: unknown }).code) : 'UNKNOWN';
  return { ok: false, errorCode: code, message: e instanceof Error ? e.message : String(e) };
}

/**
 * PDP capture: the content script asked; the SW fetches with the user's
 * session, normalizes, and appends the snapshot (never overwrites - SDD 08).
 * Variant resolution: an empty variantId (no ?variant_id= in the URL) is
 * resolved from the payload - first in-stock variant (see comment below).
 */
export async function handleCapturePdp(
  deps: ControllerDeps,
  productId: string,
  variantId: string,
): Promise<CaptureResponse> {
  try {
    const url = productApiUrl(productId, variantId);
    const raw = await digikalaFetchJson(url, { fetch: deps.fetch });
    const view = readProductPayload(raw);
    // Variant resolution (live smoke finding): an empty variantId (no
    // ?variant_id= in the browsed PDP URL) does NOT fail. The product payload
    // is the source of variant truth: the first IN-STOCK variant is captured
    // and the response names it, so the toast stays honest (D-05, S-2/S-7).
    const variant: ProductVariantView | undefined =
      view.variants.find((v) => v.variantId === variantId) ??
      view.variants.find((v) => v.stockState === 'in-stock') ??
      view.variants[0];
    if (!variant) {
      return {
        ok: false,
        errorCode: 'NO_OFFERS',
        message: `no usable variant in payload for product ${productId}`,
      };
    }
    const label = variantLabel(view.productId, variant.variantId, variant);
    const offer = normalizeVariantToOffer(view.productId, variant, {
      feeProvenance: 'page-visible',
    });
    const snapshot: Snapshot = buildSnapshot(view.productId, variant.variantId, label, [offer]);
    await appendSnapshot(deps.dbFactory, snapshot);
    await upsertItem(deps, view.productId, view.title, variant.variantId, label, 1, snapshot);
    await syncBadge(deps);
    return {
      ok: true,
      kind: 'pdp',
      snapshotId: snapshot.snapshotId,
      offerCount: snapshot.offers.length,
      variantLabel: label,
    };
  } catch (e) {
    return errResponse(e);
  }
}

function variantLabel(_productId: string, variantId: string, _v: ProductVariantView): string {
  // The payload does not carry per-variant display labels; the id is the
  // honest label (D-05: titles are display data, never identity).
  return variantId;
}

async function upsertItem(
  deps: ControllerDeps,
  productId: string,
  title: string,
  variantId: string,
  variantLabelText: string,
  quantity: number,
  snapshot?: Snapshot,
): Promise<void> {
  const existing = await getAllItems(deps.dbFactory);
  const prior = existing.find(
    (i) => i.itemId.productId === productId && i.itemId.variantId === variantId,
  );
  const item: ComparisonItem = prior
    ? { ...prior, latestSnapshotId: snapshot?.snapshotId ?? prior.latestSnapshotId }
    : {
        itemId: { productId, variantId },
        product: { id: productId, title },
        variant: { id: variantId, label: variantLabelText || variantId },
        quantity,
        lock: { mode: 'none', vendorIds: [] },
        addedAt: (deps.now ?? (() => new Date()))().toISOString(),
        latestSnapshotId: snapshot?.snapshotId,
      };
  await putItem(deps.dbFactory, item);
}

/**
 * Builds the crawl's fetch function (D-16): with a content-script
 * tab available, fetches are delegated to it (page context carries
 * the site's routing header set, which the checkout API requires);
 * when the content script is unreachable - tab closed or navigated
 * off digikala - the SW's own session fetch is the fallback (it
 * serves the product API fine; the cart API may 401, which the
 * orchestrator contains per crawl).
 */
function buildFetchJson(deps: ControllerDeps, tabId?: number): (url: string) => Promise<unknown> {
  const direct = (url: string) => digikalaFetchJson(url, { fetch: deps.fetch });
  if (tabId === undefined || !deps.delegateFetch) return direct;
  return async (url: string) => {
    try {
      return await deps.delegateFetch?.(tabId, url);
    } catch (e) {
      // Diagnosability (live testing 2026-10-08):
      // the direct fallback 401s silently, so the
      // real delegation failure must be visible in
      // the service worker console.
      console.error(
        `[dkopt] fetch delegation failed (falling back to direct fetch): ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return direct(url);
    }
  };
}

/** Toolbar badge = comparison-list size (09 Surface 1). */
export async function syncBadge(deps: ControllerDeps): Promise<number> {
  const items = await getAllItems(deps.dbFactory);
  deps.badge?.setBadgeText({ text: items.length > 0 ? String(items.length) : '' });
  return items.length;
}

interface AreaGet {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

async function loadCrawlState(area: AreaGet | undefined): Promise<CrawlState | null> {
  if (!area) return null;
  const bag = await area.get(CRAWL_STATE_KEY);
  const raw = bag[CRAWL_STATE_KEY];
  return raw && typeof raw === 'object' ? (raw as CrawlState) : null;
}

async function saveCrawlState(area: AreaSet | undefined, state: CrawlState): Promise<void> {
  if (!area) return;
  await area.set({ [CRAWL_STATE_KEY]: state });
}

type AreaSet = { set(items: Record<string, unknown>): Promise<void> };

/**
 * Starts (or resumes) the cart crawl. A completed prior crawl opens FRESH:
 * the user explicitly asked again, and append-only snapshots make a rerun
 * duplicate-free by construction (new snapshotIds include the timestamp).
 *
 * `tabId` is the tab that requested the crawl (its content script executes
 * the delegated fetches; D-16). Without it the SW falls back to its own
 * fetch, which works for the product API but may 401 on the cart API.
 */
export async function handleCrawlStart(
  deps: ControllerDeps,
  tabId?: number,
): Promise<CaptureResponse> {
  const area: AreaGet | undefined = deps.stateArea ?? deps.settingsArea;
  if (crawlRunning) {
    return { ok: false, errorCode: 'CRAWL_RUNNING', message: 'a crawl is already in progress' };
  }
  crawlRunning = true;
  try {
    const settings = await loadSettingsSafe(deps.settingsArea);
    const persisted = await loadCrawlState(area);
    const state: CrawlState =
      persisted && persisted.phase !== 'complete' ? persisted : initialState();

    const result = await runCrawl({
      fetchJson: buildFetchJson(deps, tabId),
      delay: deps.delay ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms))),
      crawlDelayMs: settings.crawlDelayMs,
      persistState: (s) => saveCrawlState(area, s),
      loadState: async () => state,
      onCart: async (cartItems) => {
        const existing = await getAllItems(deps.dbFactory);
        const { items } = mergeCartIntoItems(existing, cartViewsToEntries(cartItems));
        for (const item of items) await putItem(deps.dbFactory, item);
        await syncBadge(deps);
      },
      onProduct: async (productId, variantId, raw) => {
        const view = readProductPayload(raw);
        const variant = view.variants.find((v) => v.variantId === variantId);
        if (!variant) return; // contained: recorded as done without offers
        const offer = normalizeVariantToOffer(view.productId, variant, {
          feeProvenance: 'page-visible',
        });
        const snapshot = buildSnapshot(view.productId, variantId, variantId, [offer]);
        await appendSnapshot(deps.dbFactory, snapshot);
        await upsertItem(deps, view.productId, view.title, variantId, variantId, 1, snapshot);
      },
      shouldAbort: () => abortRequested,
      onProgress: (p) => deps.onProgress?.({ kind: 'capture/progress', ...p }),
    });

    deps.onProgress?.({
      kind: 'capture/progress',
      step: result.state.step,
      total: result.state.items.length,
      done: result.done,
      failed: result.failed,
      finished: true,
      aborted: result.aborted,
    });

    const itemCount = result.state.items.length;
    return { ok: true, kind: 'crawl-start', itemCount };
  } catch (e) {
    return errResponse(e);
  } finally {
    // Reset the latch when THIS crawl ends, so an abort requested before or
    // during it is honored, but never leaks into the next crawl.
    crawlRunning = false;
    resetAbort();
  }
}

let abortRequested = false;
let crawlRunning = false;

/** Abort is cooperative: polled between pages by the orchestrator. */
export function handleCrawlAbort(): CaptureResponse {
  abortRequested = true;
  return { ok: true, kind: 'crawl-abort' };
}

/** Resets the abort latch before a start (kept internal to the pair). */
export function resetAbort(): void {
  abortRequested = false;
}
