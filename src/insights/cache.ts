/**
 * Local order cache policy (D-39).
 *
 * IndexedDB keeps only the normalized rows the readers produced. The API
 * re-reads lists whenever the user asks; TTLs decide what counts as fresh
 * and therefore what a deep-analysis run still has to fetch.
 *
 *  - terminal statuses (sent/cancelled/returned): 24 h
 *  - in-progress: 10 min, because that is the status that changes
 *  - the store is capped at 2000 orders (oldest by creation day dropped)
 *
 * Cached data is still shown when it is stale - the page labels the last
 * sync time; freshness only governs re-fetching.
 */
import type { DbFactory } from '../shared/storage/db';
import {
  clearInsightMetaStore,
  clearOrderCacheStore,
  deleteOrderCacheRecords,
  getAllOrderCacheRecords,
  getInsightMeta,
  putInsightMeta,
  putOrderCacheRecords,
} from '../shared/storage/db';
import type {
  InsightItem,
  InsightMetaRecord,
  InsightOrder,
  InsightShipment,
  InsightSnapshot,
  InsightTabs,
  OrderCacheRecord,
  OrderStatus,
} from './types';
import { emptySnapshot } from './types';

export const TERMINAL_TTL_MS = 24 * 60 * 60 * 1000;
export const IN_PROGRESS_TTL_MS = 10 * 60 * 1000;
export const MAX_CACHED_ORDERS = 2000;

export function ttlFor(status: OrderStatus): number {
  return status === 'in_progress' ? IN_PROGRESS_TTL_MS : TERMINAL_TTL_MS;
}

/** True when the list row is inside its status TTL. */
export function isRecordFresh(record: OrderCacheRecord, now: number): boolean {
  return now - record.listFetchedAt < ttlFor(record.order.status);
}

/** True when a detail fetch would add or refresh data. */
export function needsDetail(record: OrderCacheRecord, now: number): boolean {
  const fetchedAt = record.order.detailFetchedAt;
  return fetchedAt === null || now - fetchedAt >= ttlFor(record.order.status);
}

/** The orders a deep-analysis run should fetch, oldest first. */
export function ordersNeedingDetail(
  records: readonly OrderCacheRecord[],
  now: number,
  statuses: readonly OrderStatus[] = ['sent', 'returned', 'in_progress', 'cancelled'],
): InsightOrder[] {
  return records
    .filter((record) => statuses.includes(record.order.status) && needsDetail(record, now))
    .map((record) => record.order)
    .sort((a, b) => (a.createdDay ?? 0) - (b.createdDay ?? 0) || a.orderId - b.orderId);
}

/** Cache rows → the page's snapshot. Detail arrays are omitted when empty. */
export function toSnapshot(
  records: readonly OrderCacheRecord[],
  meta: InsightMetaRecord | null,
): InsightSnapshot {
  const snapshot = emptySnapshot();
  snapshot.syncedAt = meta?.syncedAt ?? 0;
  snapshot.tabs = meta?.tabs ?? snapshot.tabs;
  snapshot.orders = records
    .map((record) => record.order)
    .sort((a, b) => (b.createdDay ?? -1) - (a.createdDay ?? -1) || b.orderId - a.orderId);
  for (const record of records) {
    if (record.items.length > 0) snapshot.itemsByOrder[record.orderId] = record.items;
    if (record.shipments.length > 0) {
      snapshot.shipmentsByOrder[record.orderId] = record.shipments;
    }
  }
  return snapshot;
}

export async function loadSnapshot(factory: DbFactory): Promise<InsightSnapshot> {
  const [records, meta] = await Promise.all([
    getAllOrderCacheRecords(factory),
    getInsightMeta(factory),
  ]);
  return toSnapshot(records, meta);
}

/**
 * Writes a list page, preserving any detail already cached for the order.
 * `detailFetchedAt` is carried forward so a refresh does not make a deep
 * run re-fetch every detail it already has.
 */
export async function saveOrdersFromList(
  factory: DbFactory,
  orders: readonly InsightOrder[],
  now: number,
): Promise<void> {
  if (orders.length === 0) return;
  const existing = new Map(
    (await getAllOrderCacheRecords(factory)).map((record) => [record.orderId, record]),
  );
  const records: OrderCacheRecord[] = orders.map((order) => {
    const prior = existing.get(order.orderId);
    return {
      orderId: order.orderId,
      order: {
        ...order,
        detailFetchedAt: prior?.order.detailFetchedAt ?? order.detailFetchedAt,
      },
      items: prior?.items ?? [],
      shipments: prior?.shipments ?? [],
      listFetchedAt: now,
    };
  });
  await putOrderCacheRecords(factory, records);
}

/** Writes one order's detail (items + shipments + refreshed header). */
export async function saveOrderDetail(
  factory: DbFactory,
  order: InsightOrder,
  items: InsightItem[],
  shipments: InsightShipment[],
  now: number,
): Promise<void> {
  const prior = (await getAllOrderCacheRecords(factory)).find(
    (record) => record.orderId === order.orderId,
  );
  await putOrderCacheRecords(factory, [
    {
      orderId: order.orderId,
      order,
      items,
      shipments,
      listFetchedAt: prior?.listFetchedAt ?? now,
    },
  ]);
}

/** Records what the last tab read saw. */
export async function saveMeta(
  factory: DbFactory,
  tabs: InsightTabs,
  syncedAt: number,
): Promise<void> {
  await putInsightMeta(factory, { key: 'sync', tabs, syncedAt });
}

/** Removes the oldest rows beyond `max`; returns how many were dropped. */
export async function pruneOrderCache(
  factory: DbFactory,
  max = MAX_CACHED_ORDERS,
): Promise<number> {
  const records = await getAllOrderCacheRecords(factory);
  if (records.length <= max) return 0;
  const overflow = records
    .slice()
    .sort(
      (a, b) =>
        (a.order.createdDay ?? Number.MAX_SAFE_INTEGER) -
          (b.order.createdDay ?? Number.MAX_SAFE_INTEGER) || a.orderId - b.orderId,
    )
    .slice(0, records.length - max)
    .map((record) => record.orderId);
  await deleteOrderCacheRecords(factory, overflow);
  return overflow.length;
}

/** Clears both insight stores; the comparison list and snapshots stay. */
export async function clearInsightsCache(factory: DbFactory): Promise<void> {
  await clearOrderCacheStore(factory);
  await clearInsightMetaStore(factory);
}
