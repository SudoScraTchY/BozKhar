/**
 * T03 crawl state machine + orchestrator tests, all with injected fakes
 * (no browser, no network). Etiquette audit per SDD 06 / NFR-07 / D-01:
 * sequential only, delay respected, closed scope, resume without duplicate
 * work, per-item failure containment, abort between pages.
 */
import { describe, expect, it } from 'vitest';
import { runCrawl, type CrawlDeps } from '../src/capture/crawl/orchestrator';
import {
  initialState,
  seedFromCart,
  markCartDone,
  recordItemResult,
  assertInScope,
  pendingItems,
  isComplete,
} from '../src/capture/crawl/state';
import type { CrawlState } from '../src/capture/crawl/state';
import type { CartItemView } from '../src/capture/readers/cart';

const CART_FIXTURE = {
  data: {
    cart_item: [
      {
        quantity: 1,
        product: { id: 111, url: { uri: '/product/dkp-111/x?variant_id=1111' } },
        seller: { id: 1, title: 'A' },
        price: { selling_price: 100000 },
      },
      {
        quantity: 2,
        product: { id: 222, url: { uri: '/product/dkp-222/x?variant_id=2222' } },
        seller: { id: 2, title: 'B' },
        price: { selling_price: 200000 },
      },
      {
        quantity: 1,
        product: { id: 333, url: { uri: '/product/dkp-333/x?variant_id=3333' } },
        seller: { id: 3, title: 'C' },
        price: { selling_price: 300000 },
      },
    ],
  },
};

function productPayload(ok = true) {
  return ok
    ? {
        data: {
          product: {
            id: 1,
            title_fa: 'x',
            variants: [
              {
                id: 1,
                seller: { id: 1, title: 's' },
                price: { selling_price: 10 },
                in_stock: true,
                shipment_methods: [
                  { providers: [{ shipping_mode: 'seller', price: { value: 1000 } }] },
                ],
              },
            ],
          },
        },
      }
    : { data: { message: 'broken' } };
}

/** Fake harness: records every call for etiquette assertions. */
function makeDeps(overrides: Partial<CrawlDeps> = {}, opts: { failItem?: string } = {}) {
  const calls: {
    fetched: string[];
    delays: number[];
    persisted: CrawlState[];
    products: string[];
    cartReads: number;
  } = {
    fetched: [],
    delays: [],
    persisted: [],
    products: [],
    cartReads: 0,
  };
  let persisted: CrawlState | null = null;
  const deps: CrawlDeps = {
    fetchJson: async (url) => {
      calls.fetched.push(url);
      if (url.includes('/checkout/v1/carts')) {
        calls.cartReads++;
        return CART_FIXTURE;
      }
      const productId = url.match(/\/products\/(\d+)\//)?.[1] ?? '';
      if (opts.failItem === productId) return productPayload(false);
      return productPayload(true);
    },
    delay: async (ms) => {
      calls.delays.push(ms);
    },
    persistState: async (s) => {
      persisted = structuredClone(s);
      calls.persisted.push(structuredClone(s));
    },
    loadState: async () => persisted,
    onCart: async () => {
      calls.cartReads = calls.cartReads; // no-op, counted via fetchJson
    },
    onProduct: async (_p, _v) => {
      void _p;
      void _v;
    },
    crawlDelayMs: 1500,
    ...overrides,
  };
  return { deps, calls };
}

const ITEM_URLS = [
  'https://api.digikala.com/product/v1/products/111/?variant_id=1111',
  'https://api.digikala.com/product/v1/products/222/?variant_id=2222',
  'https://api.digikala.com/product/v1/products/333/?variant_id=3333',
];

describe('T03 crawl state machine (pure reducer)', () => {
  it('seeds from cart without resetting or duplicating known items', () => {
    let s = initialState();
    s = seedFromCart(s, [
      { productId: '111', variantId: '1111' },
      { productId: '222', variantId: '2222' },
    ]);
    s = seedFromCart(s, [
      { productId: '222', variantId: '2222' },
      { productId: '333', variantId: '3333' },
    ]);
    expect(s.items).toHaveLength(3);
    expect(s.items.every((i) => i.status === 'pending')).toBe(true);
  });

  it('failed items stay pending until attempts are exhausted, then flip failed', () => {
    let s = initialState();
    s = seedFromCart(s, [{ productId: '1', variantId: '1' }]);
    s = recordItemResult(s, '1', '1', { ok: false, errorCode: 'NETWORK' });
    expect(s.items[0]?.status).toBe('pending'); // retry remains
    expect(s.items[0]?.attempts).toBe(1);
    s = recordItemResult(s, '1', '1', { ok: false, errorCode: 'NETWORK' });
    expect(s.items[0]?.status).toBe('failed');
    expect(s.items[0]?.errorCode).toBe('NETWORK');
    s = recordItemResult(s, '1', '1', { ok: true });
    expect(s.items[0]?.status).toBe('done');
  });

  it('closed scope: refuses non-Digikala and out-of-scope Digikala URLs', () => {
    let s = initialState();
    s = seedFromCart(s, [{ productId: '111', variantId: '1111' }]);
    expect(() => assertInScope(s, 'https://evil.com/product/v1/products/111/')).toThrow();
    expect(() =>
      assertInScope(s, 'https://api.digikala.com/product/v1/products/999/?variant_id=9999'),
    ).toThrow();
    expect(() => assertInScope(s, ITEM_URLS[0] ?? '')).not.toThrow();
  });

  it('completion requires cart done AND no pending items', () => {
    let s = initialState();
    expect(isComplete(s)).toBe(false);
    s = seedFromCart(s, [{ productId: '1', variantId: '1' }]);
    s = markCartDone(s);
    expect(isComplete(s)).toBe(false);
    s = recordItemResult(s, '1', '1', { ok: true });
    expect(isComplete(s)).toBe(true);
  });
});

describe('T03 orchestrator etiquette (injected fakes)', () => {
  it('crawls sequentially: cart first, then every item, with delay before each step', async () => {
    const { deps, calls } = makeDeps();
    const result = await runCrawl(deps);

    expect(result.aborted).toBe(false);
    expect(result.done).toBe(3);
    expect(result.failed).toBe(0);
    // Delay before cart + before each of the 3 items = 4 delays, all 1500.
    expect(calls.delays).toEqual([1500, 1500, 1500, 1500]);
    // Fetch order: cart, then items in seeded order (sequential, never parallel).
    expect(calls.fetched[0]).toContain('/checkout/v1/carts');
    expect(calls.fetched.slice(1)).toEqual(ITEM_URLS);
    // State persisted after every step (cart + 3 items + completion).
    expect(calls.persisted.length).toBeGreaterThanOrEqual(4);
    expect(result.state.phase).toBe('complete');
  });

  it('per-item failure containment: broken item fails after bounded retry, others complete', async () => {
    const { deps, calls } = makeDeps({}, { failItem: '222' });
    const result = await runCrawl(deps);
    expect(result.done).toBe(2);
    expect(result.failed).toBe(1);
    const item222 = result.state.items.find((i) => i.productId === '222');
    expect(item222?.status).toBe('failed');
    expect(item222?.errorCode).toBe('STRUCTURE_UNRECOGNIZED');
    // Bounded retry: item 222 fetched twice (MAX_ATTEMPTS_PER_ITEM), others once.
    const count222 = calls.fetched.filter((u) => u.includes('/products/222/')).length;
    expect(count222).toBe(2);
    expect(calls.fetched.length).toBe(5); // cart(1) + 111(1) + 222(2 retries) + 333(1)
    expect(result.state.phase).toBe('complete');
  });

  it('resume: a persisted mid-crawl state skips done items, never re-fetches them', async () => {
    // Build a mid-crawl persisted state: cart done, item 111 done.
    const { deps, calls } = makeDeps();
    let midState = initialState();
    midState = seedFromCart(midState, [
      { productId: '111', variantId: '1111' },
      { productId: '222', variantId: '2222' },
      { productId: '333', variantId: '3333' },
    ]);
    midState = markCartDone(midState);
    midState = recordItemResult(midState, '111', '1111', { ok: true });

    const { deps: resumeDeps, calls: resumeCalls } = makeDeps({
      loadState: async () => midState,
    });
    const result = await runCrawl(resumeDeps);

    // No cart re-fetch (cartDone in persisted state).
    expect(resumeCalls.fetched.some((u) => u.includes('/checkout/v1/carts'))).toBe(false);
    // Only the two remaining items fetched, in order.
    expect(resumeCalls.fetched).toEqual(ITEM_URLS.slice(1));
    expect(result.done).toBe(3);
    expect(result.state.phase).toBe('complete');
    void deps;
    void calls;
  });

  it('completed crawl refuses to restart (no duplicate snapshots)', async () => {
    let done = initialState();
    done = seedFromCart(done, [{ productId: '1', variantId: '1' }]);
    done = markCartDone(done);
    done = recordItemResult(done, '1', '1', { ok: true });
    done = { ...done, phase: 'complete' };

    const { deps } = makeDeps({ loadState: async () => done });
    await expect(runCrawl(deps)).rejects.toThrow(/already complete/);
  });

  it('abort is honored between pages: nothing fetched after the abort flag', async () => {
    let fetchCount = 0;
    const base = makeDeps();
    const { deps, calls } = base;
    const wrappedFetch: CrawlDeps['fetchJson'] = async (url) => {
      fetchCount++;
      calls.fetched.push(url);
      return url.includes('/checkout/v1/carts') ? CART_FIXTURE : productPayload(true);
    };
    const result = await runCrawl({
      ...deps,
      fetchJson: wrappedFetch,
      shouldAbort: () => fetchCount >= 2,
    });

    expect(result.aborted).toBe(true);
    // Cart + exactly one item, then stop.
    expect(calls.fetched).toHaveLength(2);
    expect(result.state.items.filter((i) => i.status === 'pending')).toHaveLength(2);
  });

  it('progress reports monotonic step counts', async () => {
    const progress: Array<{ step: number; done: number; failed: number }> = [];
    const { deps } = makeDeps({
      onProgress: (p) => progress.push({ step: p.step, done: p.done, failed: p.failed }),
    });
    await runCrawl(deps);
    expect(progress.length).toBe(3);
    expect(progress[2]?.done).toBe(3);
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i]?.step ?? 0).toBeGreaterThan(progress[i - 1]?.step ?? 0);
    }
  });

  it('D-01 audit: the orchestrator only ever GETs - fetch is the sole network surface', async () => {
    const { deps, calls } = makeDeps();
    await runCrawl(deps);
    // Every fetched URL is a read-only GET endpoint on Digikala APIs.
    for (const url of calls.fetched) {
      expect(url).toMatch(
        /^https:\/\/api\.digikala\.com\/(product\/v1\/products\/\d+\/\?variant_id=\d+|checkout\/v1\/carts)$/,
      );
      // No cart-mutation endpoints anywhere in the trace.
      expect(url).not.toMatch(/POST|PATCH|DELETE|order|payment/);
    }
  });
});

describe('T03 cart view -> scope seeding (integration shape)', () => {
  it('cart items become exactly the crawl scope', () => {
    const items: CartItemView[] = [
      {
        productId: '111',
        variantId: '1111',
        title: 'x',
        quantity: 1,
        sellerId: '1',
        sellerName: 'A',
        priceRial: 1,
        feeRial: null,
        feeIsKnownFree: false,
        sourceUrl: null,
      },
      {
        productId: '222',
        variantId: null,
        title: 'y',
        quantity: 1,
        sellerId: '2',
        sellerName: 'B',
        priceRial: 1,
        feeRial: null,
        feeIsKnownFree: false,
        sourceUrl: null,
      },
    ];
    let s = initialState();
    s = seedFromCart(
      s,
      items.map((i) => ({ productId: i.productId, variantId: i.variantId ?? '' })),
    );
    // Variant-less item is not crawlable by deep link - excluded from scope.
    expect(s.items).toHaveLength(1);
    expect(pendingItems(s)).toHaveLength(1);
  });
});
