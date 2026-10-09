/**
 * Service-worker controller tests: PDP capture end-to-end into storage,
 * crawl wiring over fixtures (progress/abort/resume), badge, and the D-01
 * fetch audit across the whole controller surface.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  handleCapturePdp,
  handleCrawlStart,
  handleCrawlAbort,
  syncBadge,
  type ControllerDeps,
} from '../src/capture/sw-controller';
import { getAllItems, getSnapshotsForItem } from '../src/shared/storage/db';
import { readCartPayload } from '../src/capture/readers/cart';
import type { CaptureProgressMessage } from '../src/capture/messaging';
import type { CrawlState } from '../src/capture/crawl/state';

import productBasic from './fixtures/capture/product-basic.json';
import cartBasic from './fixtures/capture/cart-basic.json';

function jsonRes(body: unknown): Response {
  return { ok: true, status: 200, json: async () => body } as unknown as Response;
}

interface Opts {
  delayMs?: number;
  state?: CrawlState | null;
}

function makeDeps(opts: Opts = {}): ControllerDeps & {
  fetchCalls: Array<{ url: string; method: string | undefined }>;
  progress: CaptureProgressMessage[];
  badgeTexts: string[];
  savedStates: CrawlState[];
} {
  const fetchCalls: Array<{ url: string; method: string | undefined }> = [];
  const progress: CaptureProgressMessage[] = [];
  const badgeTexts: string[] = [];
  const savedStates: CrawlState[] = [];
  const dbFactory = new IDBFactory();
  const areaBag: Record<string, unknown> = {};
  if (opts.state) areaBag['crawlState'] = opts.state;
  const area = {
    get: async (keys?: string | string[] | null) => {
      const out: Record<string, unknown> = {};
      const wanted = keys == null ? Object.keys(areaBag) : typeof keys === 'string' ? [keys] : keys;
      for (const k of wanted) if (k in areaBag) out[k] = structuredClone(areaBag[k]);
      return out;
    },
    set: async (items: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(items)) areaBag[k] = structuredClone(v);
    },
    clear: async () => {
      for (const k of Object.keys(areaBag)) delete areaBag[k];
    },
  };
  return {
    dbFactory,
    settingsArea: area,
    stateArea: area,
    fetch: (async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, method: init?.method ?? 'GET' });
      const cartPath = '/checkout/v1/carts';
      if (url.includes(cartPath) && !url.includes('mini')) return jsonRes(cartBasic);
      if (url.includes('/products/')) return jsonRes(productBasic);
      throw new Error(`unexpected fetch ${url}`);
    }) as ControllerDeps['fetch'],
    now: () => new Date('2026-10-06T10:00:00Z'),
    delay: async () => {},
    onProgress: (m) => progress.push(m),
    badge: { setBadgeText: (t) => badgeTexts.push(t.text) },
    fetchCalls,
    progress,
    badgeTexts,
    savedStates,
  };
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

describe('handleCapturePdp (T03.4 wiring)', () => {
  // Fixture ids (tests/fixtures/capture/product-basic.json): product
  // 16622211 with variants 62270876..79.
  const PID = '16622211';
  const VID = '62270876';

  it('fetches the product API, normalizes, and appends snapshot + item', async () => {
    const deps = makeDeps();
    const res = await handleCapturePdp(deps, PID, VID);
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'pdp') return fail('expected pdp response');

    // The response names the variant and the offer count (toast payload).
    expect(res.variantLabel).toBe(VID);
    expect(res.offerCount).toBeGreaterThanOrEqual(1);

    const snaps = await getSnapshotsForItem(deps.dbFactory, {
      productId: PID,
      variantId: VID,
    });
    expect(snaps).toHaveLength(1);
    expect(snaps[0]?.extractorVersion).toBeDefined();
    expect(snaps[0]?.offers[0]?.delivery.provenance).toBe('page-visible');

    const items = await getAllItems(deps.dbFactory);
    expect(items).toHaveLength(1);
    expect(items[0]?.latestSnapshotId).toBe(snaps[0]?.snapshotId);

    // Badge reflects the list size after capture.
    expect(deps.badgeTexts.at(-1)).toBe('1');
  });

  it('returns NO_OFFERS when the payload has no usable variant at all', async () => {
    const base = makeDeps();
    const deps: ControllerDeps = {
      ...base,
      fetch: (async () => {
        return jsonRes({ data: { product: { id: 16622211, title_fa: 'x', variants: [] } } });
      }) as ControllerDeps['fetch'],
    };
    const res = await handleCapturePdp(deps, PID, '');
    expect(res).toMatchObject({ ok: false, errorCode: 'NO_OFFERS' });
  });

  it('resolves the variant from the payload when the caller sends an empty id', async () => {
    const deps = makeDeps();
    // Fixture has no ?variant_id= => SW picks the first IN-STOCK variant.
    const res = await handleCapturePdp(deps, PID, '');
    expect(res.ok).toBe(true);
    if (!res.ok || res.kind !== 'pdp') return fail('expected pdp response');
    expect(res.variantLabel).toBe('62270876'); // first in-stock in fixture
    const items = await getAllItems(deps.dbFactory);
    expect(items[0]?.itemId.variantId).toBe('62270876');
  });

  it('D-01 audit: PDP capture issues GET only, against api.digikala.com', async () => {
    const deps = makeDeps();
    await handleCapturePdp(deps, PID, VID);
    for (const c of deps.fetchCalls) {
      expect(c.method).toBe('GET');
      expect(new URL(c.url).hostname.endsWith('.digikala.com')).toBe(true);
    }
  });
});

describe('handleCrawlStart (T03.6 wiring)', () => {
  it('runs the crawl from the fixture cart and stores snapshots', async () => {
    const deps = makeDeps();
    // Read the fixture cart to know how many items the orchestrator seeds.
    const cartItems = readCartPayload(cartBasic);
    const res = await handleCrawlStart(deps);
    expect(res.ok).toBe(true);

    const items = await getAllItems(deps.dbFactory);
    expect(items.length).toBeGreaterThanOrEqual(cartItems.length);
    // Progress broadcast happened; finished flag present at the end.
    const last = deps.progress.at(-1);
    expect(last?.finished).toBe(true);
    // Crawl state persisted after steps (R-08): the final phase is readable
    // from the injected storage area.
    const saved = await deps.stateArea?.get('crawlState');
    expect((saved?.['crawlState'] as CrawlState | undefined)?.phase).toBe('complete');
  });

  it('captures every in-stock variant, not just the cart selection (D-17)', async () => {
    // Live report 2026-10-08: the user deliberately
    // picked the most expensive vendor; the optimizer
    // needs the cheaper alternatives in the snapshot
    // store. The fixture cart selects variant 62270876
    // (seller الف); the fixture product has 3 in-stock
    // variants and one out-of-stock (62270879 - the
    // cheapest, but unavailable, so it must NOT be
    // captured).
    const deps = makeDeps();
    await handleCrawlStart(deps);
    const selected = await getSnapshotsForItem(deps.dbFactory, {
      productId: '16622211',
      variantId: '62270876',
    });
    expect(selected.length).toBeGreaterThan(0);
    for (const sibling of ['62270877', '62270878']) {
      const snaps = await getSnapshotsForItem(deps.dbFactory, {
        productId: '16622211',
        variantId: sibling,
      });
      expect(snaps.length).toBeGreaterThan(0);
      expect(snaps.at(-1)?.offers.length).toBe(1);
    }
    const unavailable = await getSnapshotsForItem(deps.dbFactory, {
      productId: '16622211',
      variantId: '62270879',
    });
    expect(unavailable.length).toBe(0);
  });

  it('resumes a persisted non-complete state without re-fetching done items', async () => {
    const cartItems = readCartPayload(cartBasic);
    const first = cartItems[0];
    if (!first?.variantId) return fail('fixture must carry a variant id');
    const resumed: CrawlState = {
      phase: 'product',
      cartDone: true,
      items: [
        { productId: first.productId, variantId: first.variantId, status: 'done', attempts: 1 },
      ],
      step: 2,
      updatedAt: '2026-10-06T09:00:00Z',
    };
    const deps = makeDeps({ state: resumed });
    await handleCrawlStart(deps);
    // Cart endpoint must NOT be re-fetched when cartDone.
    expect(deps.fetchCalls.some((c) => c.url.includes('/carts'))).toBe(false);
  });

  it('abort is honored: after handleCrawlAbort the crawl stops between pages', async () => {
    const deps = makeDeps();
    handleCrawlAbort();
    const res = await handleCrawlStart(deps);
    expect(res.ok).toBe(true);
    const last = deps.progress.at(-1);
    expect(last?.aborted).toBe(true);
    // The abort latch must not leak into the next crawl.
    const deps2 = makeDeps();
    const res2 = await handleCrawlStart(deps2);
    expect(res2.ok).toBe(true);
    expect(deps2.progress.at(-1)?.aborted).toBe(false);
  });

  it('D-01 audit across the crawl: every fetch is GET to a digikala host', async () => {
    const deps = makeDeps();
    await handleCrawlStart(deps);
    expect(deps.fetchCalls.length).toBeGreaterThan(0);
    for (const c of deps.fetchCalls) {
      expect(c.method).toBe('GET');
      expect(new URL(c.url).hostname.endsWith('.digikala.com')).toBe(true);
    }
  });
});

describe('syncBadge', () => {
  it('sets the badge to the list size and clears it when empty', async () => {
    const deps = makeDeps();
    expect(await syncBadge(deps)).toBe(0);
    expect(deps.badgeTexts.at(-1)).toBe('');
    await handleCapturePdp(deps, '16622211', '62270876');
    expect(await syncBadge(deps)).toBe(1);
  });
});

describe('handleCrawlStart: fetch delegation (D-16)', () => {
  it('delegates every crawl fetch to the content script on the requesting tab', async () => {
    const deps = makeDeps();
    const delegated: Array<{ tabId: number; url: string }> = [];
    const delegateFetch = async (tabId: number, url: string) => {
      delegated.push({ tabId, url });
      if (url.includes('/checkout/v1/carts')) return cartBasic;
      return productBasic;
    };
    const res = await handleCrawlStart({ ...deps, delegateFetch }, 42);
    expect(res.ok).toBe(true);

    // Cart + per-product fetches all went through the delegate.
    expect(delegated.length).toBeGreaterThan(0);
    for (const d of delegated) expect(d.tabId).toBe(42);
    expect(delegated.some((d) => d.url.includes('/checkout/v1/carts'))).toBe(true);
    // The SW's own fetch is bypassed while the content script serves.
    expect(deps.fetchCalls).toHaveLength(0);

    // The crawl still completes and persists state.
    const items = await getAllItems(deps.dbFactory);
    expect(items.length).toBeGreaterThanOrEqual(readCartPayload(cartBasic).length);
    const saved = await deps.stateArea?.get('crawlState');
    expect((saved?.['crawlState'] as CrawlState | undefined)?.phase).toBe('complete');
  });

  it('falls back to the SW fetch when the content script is unreachable', async () => {
    const deps = makeDeps();
    const res = await handleCrawlStart(
      {
        ...deps,
        delegateFetch: async () => {
          throw new Error('Could not establish connection');
        },
      },
      42,
    );
    expect(res.ok).toBe(true);
    expect(deps.fetchCalls.length).toBeGreaterThan(0);
    for (const c of deps.fetchCalls) expect(c.method).toBe('GET');
  });

  it('uses the SW fetch directly when no tab requested the crawl', async () => {
    const deps = makeDeps();
    const delegateFetch = vi.fn(async () => cartBasic);
    await handleCrawlStart({ ...deps, delegateFetch });
    expect(delegateFetch).not.toHaveBeenCalled();
    expect(deps.fetchCalls.length).toBeGreaterThan(0);
  });
});

function fail(msg: string): never {
  throw new Error(msg);
}

describe('handleCrawlStart: shipment quote (D-19)', () => {
  const quoteResponse = {
    status: 200,
    data: {
      shipment_types: {
        normal: [
          {
            shipment_id: 'b8d1bf_1_23',
            submit_types: [{ id: 16, shipping_cost: 1200000 }],
            cart_items: [
              {
                id: 259702067,
                quantity: 1,
                variant: { id: 62270876 },
                product: { id: 1000001 },
              },
            ],
          },
        ],
      },
    },
  };

  it('stores the quoted package fees with the crawl', async () => {
    const deps = makeDeps();
    const shipmentQuote = vi.fn(async () => quoteResponse);
    const res = await handleCrawlStart({ ...deps, shipmentQuote }, 42);
    expect(res.ok).toBe(true);
    expect(shipmentQuote).toHaveBeenCalledWith(42);

    const { getShipment } = await import('../src/shared/storage/db');
    const record = await getShipment(deps.dbFactory);
    expect(record).not.toBeNull();
    expect(record?.key).toBe('latest');
    expect(record?.packages).toHaveLength(1);
    expect(record?.packages[0]).toEqual({
      shipmentId: 'b8d1bf_1_23',
      shippingCost: 1200000,
      items: [{ productId: '1000001', variantId: '62270876' }],
    });
  });

  it('a failed quote is contained: the crawl still succeeds', async () => {
    const deps = makeDeps();
    const shipmentQuote = vi.fn(async () => {
      throw new Error('quote unreachable');
    });
    const res = await handleCrawlStart({ ...deps, shipmentQuote }, 42);
    // The crawl itself completed; the fee
    // correction simply did not happen.
    expect(res.ok).toBe(true);
    const { getShipment } = await import('../src/shared/storage/db');
    expect(await getShipment(deps.dbFactory)).toBeNull();
  });

  it('no quote dep (or no tab): nothing is stored, crawl unaffected', async () => {
    const deps = makeDeps();
    const res = await handleCrawlStart(deps, 42);
    expect(res.ok).toBe(true);
    const { getShipment } = await import('../src/shared/storage/db');
    expect(await getShipment(deps.dbFactory)).toBeNull();
  });

  it('a quote without packages stores nothing', async () => {
    const deps = makeDeps();
    const shipmentQuote = vi.fn(async () => ({ status: 200, data: {} }));
    const res = await handleCrawlStart({ ...deps, shipmentQuote }, 42);
    expect(res.ok).toBe(true);
    const { getShipment } = await import('../src/shared/storage/db');
    expect(await getShipment(deps.dbFactory)).toBeNull();
  });
});
