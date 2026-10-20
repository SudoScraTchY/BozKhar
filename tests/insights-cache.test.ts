import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  clearInsightsCache,
  isRecordFresh,
  loadSnapshot,
  MAX_CACHED_ORDERS,
  needsDetail,
  ordersNeedingDetail,
  pruneOrderCache,
  saveMeta,
  saveOrderDetail,
  saveOrdersFromList,
  TERMINAL_TTL_MS,
  IN_PROGRESS_TTL_MS,
} from '../src/insights/cache';
import type { InsightOrder, OrderCacheRecord } from '../src/insights/types';
import {
  DB_NAME,
  clearAllStores,
  getAllItems,
  getInsightMeta,
  putItem,
} from '../src/shared/storage/db';
import type { ComparisonItem } from '../src/shared/types';

const factory = (): IDBFactory => new IDBFactory();
const NOW = 1_760_000_000_000;

function order(id: number, extra: Partial<InsightOrder> = {}): InsightOrder {
  return {
    orderId: id,
    status: 'sent',
    statusFa: 'تحویل شده',
    createdText: '13 آبان 1404',
    createdDay: 2_460_954,
    payableRial: 1_000_000,
    paidRial: 1_000_000,
    refundRial: null,
    shippingRial: 0,
    discountRial: 0,
    totalCostRial: 1_000_000,
    detailFetchedAt: null,
    ...extra,
  };
}

function record(id: number, extra: Partial<OrderCacheRecord> = {}): OrderCacheRecord {
  return {
    orderId: id,
    order: order(id),
    items: [],
    shipments: [],
    listFetchedAt: NOW,
    ...extra,
  };
}

const item: ComparisonItem = {
  itemId: { productId: 'dkp-1', variantId: 'v1' },
  product: { id: 'dkp-1', title: 'P' },
  variant: { id: 'v1', label: 'L' },
  quantity: 1,
  lock: { mode: 'none', vendorIds: [] },
  addedAt: '2026-10-01T00:00:00Z',
};

describe('order cache TTLs', () => {
  it('uses 24h for terminal statuses and 10min for in-progress', () => {
    const sent = record(1, { listFetchedAt: NOW - TERMINAL_TTL_MS + 1 });
    expect(isRecordFresh(sent, NOW)).toBe(true);
    expect(isRecordFresh({ ...sent, listFetchedAt: NOW - TERMINAL_TTL_MS }, NOW)).toBe(false);

    const running = record(2, {
      order: order(2, { status: 'in_progress' }),
      listFetchedAt: NOW - IN_PROGRESS_TTL_MS + 1,
    });
    expect(isRecordFresh(running, NOW)).toBe(true);
    expect(isRecordFresh({ ...running, listFetchedAt: NOW - IN_PROGRESS_TTL_MS }, NOW)).toBe(false);
  });

  it('marks a record for a detail fetch when absent or stale', () => {
    expect(needsDetail(record(1), NOW)).toBe(true);
    expect(needsDetail(record(1, { order: order(1, { detailFetchedAt: NOW - 1000 }) }), NOW)).toBe(
      false,
    );
    expect(
      needsDetail(record(1, { order: order(1, { detailFetchedAt: NOW - TERMINAL_TTL_MS }) }), NOW),
    ).toBe(true);
  });

  it('lists records of every status needing detail, oldest first', () => {
    const records = [
      record(1, { order: order(1, { createdDay: 30 }) }),
      record(2, { order: order(2, { createdDay: 10 }) }),
      record(3, { order: order(3, { status: 'cancelled' }) }),
    ];
    expect(ordersNeedingDetail(records, NOW).map((o) => o.orderId)).toEqual([2, 1, 3]);
  });
});

describe('order cache round trip', () => {
  it('saves list rows, meta and merges detail without losing either', async () => {
    const db = factory();
    await saveOrdersFromList(db, [order(1), order(2)], NOW);
    await saveMeta(db, { in_progress: 0, sent: 2, cancelled: 0, returned: 0 }, NOW);

    let snapshot = await loadSnapshot(db);
    expect(snapshot.orders.map((o) => o.orderId)).toEqual([2, 1]);
    expect(snapshot.syncedAt).toBe(NOW);
    expect(snapshot.tabs.sent).toBe(2);
    expect(snapshot.itemsByOrder).toEqual({});

    const detailOrder = order(1, { detailFetchedAt: NOW });
    await saveOrderDetail(
      db,
      detailOrder,
      [
        {
          productId: 111,
          titleFa: 'گوشی',
          brand: 'سامسونگ',
          categories: ['موبایل'],
          sellerId: 501,
          sellerName: 'دیجی‌کالا',
          sellerRating: 4.7,
          quantity: 1,
          returnedQuantity: 0,
          cancelledQuantity: 0,
          unitRial: 500000,
          rrpRial: 600000,
          discountPercent: 16,
        },
      ],
      [{ id: 1, costRial: 100000, dateText: null, dateDay: null }],
      NOW,
    );

    // A later list refresh keeps the cached detail.
    await saveOrdersFromList(db, [order(1), order(2)], NOW + 1000);
    snapshot = await loadSnapshot(db);
    expect(snapshot.itemsByOrder[1]).toHaveLength(1);
    expect(snapshot.shipmentsByOrder[1]).toHaveLength(1);
    expect(snapshot.orders.find((o) => o.orderId === 1)?.detailFetchedAt).toBe(NOW);
  });

  it('drops the oldest rows beyond the cap', async () => {
    const db = factory();
    await saveOrdersFromList(
      db,
      [order(1, { createdDay: 10 }), order(2, { createdDay: 20 }), order(3, { createdDay: 30 })],
      NOW,
    );
    expect(await pruneOrderCache(db, 2)).toBe(1);
    expect((await loadSnapshot(db)).orders.map((o) => o.orderId).sort()).toEqual([2, 3]);
  });

  it('keeps the default cap generous', () => {
    expect(MAX_CACHED_ORDERS).toBe(2000);
  });

  it('clears only the insight stores', async () => {
    const db = factory();
    await putItem(db, item);
    await saveOrdersFromList(db, [order(1)], NOW);
    await saveMeta(db, { in_progress: 0, sent: 1, cancelled: 0, returned: 0 }, NOW);

    await clearInsightsCache(db);
    expect((await loadSnapshot(db)).orders).toEqual([]);
    expect(await getInsightMeta(db)).toBeNull();
    expect(await getAllItems(db)).toHaveLength(1);
  });
});

describe('schema v3 → v4', () => {
  function openV3(db: IDBFactory): Promise<void> {
    return new Promise((resolve, reject) => {
      const req = db.open(DB_NAME, 3);
      req.onupgradeneeded = () => {
        const idb = req.result;
        idb.createObjectStore('items', { keyPath: 'itemKey' });
        idb
          .createObjectStore('snapshots', { keyPath: 'snapshotId' })
          .createIndex('byItem', 'itemKey');
        idb.createObjectStore('promos', { keyPath: 'promoId' });
        idb.createObjectStore('shipments', { keyPath: 'key' });
        idb.createObjectStore('cartSnapshots', { keyPath: 'key' });
      };
      req.onsuccess = () => {
        const idb = req.result;
        const tx = idb.transaction('items', 'readwrite');
        tx.objectStore('items').put({ ...item, itemKey: 'dkp-1::v1' });
        tx.oncomplete = () => {
          idb.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }

  it('upgrades in place, keeps v3 data and adds the insight stores', async () => {
    const db = factory();
    await openV3(db);

    await saveOrdersFromList(db, [order(1)], NOW);
    expect(await getAllItems(db)).toHaveLength(1);

    const names = await new Promise<string[]>((resolve, reject) => {
      const req = db.open(DB_NAME, 4);
      req.onsuccess = () => {
        const idb = req.result;
        const out = Array.from(idb.objectStoreNames);
        idb.close();
        resolve(out);
      };
      req.onerror = () => reject(req.error);
    });
    expect(names).toEqual(
      expect.arrayContaining(['orderCache', 'insightMeta', 'items', 'snapshots']),
    );
  });

  it('clear-all empties the insight stores too', async () => {
    const db = factory();
    await putItem(db, item);
    await saveOrdersFromList(db, [order(1)], NOW);
    await saveMeta(db, { in_progress: 0, sent: 1, cancelled: 0, returned: 0 }, NOW);

    expect(await clearAllStores(db)).toBe(3);
    expect((await loadSnapshot(db)).orders).toEqual([]);
    expect(await getAllItems(db)).toEqual([]);
  });
});
