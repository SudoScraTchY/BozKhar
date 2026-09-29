/**
 * Storage facade for runtime code: injects the real browser factories.
 * Tests import from db.ts/settings.ts directly and inject fakes instead.
 */
import type { ComparisonItem, ItemId, Snapshot, Promo } from '../types';
import {
  appendSnapshot,
  clearAllStores,
  deleteItem,
  getAllItems,
  getAllPromos,
  getItem,
  getLatestSnapshots,
  getSnapshot,
  getSnapshotsForItem,
  putItem,
  putPromos,
} from './db';

const idb: IDBFactory = globalThis.indexedDB;

export const storage = {
  // items
  putItem: (item: ComparisonItem) => putItem(idb, item),
  getItem: (itemId: ItemId) => getItem(idb, itemId),
  getAllItems: () => getAllItems(idb),
  deleteItem: (itemId: ItemId) => deleteItem(idb, itemId),
  // snapshots
  appendSnapshot: (snapshot: Snapshot) => appendSnapshot(idb, snapshot),
  getSnapshot: (snapshotId: string) => getSnapshot(idb, snapshotId),
  getSnapshotsForItem: (itemId: ItemId) => getSnapshotsForItem(idb, itemId),
  getLatestSnapshots: () => getLatestSnapshots(idb),
  // promos
  putPromos: (promos: Promo[]) => putPromos(idb, promos),
  getAllPromos: () => getAllPromos(idb),
  // danger zone
  clearAll: () => clearAllStores(idb),
};
