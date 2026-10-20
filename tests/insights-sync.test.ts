import { describe, expect, it, vi } from 'vitest';
import type {
  InsightsDetailResponse,
  InsightsErrorCode,
  InsightsListResponse,
  InsightsTabsResponse,
} from '../src/insights/api';
import type { InsightsClient } from '../src/insights/client';
import { deepAnalyze, syncOrders, type SyncCacheWriter } from '../src/insights/sync';
import type {
  InsightItem,
  InsightOrder,
  InsightShipment,
  InsightTabs,
} from '../src/insights/types';

const NOW = 1_760_000_000_000;

function order(id: number, status: InsightOrder['status'] = 'sent'): InsightOrder {
  return {
    orderId: id,
    status,
    statusFa: '',
    createdText: '13 آبان 1404',
    createdDay: 2_460_954,
    payableRial: 1000,
    paidRial: 1000,
    refundRial: null,
    shippingRial: 0,
    discountRial: 0,
    totalCostRial: 1000,
    detailFetchedAt: null,
  };
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

function failure(code: InsightsErrorCode = 'NETWORK'): InsightsListResponse {
  return { ok: false, errorCode: code, message: 'boom' };
}

function cache(): SyncCacheWriter & {
  orders: InsightOrder[][];
  details: number[];
  meta: InsightTabs[];
  prunes: number;
} {
  const state = {
    orders: [] as InsightOrder[][],
    details: [] as number[],
    meta: [] as InsightTabs[],
    prunes: 0,
    async saveOrders(rows: readonly InsightOrder[]) {
      state.orders.push([...rows]);
    },
    async saveDetail(row: InsightOrder, _items: InsightItem[], _shipments: InsightShipment[]) {
      state.details.push(row.orderId);
    },
    async saveMeta(value: InsightTabs) {
      state.meta.push(value);
    },
    async prune() {
      state.prunes += 1;
      return 0;
    },
  };
  return state;
}

function client(
  list: (status: InsightOrder['status'], page: number) => Promise<InsightsListResponse>,
  tabCounts: InsightTabs = tabs(),
): Pick<InsightsClient, 'tabs' | 'list'> {
  return {
    tabs: async () => tabsOk(tabCounts),
    list,
  };
}

describe('syncOrders', () => {
  it('walks every non-empty status and caches each page', async () => {
    const listSpy = vi.fn(async (status: InsightOrder['status'], page: number) => {
      if (status === 'sent') return listOk([order(1), order(2)], page, 1);
      return listOk([order(3, 'returned')], page, 1);
    });
    const store = cache();
    const progress: number[] = [];

    const result = await syncOrders(client(listSpy, tabs({ sent: 2, returned: 1 })), store, {
      now: () => NOW,
      delay: async () => undefined,
      onProgress: (p) => {
        if (p.phase === 'list') progress.push(p.done);
      },
    });

    expect(result.ok).toBe(true);
    expect(result.fetched).toBe(3);
    expect(result.orders.map((o) => o.orderId)).toEqual([1, 2, 3]);
    expect(result.tabs).toEqual(tabs({ sent: 2, returned: 1 }));
    expect(store.orders).toHaveLength(2);
    expect(store.meta).toEqual([tabs({ sent: 2, returned: 1 })]);
    expect(store.prunes).toBe(1);
    expect(progress).toEqual([2, 3]);
    expect(listSpy).toHaveBeenCalledTimes(2);
  });

  it('keeps what arrived when the user aborts', async () => {
    let aborted = false;
    const store = cache();
    const listSpy = vi.fn(async () => listOk([order(1), order(2)], 1, 2));

    const result = await syncOrders(client(listSpy, tabs({ sent: 4 })), store, {
      now: () => NOW,
      delay: async () => undefined,
      isAborted: () => aborted,
      onProgress: (p) => {
        if (p.phase === 'list' && p.page === 1) aborted = true;
      },
    });

    expect(result.aborted).toBe(true);
    expect(result.ok).toBe(false);
    expect(result.fetched).toBe(2);
    expect(store.orders).toHaveLength(1);
    expect(store.meta).toHaveLength(1);
    expect(listSpy).toHaveBeenCalledTimes(1);
  });

  it('contains a failed page and still reads the next status', async () => {
    const store = cache();
    const listSpy = vi.fn(async (status: InsightOrder['status'], page: number) => {
      if (status === 'sent' && page === 2) return failure('NETWORK');
      if (status === 'sent') return listOk([order(1)], 1, 2);
      return listOk([order(9, 'returned')], page, 1);
    });

    const result = await syncOrders(client(listSpy, tabs({ sent: 2, returned: 1 })), store, {
      now: () => NOW,
      delay: async () => undefined,
    });

    expect(result.ok).toBe(false);
    expect(result.failed).toBe(1);
    expect(result.error).toMatchObject({ errorCode: 'NETWORK' });
    expect(result.orders.map((o) => o.orderId)).toEqual([1, 9]);
    expect(store.orders).toHaveLength(2);
  });

  it('stops at the page cap and reports the truncation', async () => {
    const listSpy = vi.fn(async (_status: InsightOrder['status'], page: number) =>
      listOk([order(page)], page, 500),
    );

    const result = await syncOrders(client(listSpy, tabs({ sent: 500 })), cache(), {
      maxPages: 2,
      now: () => NOW,
      delay: async () => undefined,
    });

    expect(result.truncated).toBe(true);
    expect(result.fetched).toBe(2);
    expect(listSpy).toHaveBeenCalledTimes(2);
  });

  it('returns the tabs failure without writing meta', async () => {
    const store = cache();
    const result = await syncOrders(
      {
        tabs: async () => ({ ok: false, errorCode: 'AUTH', message: 'sign in', status: 401 }),
        list: async () => failure('NETWORK'),
      },
      store,
      { now: () => NOW },
    );
    expect(result.ok).toBe(false);
    expect(result.error).toMatchObject({ errorCode: 'AUTH' });
    expect(store.meta).toEqual([]);
  });

  it('waits between pages', async () => {
    const sleeps: number[] = [];
    const listSpy = vi.fn(async (_status: InsightOrder['status'], page: number) =>
      listOk([order(page)], page, 3),
    );
    await syncOrders(client(listSpy, tabs({ sent: 30 })), cache(), {
      pageDelayMs: 450,
      now: () => NOW,
      delay: async (ms) => {
        sleeps.push(ms);
      },
    });
    expect(sleeps).toEqual([450, 450]);
  });
});

describe('deepAnalyze', () => {
  function detailClient(
    fn: (id: number) => Promise<InsightsDetailResponse>,
  ): Pick<InsightsClient, 'detail'> {
    return { detail: fn };
  }

  function detailOk(id: number): InsightsDetailResponse {
    return {
      ok: true,
      kind: 'insights/detail',
      data: { order: order(id), items: [], shipments: [] },
      transport: 'direct',
    };
  }

  it('fetches details sequentially and contains a single failure', async () => {
    const store = cache();
    const detailSpy = vi.fn(async (id: number) =>
      id === 2
        ? ({ ok: false, errorCode: 'NETWORK', message: 'no' } as InsightsDetailResponse)
        : detailOk(id),
    );
    const progress: number[] = [];

    const result = await deepAnalyze(
      detailClient(detailSpy),
      store,
      [order(1), order(2), order(3)],
      {
        now: () => NOW,
        delay: async () => undefined,
        onProgress: (p) => progress.push(p.done),
      },
    );

    expect(result).toMatchObject({ fetched: 2, failed: 1, aborted: false });
    expect(store.details).toEqual([1, 3]);
    expect(progress).toEqual([1, 2, 3]);
    expect(detailSpy).toHaveBeenCalledTimes(3);
  });

  it('stops on an auth failure', async () => {
    const detailSpy = vi.fn(
      async () =>
        ({
          ok: false,
          errorCode: 'AUTH',
          message: 'sign in',
          status: 401,
        }) as InsightsDetailResponse,
    );
    const result = await deepAnalyze(detailClient(detailSpy), cache(), [order(1), order(2)], {
      delay: async () => undefined,
    });
    expect(result).toMatchObject({ fetched: 0, failed: 1, aborted: false });
    expect(detailSpy).toHaveBeenCalledTimes(1);
  });

  it('caps a run at 300 orders by default', async () => {
    const detailSpy = vi.fn(async (id: number) => detailOk(id));
    const orders = Array.from({ length: 301 }, (_, i) => order(i + 1));
    const result = await deepAnalyze(detailClient(detailSpy), cache(), orders, {
      delay: async () => undefined,
    });
    expect(result.fetched).toBe(300);
    expect(detailSpy).toHaveBeenCalledTimes(300);
  });

  it('respects a smaller cap and abort', async () => {
    const detailSpy = vi.fn(async (id: number) => detailOk(id));
    const result = await deepAnalyze(detailClient(detailSpy), cache(), [order(1), order(2)], {
      maxOrders: 1,
      delay: async () => undefined,
    });
    expect(result.fetched).toBe(1);

    let aborted = false;
    const second = await deepAnalyze(
      detailClient(detailSpy),
      cache(),
      [order(1), order(2), order(3)],
      {
        delay: async () => undefined,
        isAborted: () => aborted,
        onProgress: () => {
          aborted = true;
        },
      },
    );
    expect(second.aborted).toBe(true);
    expect(second.fetched).toBe(1);
  });
});
