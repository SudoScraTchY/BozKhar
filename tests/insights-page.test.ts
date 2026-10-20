/**
 * @vitest-environment jsdom
 *
 * Order Insights page: nothing is fetched on boot, the explicit read
 * renders the summary, errors are actionable, abort keeps what arrived,
 * deep details merge in, and every control re-aggregates locally.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InsightsListResponse, InsightsTabsResponse } from '../src/insights/api';
import type { InsightsClient } from '../src/insights/client';
import { createInsightsPage, type InsightsPageDeps } from '../src/insights/page';
import type { SyncCacheWriter } from '../src/insights/sync';
import type {
  InsightItem,
  InsightOrder,
  InsightSnapshot,
  InsightTabs,
} from '../src/insights/types';
import { emptySnapshot } from '../src/insights/types';
import { DEFAULT_SETTINGS } from '../src/shared/types';

const NOW = 1_760_000_000_000;
const DAY = 2_460_954; // 1404/08/13

function order(id: number, extra: Partial<InsightOrder> = {}): InsightOrder {
  return {
    orderId: id,
    status: 'sent',
    statusFa: 'تحویل شده',
    createdText: '13 آبان 1404',
    createdDay: DAY,
    payableRial: 100_000,
    paidRial: 100_000,
    refundRial: null,
    shippingRial: 0,
    discountRial: 0,
    totalCostRial: 100_000,
    detailFetchedAt: null,
    ...extra,
  };
}

function item(extra: Partial<InsightItem> = {}): InsightItem {
  return {
    productId: 1,
    titleFa: '',
    brand: null,
    categories: [],
    sellerId: null,
    sellerName: null,
    sellerRating: null,
    quantity: 1,
    returnedQuantity: 0,
    cancelledQuantity: 0,
    unitRial: 100_000,
    rrpRial: null,
    discountPercent: null,
    ...extra,
  };
}

function snapshot(orders: InsightOrder[], extra: Partial<InsightSnapshot> = {}): InsightSnapshot {
  return { ...emptySnapshot(), orders, syncedAt: NOW, ...extra };
}

function tabs(extra: Partial<InsightTabs> = {}): InsightTabs {
  return { in_progress: 0, sent: 0, cancelled: 0, returned: 0, ...extra };
}

function tabsOk(value: InsightTabs): InsightsTabsResponse {
  return { ok: true, kind: 'insights/tabs', data: value, transport: 'direct' };
}

function listOk(orders: InsightOrder[], page = 1, totalPages = 1): InsightsListResponse {
  return {
    ok: true,
    kind: 'insights/list',
    data: { orders, page, totalPages, totalItems: orders.length },
    transport: 'direct',
  };
}

function fakeClient(overrides: Partial<InsightsClient> = {}): InsightsClient {
  return {
    tabs: vi.fn(async () => tabsOk(tabs())),
    list: vi.fn(async () => listOk([])),
    detail: vi.fn(async () => {
      throw new Error('detail not expected');
    }),
    preferredTransport: undefined,
    ...overrides,
  };
}

function makeDeps(
  initial: InsightSnapshot,
  client: InsightsClient,
): InsightsPageDeps & { state: () => InsightSnapshot } {
  let current = initial;
  const cache: SyncCacheWriter = {
    saveOrders: vi.fn(async (orders) => {
      const byId = new Map(current.orders.map((order) => [order.orderId, order]));
      for (const order of orders) byId.set(order.orderId, order);
      current = { ...current, orders: [...byId.values()] };
    }),
    saveDetail: vi.fn(async (order, items: InsightItem[], shipments) => {
      current = {
        ...current,
        orders: current.orders.map((row) => (row.orderId === order.orderId ? { ...order } : row)),
        itemsByOrder: { ...current.itemsByOrder, [order.orderId]: items },
        shipmentsByOrder: { ...current.shipmentsByOrder, [order.orderId]: shipments },
      };
    }),
    saveMeta: vi.fn(async (value, at) => {
      current = { ...current, tabs: value, syncedAt: at };
    }),
    prune: vi.fn(async () => 0),
  };

  return {
    getSnapshot: vi.fn(async () => current),
    cache,
    clearCache: vi.fn(async () => {
      current = emptySnapshot();
    }),
    loadSettings: vi.fn(async () => ({ ...DEFAULT_SETTINGS })),
    saveSettings: vi.fn(async () => undefined),
    send: vi.fn(),
    openDigikala: vi.fn(),
    now: () => NOW,
    client,
    state: () => current,
  };
}

async function mount(deps: InsightsPageDeps): Promise<void> {
  document.body.innerHTML = '<main id="app"></main>';
  const page = createInsightsPage(deps);
  await page.run();
}

function buttonByText(text: string): HTMLButtonElement | undefined {
  return [...document.querySelectorAll('button')].find((node) => node.textContent?.includes(text));
}

async function waitFor(predicate: () => boolean, timeout = 2500): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('page did not reach the expected state');
}

function statValue(label: string): string | undefined {
  const card = [...document.querySelectorAll('.bk-stat')].find(
    (node) => node.querySelector('.bk-stat-label')?.textContent === label,
  );
  return card?.querySelector('.bk-stat-value')?.textContent ?? undefined;
}

beforeEach(() => {
  document.body.innerHTML = '';
  window.confirm = vi.fn(() => true);
});

describe('boot and empty state', () => {
  it('renders the empty state without fetching anything', async () => {
    const client = fakeClient();
    const deps = makeDeps(emptySnapshot(), client);
    await mount(deps);

    expect(document.querySelector('.bk-title')?.textContent).toBe('خریدهای من');
    expect(document.body.textContent).toContain('هنوز سفارشی خوانده نشده');
    expect(buttonByText('خواندن تاریخچهٔ سفارش‌ها')).toBeDefined();
    expect(client.tabs).not.toHaveBeenCalled();
    expect(client.list).not.toHaveBeenCalled();
    expect(deps.send).not.toHaveBeenCalled();
  });

  it('lists cancelled orders separately and keeps them out of totals', async () => {
    const cancelled = order(2, {
      status: 'cancelled',
      statusFa: 'لغوشده',
      paidRial: 900_000,
      totalCostRial: 900_000,
    });
    const items = {
      2: [
        item({
          productId: 9,
          quantity: 2,
          cancelledQuantity: 2,
          unitRial: 500_000,
          sellerName: 'فروشندهٔ لغوشده',
        }),
      ],
    };
    const deps = makeDeps(snapshot([order(1), cancelled], { itemsByOrder: items }), fakeClient());
    await mount(deps);

    expect(statValue('سفارش‌ها')).toBe('۱');
    expect(statValue('پرداخت خالص')).toBe('۱۰٬۰۰۰ تومان');
    expect(statValue('مبلغ سفارش‌های لغوشده')).toBe('۹۰٬۰۰۰ تومان');
    expect(document.body.textContent).toContain('سفارش‌های لغوشده');
    expect(document.body.textContent).toContain('۲ قلم');
    expect(document.querySelectorAll('.bk-order-row.is-cancelled')).toHaveLength(1);

    // The status chart marks the cancelled bar with its own colour.
    const charts = [...document.querySelectorAll('.bk-chart')]
      .map((node) => node.innerHTML)
      .join('');
    expect(charts).toContain('style="fill:#b42318"');
  });

  it('shows cached orders on open without a request', async () => {
    const client = fakeClient();
    const deps = makeDeps(snapshot([order(1)]), client);
    await mount(deps);

    expect(document.body.textContent).toContain('خلاصه');
    expect(statValue('سفارش‌ها')).toBe('۱');
    expect(client.tabs).not.toHaveBeenCalled();
  });
});

describe('reading history', () => {
  it('reads on click and renders the summary and charts', async () => {
    const client = fakeClient({
      tabs: vi.fn(async () => tabsOk(tabs({ sent: 1 }))),
      list: vi.fn(async () => listOk([order(1, { paidRial: 100_000 })])),
    });
    const deps = makeDeps(emptySnapshot(), client);
    await mount(deps);

    buttonByText('خواندن تاریخچهٔ سفارش‌ها')?.click();
    await waitFor(() => document.body.textContent?.includes('خلاصه') ?? false);

    expect(statValue('پرداخت خالص')).toBe('۱۰٬۰۰۰ تومان');
    expect(statValue('سفارش‌ها')).toBe('۱');
    expect(document.body.textContent).toContain('نمودارها');
    expect(document.body.textContent).toContain('شما این‌گونه خرید می‌کنید');
    expect(client.tabs).toHaveBeenCalledTimes(1);
    expect(client.list).toHaveBeenCalledWith('sent', 1);
    expect(deps.cache.saveMeta).toHaveBeenCalled();
    expect(buttonByText('به‌روزرسانی')).toBeDefined();
  });

  it('turns an auth failure into a sign-in message and an explicit open action', async () => {
    const client = fakeClient({
      tabs: vi.fn(async () => ({
        ok: false as const,
        errorCode: 'AUTH' as const,
        message: 'sign in',
        status: 401,
      })),
    });
    const deps = makeDeps(emptySnapshot(), client);
    await mount(deps);

    buttonByText('خواندن تاریخچهٔ سفارش‌ها')?.click();
    await waitFor(() => document.querySelector('.bk-error') !== null);

    expect(document.querySelector('.bk-error')?.textContent).toContain('وارد شده باشید');
    buttonByText('باز کردن دیجی‌کالا')?.click();
    expect(deps.openDigikala).toHaveBeenCalledTimes(1);
  });

  it('stops on request and keeps the pages already read', async () => {
    let resolveFirst: ((value: InsightsListResponse) => void) | undefined;
    const list = vi.fn(
      () =>
        new Promise<InsightsListResponse>((resolve) => {
          resolveFirst = resolve;
        }),
    );
    const client = fakeClient({
      tabs: vi.fn(async () => tabsOk(tabs({ sent: 20 }))),
      list,
    });
    const deps = makeDeps(emptySnapshot(), client);
    await mount(deps);

    buttonByText('خواندن تاریخچهٔ سفارش‌ها')?.click();
    await waitFor(() => resolveFirst !== undefined);

    resolveFirst?.(listOk([order(1)], 1, 3));
    await waitFor(() => buttonByText('توقف') !== undefined);
    buttonByText('توقف')?.click();

    await waitFor(
      () => document.body.textContent?.includes('آنچه خوانده شد نگه داشته شد') ?? false,
    );
    expect(statValue('سفارش‌ها')).toBe('۱');
    expect(list).toHaveBeenCalledTimes(1);
  });
});

describe('local controls', () => {
  it('filters by status without another request', async () => {
    const client = fakeClient();
    const deps = makeDeps(
      snapshot([order(1), order(2, { status: 'returned' })], {
        tabs: tabs({ sent: 1, returned: 1 }),
      }),
      client,
    );
    await mount(deps);

    expect(statValue('سفارش‌ها')).toBe('۲');
    buttonByText('مرجوعی · ۱')?.click();
    expect(statValue('سفارش‌ها')).toBe('۱');
    expect(client.tabs).not.toHaveBeenCalled();
  });

  it('counts and lists current deliveries by default', async () => {
    const client = fakeClient();
    const deps = makeDeps(
      snapshot([order(1, { status: 'in_progress', statusFa: 'در حال ارسال' })], {
        tabs: tabs({ in_progress: 1 }),
      }),
      client,
    );
    await mount(deps);

    expect(statValue('پرداخت خالص')).toBe('۱۰٬۰۰۰ تومان');
    expect(document.body.textContent).toContain('تحویل‌های در جریان');
    expect(document.body.textContent).toContain('سفارش ۱');
    expect(document.body.textContent).toContain('در حال ارسال');
  });

  it('rejects an invalid custom Jalali date, accepts a valid one', async () => {
    const client = fakeClient();
    const deps = makeDeps(snapshot([order(1)]), client);
    await mount(deps);

    buttonByText('بازهٔ دلخواه')?.click();
    const inputs = [...document.querySelectorAll<HTMLInputElement>('.bk-date-input')];
    expect(inputs).toHaveLength(2);
    inputs[0]!.value = '1404/13/01';
    inputs[0]!.dispatchEvent(new Event('input'));
    buttonByText('اعمال')?.click();
    expect(document.body.textContent).toContain('تاریخ معتبر نیست');

    inputs[0]!.value = '1404/01/01';
    inputs[0]!.dispatchEvent(new Event('input'));
    inputs[1]!.value = '1404/12/29';
    inputs[1]!.dispatchEvent(new Event('input'));
    buttonByText('اعمال')?.click();
    expect(document.body.textContent).not.toContain('تاریخ معتبر نیست');
  });

  it('switches language and persists it', async () => {
    const client = fakeClient();
    const deps = makeDeps(snapshot([order(1)]), client);
    await mount(deps);

    buttonByText('English')?.click();
    expect(document.querySelector('.bk-title')?.textContent).toBe('My orders');
    expect(document.documentElement.dir).toBe('ltr');
    expect(deps.saveSettings).toHaveBeenCalledWith(expect.objectContaining({ uiLanguage: 'en' }));
  });

  it('clears the cached orders after confirmation', async () => {
    const client = fakeClient();
    const deps = makeDeps(snapshot([order(1)]), client);
    await mount(deps);

    buttonByText('پاک کردن داده‌های سفارش‌ها')?.click();
    await waitFor(() => document.body.textContent?.includes('هنوز سفارشی خوانده نشده') ?? false);
    expect(deps.clearCache).toHaveBeenCalledTimes(1);
  });
});

describe('deep analysis', () => {
  it('reads details on request and merges the deep metrics', async () => {
    const item: InsightItem = {
      productId: 111,
      titleFa: 'گوشی',
      brand: 'سامسونگ',
      categories: ['موبایل'],
      sellerId: 501,
      sellerName: 'دیجی‌کالا',
      sellerRating: 4.7,
      quantity: 2,
      returnedQuantity: 0,
      cancelledQuantity: 0,
      unitRial: 50_000,
      rrpRial: 60_000,
      discountPercent: 16,
    };
    const client = fakeClient({
      detail: vi.fn(async (orderId: number) => ({
        ok: true as const,
        kind: 'insights/detail' as const,
        data: {
          order: order(orderId, { detailFetchedAt: NOW }),
          items: [item],
          shipments: [{ id: 1, costRial: 5_000, dateText: null, dateDay: null }],
        },
        transport: 'direct' as const,
      })),
    });
    const deps = makeDeps(snapshot([order(1)]), client);
    await mount(deps);

    buttonByText('خواندن جزئیات سفارش‌ها')?.click();
    await waitFor(() => document.body.textContent?.includes('کالاهای تکراری') ?? false);

    expect(deps.cache.saveDetail).toHaveBeenCalledTimes(1);
    expect(statValue('کالاها')).toBe('۲');
    expect(statValue('فروشنده‌ها')).toBe('۱');
    expect(document.body.textContent).toContain('بیشترین خرید از فروشنده‌ها');
  });

  it('includes in-progress deliveries as deep-analysis targets', async () => {
    const detail = vi.fn(async (orderId: number) => ({
      ok: true as const,
      kind: 'insights/detail' as const,
      data: {
        order: order(orderId, { status: 'in_progress', detailFetchedAt: NOW }),
        items: [],
        shipments: [],
      },
      transport: 'direct' as const,
    }));
    const client = fakeClient({ detail });
    const deps = makeDeps(snapshot([order(1, { status: 'in_progress' })]), client);
    await mount(deps);

    buttonByText('خواندن جزئیات سفارش‌ها')?.click();
    await waitFor(() => detail.mock.calls.length > 0);
    expect(detail).toHaveBeenCalledWith(1, 'in_progress');
  });

  it('builds a share card with vendor names hidden by default', async () => {
    const client = fakeClient();
    const deps = makeDeps(snapshot([order(1)]), client);
    await mount(deps);

    buttonByText('ساختن کارت')?.click();
    const canvas = document.querySelector<HTMLCanvasElement>('.bk-share-canvas');
    expect(canvas).not.toBeNull();
    expect(canvas?.width).toBe(1080);
    expect(canvas?.height).toBe(1350);
    expect(buttonByText('ارسال به X')).toBeDefined();
  });
});

describe('time helpers', () => {
  it('uses the injected clock for the 30-day preset', async () => {
    // The preset is relative to Tehran today; this smoke check only
    // asserts that the control round-trips without touching the network.
    const client = fakeClient();
    const deps = makeDeps(snapshot([order(1, { createdDay: DAY })]), client);
    await mount(deps);

    buttonByText('۳۰ روز')?.click();
    expect(document.body.textContent).toContain('خلاصه');
    expect(client.tabs).not.toHaveBeenCalled();
  });
});
