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
 * D-19 amends D-01 with exactly one exception: the post-crawl
 * shipment quote, a read-only POST to the fixed endpoint
 * (SHIPMENT_API_URL) with the fixed body (SHIPMENT_API_BODY),
 * delegated to the tab's main world. It returns per-package
 * pricing and does not modify the cart.
 * D-02: every fetch target passes the *.digikala.com guard (digikalaFetch).
 */
import type { ComparisonItem, Snapshot, Settings } from '../shared/types';
import { DEFAULT_SETTINGS } from '../shared/types';
import type { DbFactory } from '../shared/storage/db';
import {
  deleteItem,
  getAllItems,
  putItem,
  putShipment,
  appendSnapshot,
} from '../shared/storage/db';
import { coerceSettings, type StorageAreaLike } from '../shared/settings/settings';
import { digikalaFetchJson, type RawFetch } from './fetch/digikala-fetch';
import { readShipmentRecord } from './readers/shipment';
import { readProductPayload, type ProductVariantView } from './readers/product';
import { productApiUrl, CART_API_URL, isDigikalaUrl } from './readers/url';
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
  /**
   * Delegated shipment-quote POST (D-19): the
   * extension's only POST, fixed to the quote
   * endpoint. Absent (or failing) leaves fees
   * as the product API reported them. Optional:
   * tests inject fakes; production passes
   * delegateShipmentQuote.
   */
  shipmentQuote?: (tabId: number) => Promise<unknown>;
  /**
   * The digikala tab a cart call runs in (D-30). The results page
   * has no session of its own, so the worker runs the apply flow's
   * cart calls in an OPEN digikala tab's main world - it never
   * opens one (a silent tab would be a surprise, and a fresh page
   * may still be hydrating). Production wires chrome.tabs.query;
   * tests inject a stub. Absent => no tab.
   */
  findCartTab?: () => Promise<number | undefined>;
  /** Delegated cart write: add one variant (D-30). */
  cartAdd?: (tabId: number, variantId: string) => Promise<unknown>;
  /** Delegated cart write: remove one row (D-30). */
  cartRemove?: (tabId: number, cartItemId: string) => Promise<unknown>;
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
  // A 401/403 must survive the message round trip: the results page
  // tells "signed out" from "no tab reachable" by it (D-30).
  const status = (e as { status?: unknown } | null)?.status;
  return {
    ok: false,
    errorCode: code,
    message: e instanceof Error ? e.message : String(e),
    ...(typeof status === 'number' ? { status } : {}),
  };
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
    const snapshot: Snapshot = buildSnapshot(view.productId, variant.variantId, label, [offer], {
      imageUrl: view.imageUrl,
    });
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
        const entries = cartViewsToEntries(cartItems);
        const { items } = mergeCartIntoItems(existing, entries);
        // D-24: the stored comparison set mirrors the
        // live cart exactly. Items the user removed
        // from the cart are dropped - the union merge
        // used to keep them forever, so their prices
        // accumulated into every later report. Locks
        // survive for items still in the cart.
        const cartKeys = new Set(entries.map((e) => `${e.productId}::${e.variantId}`));
        for (const item of existing) {
          const key = `${item.itemId.productId}::${item.itemId.variantId}`;
          if (!cartKeys.has(key)) {
            await deleteItem(deps.dbFactory, item.itemId);
          }
        }
        // The merge returns the union; only the
        // cart's entries belong in the store now.
        for (const item of items) {
          const key = `${item.itemId.productId}::${item.itemId.variantId}`;
          if (cartKeys.has(key)) {
            await putItem(deps.dbFactory, item);
          }
        }
        // Heartbeat: the first per-item progress only
        // lands after the first product fetch, which can
        // take seconds on a cold worker. Broadcast the
        // cart size immediately so the overlay leaves
        // "starting..." (live report 2026-10-09).
        deps.onProgress?.({
          kind: 'capture/progress',
          step: 1,
          total: cartItems.length,
          done: 0,
          failed: 0,
        });
        await syncBadge(deps);
      },
      onProduct: async (productId, variantId, raw) => {
        const view = readProductPayload(raw);
        // Live report 2026-10-08: the user deliberately
        // picked the most expensive vendor, yet the
        // optimizer had nothing cheaper to find - the
        // product payload carries EVERY in-stock variant
        // (each is a seller-offer with its own price and
        // fee), and the crawl stored only the cart's
        // current selection. Capture them all (D-17): one
        // snapshot per variant, append-only. The payload
        // is already fetched, so this costs no extra API
        // calls. T05 assembles the solver input from the
        // full per-product variant set.
        const inStock = view.variants.filter((v) => v.stockState === 'in-stock');
        if (inStock.length === 0) {
          return; // contained: recorded as done without offers
        }
        const current = inStock.find((v) => v.variantId === variantId);
        for (const variant of inStock) {
          const offer = normalizeVariantToOffer(view.productId, variant, {
            feeProvenance: 'page-visible',
          });
          const label = variantLabel(view.productId, variant.variantId, variant);
          const snapshot = buildSnapshot(view.productId, variant.variantId, label, [offer], {
            imageUrl: view.imageUrl,
          });
          await appendSnapshot(deps.dbFactory, snapshot);
          if (variant.variantId === variantId) {
            // The cart item tracks its own selection;
            // the alternatives live in the snapshot
            // store keyed by variant.
            await upsertItem(deps, view.productId, view.title, variantId, label, 1, snapshot);
          }
        }
        if (!current) {
          // The cart's selection is gone from the payload
          // (delisted or out of stock): the alternatives
          // are captured above; the item record keeps
          // its selection and prior snapshot.
          await upsertItem(deps, view.productId, view.title, variantId, variantId, 1);
        }
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

    // D-19: quote the real per-package shipping costs for
    // the whole cart (the product API's per-offer fee is
    // sometimes missing - the live cart's total then shows
    // as a gap). Contained: a failed quote leaves the
    // product-API fees in place, so the report stays
    // honest, just less exact. The quote is a read-only
    // POST to the fixed endpoint (see delegate.ts).
    if (tabId !== undefined && deps.shipmentQuote) {
      try {
        const json = await deps.shipmentQuote(tabId);
        const record = readShipmentRecord(json, (deps.now ?? (() => new Date()))().toISOString());
        if (record) {
          await putShipment(deps.dbFactory, record);
        }
      } catch (e) {
        console.error(
          `[dkopt] shipment quote failed (fees stay product-API): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    const itemCount = result.state.items.length;
    return {
      ok: true,
      kind: 'crawl-start',
      itemCount,
      done: result.done,
      failed: result.failed,
    };
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

// ---------------------------------------------------------------------------
// Cart calls for the apply flow (D-30)
// ---------------------------------------------------------------------------

/** The tab shape the picker needs (chrome.tabs.Tab compatible). */
export interface TabLike {
  id?: number;
  url?: string;
  discarded?: boolean;
}

/**
 * The digikala tab a cart call should run in (D-30). The cart page
 * wins (it is the page the user came from and its session is
 * live), then any www page, then any digikala host; discarded
 * tabs are skipped. Pure: the ordering is tested without chrome.
 * Returns undefined when nothing is open - the caller says so
 * instead of opening a tab.
 */
export function pickDigikalaTab(tabs: readonly TabLike[]): number | undefined {
  const rank = (url: string): number => {
    if (/^https:\/\/www\.digikala\.com\/cart(\/|$|\?)/.test(url)) return 0;
    if (/^https:\/\/www\.digikala\.com\//.test(url)) return 1;
    return 2;
  };
  let best: { id: number; rank: number } | null = null;
  for (const tab of tabs) {
    if (typeof tab.id !== 'number' || tab.discarded) continue;
    if (!isDigikalaUrl(tab.url ?? '')) continue;
    const r = rank(tab.url ?? '');
    if (best === null || r < best.rank) best = { id: tab.id, rank: r };
  }
  return best?.id;
}

/** The tab to run a cart call in, or the response that says why not. */
async function cartTabOr(deps: ControllerDeps): Promise<{ tabId: number } | CaptureResponse> {
  let tabId: number | undefined;
  try {
    tabId = await deps.findCartTab?.();
  } catch {
    tabId = undefined;
  }
  if (tabId === undefined) {
    return {
      ok: false,
      errorCode: 'NO_TAB',
      message: 'applying the plan needs digikala.com open in a browser tab',
    };
  }
  return { tabId };
}

/**
 * Cart read for preflight/undo (D-30): the raw payload, fetched in
 * a digikala tab's main world. No direct-fetch fallback - an
 * extension-origin cart call is exactly the bug this replaces
 * (D-16 evidence: that host 401s it).
 */
export async function handleCartRead(deps: ControllerDeps): Promise<CaptureResponse> {
  try {
    const target = await cartTabOr(deps);
    if ('ok' in target) return target;
    if (!deps.delegateFetch) {
      return { ok: false, errorCode: 'NO_TRANSPORT', message: 'fetch delegation is unavailable' };
    }
    const data = await deps.delegateFetch(target.tabId, CART_API_URL);
    return { ok: true, kind: 'cart-read', data };
  } catch (e) {
    return errResponse(e);
  }
}

/** Cart write: add one variant, in a digikala tab (D-30). */
export async function handleCartAdd(
  deps: ControllerDeps,
  variantId: string,
): Promise<CaptureResponse> {
  try {
    if (typeof variantId !== 'string' || variantId === '') {
      return { ok: false, errorCode: 'BAD_REQUEST', message: 'a variant id is required' };
    }
    const target = await cartTabOr(deps);
    if ('ok' in target) return target;
    if (!deps.cartAdd) {
      return { ok: false, errorCode: 'NO_TRANSPORT', message: 'the cart add is not wired' };
    }
    await deps.cartAdd(target.tabId, variantId);
    return { ok: true, kind: 'cart-add' };
  } catch (e) {
    return errResponse(e);
  }
}

/** Cart write: remove one row, in a digikala tab (D-30). */
export async function handleCartRemove(
  deps: ControllerDeps,
  cartItemId: string,
): Promise<CaptureResponse> {
  try {
    if (typeof cartItemId !== 'string' || cartItemId === '') {
      return { ok: false, errorCode: 'BAD_REQUEST', message: 'a cart item id is required' };
    }
    const target = await cartTabOr(deps);
    if ('ok' in target) return target;
    if (!deps.cartRemove) {
      return { ok: false, errorCode: 'NO_TRANSPORT', message: 'the cart removal is not wired' };
    }
    await deps.cartRemove(target.tabId, cartItemId);
    return { ok: true, kind: 'cart-remove' };
  } catch (e) {
    return errResponse(e);
  }
}
