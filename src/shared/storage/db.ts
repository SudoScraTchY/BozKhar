/**
 * Small typed IndexedDB wrapper - no ORM, no runtime dependency (SDD 06
 * technology defaults). The factory is injected so tests can run against
 * fake-indexeddb while production passes window.indexedDB.
 */
import type { ComparisonItem, ItemId, ShipmentRecord, Snapshot, Promo } from '../types';
import type { InsightMetaRecord, OrderCacheRecord } from '../../insights/types';

export type DbFactory = IDBFactory;

export const DB_NAME = 'digikala-cart-optimizer';
export const DB_VERSION = 4;

export const STORE_ITEMS = 'items';
export const STORE_SNAPSHOTS = 'snapshots';
export const STORE_PROMOS = 'promos';
export const STORE_SHIPMENTS = 'shipments';
/** D-26: the pre-apply cart snapshot (undo), one row. */
export const STORE_CART_SNAPSHOTS = 'cartSnapshots';
/** Order Insights: normalized orders (one row per order). */
export const STORE_ORDER_CACHE = 'orderCache';
/** Order Insights: the last sync's tab counts, one row ('sync'). */
export const STORE_INSIGHT_META = 'insightMeta';

const ALL_STORES = [
  STORE_ITEMS,
  STORE_SNAPSHOTS,
  STORE_PROMOS,
  STORE_SHIPMENTS,
  STORE_CART_SNAPSHOTS,
  STORE_ORDER_CACHE,
  STORE_INSIGHT_META,
] as const;
export type StoreName = (typeof ALL_STORES)[number];

/** Store key for an item: productId + variantId (D-05). */
export function itemKey(itemId: ItemId): string {
  return `${itemId.productId}::${itemId.variantId}`;
}

function openDatabase(factory: DbFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_ITEMS)) {
        // IndexedDB keyPaths cannot address nested objects, so items are
        // stored with a denormalized itemKey string (productId::variantId).
        db.createObjectStore(STORE_ITEMS, { keyPath: 'itemKey' });
      }
      if (!db.objectStoreNames.contains(STORE_SNAPSHOTS)) {
        const s = db.createObjectStore(STORE_SNAPSHOTS, { keyPath: 'snapshotId' });
        // Index for "latest snapshot per item" queries.
        s.createIndex('byItem', 'itemKey');
      }
      if (!db.objectStoreNames.contains(STORE_PROMOS)) {
        db.createObjectStore(STORE_PROMOS, { keyPath: 'promoId' });
      }
      if (!db.objectStoreNames.contains(STORE_SHIPMENTS)) {
        // D-19: the shipment quote is cart-level, one row
        // ('latest') re-quoted on every crawl.
        db.createObjectStore(STORE_SHIPMENTS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_CART_SNAPSHOTS)) {
        // D-26: the pre-apply cart snapshot for undo, one
        // row ('latest') replaced on every apply.
        db.createObjectStore(STORE_CART_SNAPSHOTS, { keyPath: 'key' });
      }
      if (!db.objectStoreNames.contains(STORE_ORDER_CACHE)) {
        // Order Insights (D-39): normalized orders only - the
        // reader strips address/payment/invoice fields before
        // anything reaches this store.
        db.createObjectStore(STORE_ORDER_CACHE, { keyPath: 'orderId' });
      }
      if (!db.objectStoreNames.contains(STORE_INSIGHT_META)) {
        db.createObjectStore(STORE_INSIGHT_META, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

async function withStore<T>(
  factory: DbFactory,
  store: StoreName,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest | void,
): Promise<T> {
  const db = await openDatabase(factory);
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      let request: IDBRequest | void;
      try {
        request = fn(os);
      } catch (err) {
        reject(err instanceof Error ? err : new Error(String(err)));
        return;
      }
      tx.oncomplete = () => resolve((request ? request.result : undefined) as T);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
    });
  } finally {
    db.close();
  }
}

// ---- items ----

/** Internal record shape: the item plus its denormalized key. */
type ItemRecord = ComparisonItem & { itemKey: string };

function toItem(rec: ItemRecord): ComparisonItem {
  const { itemKey: _k, ...item } = rec;
  return item;
}

export async function putItem(factory: DbFactory, item: ComparisonItem): Promise<void> {
  const record: ItemRecord = { ...item, itemKey: itemKey(item.itemId) };
  await withStore(factory, STORE_ITEMS, 'readwrite', (s) => {
    s.put(record);
  });
}

export async function getItem(
  factory: DbFactory,
  itemId: ItemId,
): Promise<ComparisonItem | undefined> {
  const rec = await withStore<ItemRecord | undefined>(factory, STORE_ITEMS, 'readonly', (s) =>
    s.get(itemKey(itemId)),
  );
  return rec ? toItem(rec) : undefined;
}

export async function getAllItems(factory: DbFactory): Promise<ComparisonItem[]> {
  const recs = await withStore<ItemRecord[]>(factory, STORE_ITEMS, 'readonly', (s) => s.getAll());
  return recs.map(toItem);
}

export async function deleteItem(factory: DbFactory, itemId: ItemId): Promise<void> {
  await withStore(factory, STORE_ITEMS, 'readwrite', (s) => {
    s.delete(itemKey(itemId));
  });
}

// ---- snapshots (append-only, history-first) ----

/** Internal denormalized key used by the byItem index. */
type SnapshotRecord = Snapshot & { itemKey: string };

/**
 * Appends a snapshot. Stored with a denormalized itemKey for indexing.
 * Never updates or deletes existing snapshots (SDD 08): add() throws on a
 * duplicate snapshotId, so append-only holds by construction.
 */
export async function appendSnapshot(factory: DbFactory, snapshot: Snapshot): Promise<void> {
  const record: SnapshotRecord = { ...snapshot, itemKey: itemKey(snapshot.itemId) };
  await withStore(factory, STORE_SNAPSHOTS, 'readwrite', (s) => {
    s.add(record);
  });
}

export async function getSnapshot(
  factory: DbFactory,
  snapshotId: string,
): Promise<Snapshot | undefined> {
  const rec = await withStore<SnapshotRecord | undefined>(
    factory,
    STORE_SNAPSHOTS,
    'readonly',
    (s) => s.get(snapshotId),
  );
  if (!rec) return undefined;
  const { itemKey: _k, ...snap } = rec;
  return snap;
}

/** All snapshots of one item, oldest first (capturedAt, then snapshotId). */
export async function getSnapshotsForItem(factory: DbFactory, itemId: ItemId): Promise<Snapshot[]> {
  const key = itemKey(itemId);
  const all = await withStore<SnapshotRecord[]>(factory, STORE_SNAPSHOTS, 'readonly', (s) =>
    s.index('byItem').getAll(key),
  );
  return all
    .map(({ itemKey: _k, ...snap }) => snap)
    .sort(
      (a, b) =>
        a.capturedAt.localeCompare(b.capturedAt) || a.snapshotId.localeCompare(b.snapshotId),
    );
}

/**
 * Every snapshot in the store (append-only history). The results
 * page (T05) groups these per product to span all captured
 * variants (D-17); cart-scale data is small enough that a full
 * read plus an in-memory grouping is the honest query.
 */
export async function getAllSnapshots(factory: DbFactory): Promise<Snapshot[]> {
  const all = await withStore<SnapshotRecord[]>(factory, STORE_SNAPSHOTS, 'readonly', (s) =>
    s.getAll(),
  );
  return all
    .map(({ itemKey: _k, ...snap }) => snap)
    .sort(
      (a, b) =>
        a.capturedAt.localeCompare(b.capturedAt) || a.snapshotId.localeCompare(b.snapshotId),
    );
}

/** Latest snapshot per item ("latest" = capturedAt, tie-break on snapshotId). */
export async function getLatestSnapshots(factory: DbFactory): Promise<Map<string, Snapshot>> {
  const all = await withStore<SnapshotRecord[]>(factory, STORE_SNAPSHOTS, 'readonly', (s) =>
    s.getAll(),
  );
  const latest = new Map<string, Snapshot>();
  for (const { itemKey: _k, ...snap } of all) {
    const key = itemKey(snap.itemId);
    const current = latest.get(key);
    if (
      !current ||
      snap.capturedAt > current.capturedAt ||
      (snap.capturedAt === current.capturedAt && snap.snapshotId > current.snapshotId)
    ) {
      latest.set(key, snap);
    }
  }
  return latest;
}

// ---- promos ----

export async function putPromos(factory: DbFactory, promos: Promo[]): Promise<void> {
  await withStore(factory, STORE_PROMOS, 'readwrite', (s) => {
    for (const p of promos) s.put(p);
  });
}

export async function getAllPromos(factory: DbFactory): Promise<Promo[]> {
  return withStore(factory, STORE_PROMOS, 'readonly', (s) => s.getAll());
}

// ---- shipments (D-19) ----

/** Stores (or replaces) the latest shipment quote. */
export async function putShipment(factory: DbFactory, record: ShipmentRecord): Promise<void> {
  await withStore(factory, STORE_SHIPMENTS, 'readwrite', (s) => {
    s.put(record);
  });
}

/** The latest shipment quote, or null when none was captured. */
export async function getShipment(factory: DbFactory): Promise<ShipmentRecord | null> {
  const rec = await withStore<ShipmentRecord | undefined>(
    factory,
    STORE_SHIPMENTS,
    'readonly',
    (s) => s.get('latest'),
  );
  return rec ?? null;
}

// ---- cart snapshots (D-26 apply-flow undo) ----

export interface CartSnapshotRecord {
  key: 'latest';
  /** The exact cart lines before the apply. */
  lines: Array<{
    cartItemId: string;
    productId: string;
    variantId: string;
    sellerId: string;
    sellerName: string;
    quantity: number;
  }>;
  savedAt: string; // ISO timestamp
}

/** Stores (or replaces) the pre-apply cart snapshot. */
export async function putCartSnapshot(
  factory: DbFactory,
  record: CartSnapshotRecord,
): Promise<void> {
  await withStore(factory, STORE_CART_SNAPSHOTS, 'readwrite', (s) => {
    s.put(record);
  });
}

/** The pre-apply cart snapshot, or null when none exists. */
export async function getCartSnapshot(factory: DbFactory): Promise<CartSnapshotRecord | null> {
  const rec = await withStore<CartSnapshotRecord | undefined>(
    factory,
    STORE_CART_SNAPSHOTS,
    'readonly',
    (s) => s.get('latest'),
  );
  return rec ?? null;
}

/** Drops the snapshot (after a successful restore-and-confirm). */
export async function deleteCartSnapshot(factory: DbFactory): Promise<void> {
  await withStore(factory, STORE_CART_SNAPSHOTS, 'readwrite', (s) => {
    s.delete('latest');
  });
}

// ---- order insights cache (D-39) ----

/** Upserts normalized order rows in one transaction. */
export async function putOrderCacheRecords(
  factory: DbFactory,
  records: readonly OrderCacheRecord[],
): Promise<void> {
  if (records.length === 0) return;
  await withStore(factory, STORE_ORDER_CACHE, 'readwrite', (s) => {
    for (const record of records) s.put(record);
  });
}

export async function getAllOrderCacheRecords(factory: DbFactory): Promise<OrderCacheRecord[]> {
  return withStore(factory, STORE_ORDER_CACHE, 'readonly', (s) => s.getAll());
}

export async function getOrderCacheRecord(
  factory: DbFactory,
  orderId: number,
): Promise<OrderCacheRecord | undefined> {
  return withStore<OrderCacheRecord | undefined>(factory, STORE_ORDER_CACHE, 'readonly', (s) =>
    s.get(orderId),
  );
}

export async function deleteOrderCacheRecords(
  factory: DbFactory,
  orderIds: readonly number[],
): Promise<void> {
  if (orderIds.length === 0) return;
  await withStore(factory, STORE_ORDER_CACHE, 'readwrite', (s) => {
    for (const id of orderIds) s.delete(id);
  });
}

export async function clearOrderCacheStore(factory: DbFactory): Promise<void> {
  await withStore(factory, STORE_ORDER_CACHE, 'readwrite', (s) => {
    s.clear();
  });
}

export async function putInsightMeta(factory: DbFactory, record: InsightMetaRecord): Promise<void> {
  await withStore(factory, STORE_INSIGHT_META, 'readwrite', (s) => {
    s.put(record);
  });
}

export async function getInsightMeta(factory: DbFactory): Promise<InsightMetaRecord | null> {
  const rec = await withStore<InsightMetaRecord | undefined>(
    factory,
    STORE_INSIGHT_META,
    'readonly',
    (s) => s.get('sync'),
  );
  return rec ?? null;
}

export async function clearInsightMetaStore(factory: DbFactory): Promise<void> {
  await withStore(factory, STORE_INSIGHT_META, 'readwrite', (s) => {
    s.clear();
  });
}

// ---- danger zone ----

/** FR-16 privacy gate: empties every store. Returns the count of deleted records. */
export async function clearAllStores(factory: DbFactory): Promise<number> {
  const db = await openDatabase(factory);
  try {
    // Count first (one readonly pass), then clear every store.
    const count = await new Promise<number>((resolve, reject) => {
      const tx = db.transaction([...ALL_STORES], 'readonly');
      let total = 0;
      for (const name of ALL_STORES) {
        const req = tx.objectStore(name).count();
        req.onsuccess = () => {
          total += req.result;
        };
      }
      tx.onerror = () => reject(tx.error ?? new Error('clearAll count failed'));
      tx.oncomplete = () => resolve(total);
    });

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...ALL_STORES], 'readwrite');
      for (const name of ALL_STORES) {
        tx.objectStore(name).clear();
      }
      tx.onerror = () => reject(tx.error ?? new Error('clearAll failed'));
      tx.oncomplete = () => resolve();
    });

    return count;
  } finally {
    db.close();
  }
}
// ---- schema versioning / forward-only migrations (SDD 08) ----

/**
 * Runs the forward-only migration chain from version `from` to `to`.
 * v1 is the initial database shape (created on open); each later version
 * adds one step here plus a test proving the old shape transforms forward.
 * Downgrades are refused: never rewrite data with an older schema.
 */
export async function runMigrations(factory: DbFactory, from: number, to: number): Promise<void> {
  if (to < from) {
    throw new Error(`Refusing downgrade of storage schema ${from} -> ${to}`);
  }
  for (let v = from + 1; v <= to; v++) {
    await applyMigration(factory, v);
  }
}

async function applyMigration(_factory: DbFactory, _version: number): Promise<void> {
  // v1 = initial shape, nothing to transform. Future bumps add a guarded
  // step here (e.g. rewrite snapshot records) BEFORE the new code ships.
  // v3 added the cartSnapshots store (D-26); no data to transform.
  // v4 adds orderCache + insightMeta (D-39); also no data to transform.
}
