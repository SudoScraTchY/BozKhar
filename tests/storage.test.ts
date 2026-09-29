/**
 * T02.3 storage-layer unit tests (SDD tasks/T02-foundation.md acceptance):
 * item round-trip keyed by productId+variantId, append-only snapshots,
 * latest-per-item query, forward-only migration hook, clearAll privacy gate.
 * Runs on fake-indexeddb; zero real browser APIs.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  DB_VERSION,
  appendSnapshot,
  clearAllStores,
  deleteItem,
  getAllItems,
  getAllPromos,
  getItem,
  getLatestSnapshots,
  getSnapshotsForItem,
  itemKey,
  putItem,
  putPromos,
  runMigrations,
  type DbFactory,
} from '../src/shared/storage/db';
import type { ComparisonItem, ItemId, Offer, Promo, Snapshot } from '../src/shared/types';

let factory: DbFactory;

beforeEach(() => {
  factory = new IDBFactory();
});

const itemIdA: ItemId = { productId: 'dkp-1001', variantId: 'var-black' };
const itemIdB: ItemId = { productId: 'dkp-1001', variantId: 'var-white' };

function makeItem(id: ItemId, quantity = 1): ComparisonItem {
  return {
    itemId: id,
    product: { id: id.productId, title: `Product ${id.productId}`, slug: `p-${id.productId}` },
    variant: { id: id.variantId, label: id.variantId.replace('var-', '') },
    quantity,
    lock: { mode: 'none', vendorIds: [] },
    addedAt: '2026-09-30T00:00:00.000Z',
  };
}

function makeSnapshot(id: string, itemId: ItemId, capturedAt: string, price = 1000): Snapshot {
  const offer: Offer = {
    vendor: { id: 'vendor-1', name: 'Vendor One' },
    price,
    stockState: 'in-stock',
    isLargeItem: false,
    delivery: { feeAmount: 49, provenance: 'page-visible', plusApplies: true },
    promoIds: [],
    capturedAt,
    extractorVersion: '0.0.0-t02',
    sourceUrl: 'https://www.digikala.com/product/dkp-1001',
  };
  return {
    snapshotId: id,
    itemId,
    offers: [offer],
    promos: [],
    capturedAt,
    extractorVersion: '0.0.0-t02',
  };
}

describe('items store (keyed by productId+variantId, D-05)', () => {
  it('round-trips an item', async () => {
    const item = makeItem(itemIdA);
    await putItem(factory, item);
    const back = await getItem(factory, itemIdA);
    expect(back).toEqual(item);
  });

  it('keeps variants separate: same product, different variant = different key', async () => {
    await putItem(factory, makeItem(itemIdA));
    await putItem(factory, makeItem(itemIdB));
    expect(itemKey(itemIdA)).not.toEqual(itemKey(itemIdB));
    expect((await getAllItems(factory)).length).toBe(2);
    expect((await getItem(factory, itemIdA))?.itemId).toEqual(itemIdA);
    expect((await getItem(factory, itemIdB))?.itemId).toEqual(itemIdB);
  });

  it('updates via put (the one writable store) and deletes cleanly', async () => {
    await putItem(factory, makeItem(itemIdA, 1));
    await putItem(factory, makeItem(itemIdA, 3));
    expect((await getItem(factory, itemIdA))?.quantity).toBe(3);
    expect((await getAllItems(factory)).length).toBe(1);
    await deleteItem(factory, itemIdA);
    expect(await getItem(factory, itemIdA)).toBeUndefined();
  });
});

describe('snapshots store (append-only, history-first)', () => {
  it('two captures = two records, latest returns the second', async () => {
    await appendSnapshot(factory, makeSnapshot('s1', itemIdA, '2026-09-30T01:00:00.000Z', 1000));
    await appendSnapshot(factory, makeSnapshot('s2', itemIdA, '2026-09-30T02:00:00.000Z', 900));
    const all = await getSnapshotsForItem(factory, itemIdA);
    expect(all.map((s) => s.snapshotId)).toEqual(['s1', 's2']);
    const latest = await getLatestSnapshots(factory);
    expect(latest.size).toBe(1);
    expect(latest.get(itemKey(itemIdA))?.snapshotId).toBe('s2');
    expect(latest.get(itemKey(itemIdA))?.offers[0]?.price).toBe(900);
  });

  it('refuses to overwrite a snapshot id (append-only by construction)', async () => {
    await appendSnapshot(factory, makeSnapshot('s1', itemIdA, '2026-09-30T01:00:00.000Z'));
    await expect(
      appendSnapshot(factory, makeSnapshot('s1', itemIdA, '2026-09-30T01:00:00.000Z')),
    ).rejects.toBeTruthy();
    expect((await getSnapshotsForItem(factory, itemIdA)).length).toBe(1);
  });

  it('latest-per-item picks the newest per variant across items', async () => {
    await appendSnapshot(factory, makeSnapshot('a1', itemIdA, '2026-09-30T01:00:00.000Z'));
    await appendSnapshot(factory, makeSnapshot('a2', itemIdA, '2026-09-30T03:00:00.000Z'));
    await appendSnapshot(factory, makeSnapshot('b1', itemIdB, '2026-09-30T02:00:00.000Z'));
    const latest = await getLatestSnapshots(factory);
    expect(latest.size).toBe(2);
    expect(latest.get(itemKey(itemIdA))?.snapshotId).toBe('a2');
    expect(latest.get(itemKey(itemIdB))?.snapshotId).toBe('b1');
  });

  it('tie-breaks equal capturedAt by snapshotId deterministically', async () => {
    await appendSnapshot(factory, makeSnapshot('aaa', itemIdA, '2026-09-30T01:00:00.000Z'));
    await appendSnapshot(factory, makeSnapshot('bbb', itemIdA, '2026-09-30T01:00:00.000Z'));
    const latest = await getLatestSnapshots(factory);
    expect(latest.get(itemKey(itemIdA))?.snapshotId).toBe('bbb');
  });

  it('survives item deletion: removing a list item keeps its history', async () => {
    await appendSnapshot(factory, makeSnapshot('s1', itemIdA, '2026-09-30T01:00:00.000Z'));
    await putItem(factory, makeItem(itemIdA));
    await deleteItem(factory, itemIdA);
    expect(await getItem(factory, itemIdA)).toBeUndefined();
    expect((await getSnapshotsForItem(factory, itemIdA)).length).toBe(1);
  });
});

describe('promos store', () => {
  it('stores promos per vendor with audit fields', async () => {
    const promo: Promo = {
      promoId: 'p1',
      vendorId: 'vendor-1',
      type: 'same-item-count',
      thresholdValue: 2,
      effect: 'free-delivery',
      detectedAt: '2026-09-30T01:00:00.000Z',
      rawText: 'buy 2 - free delivery',
    };
    await putPromos(factory, [promo]);
    expect(await getAllPromos(factory)).toEqual([promo]);
  });
});

describe('clearAll (FR-16 privacy gate)', () => {
  it('empties every store and reports the removed count', async () => {
    await putItem(factory, makeItem(itemIdA));
    await putItem(factory, makeItem(itemIdB));
    await appendSnapshot(factory, makeSnapshot('s1', itemIdA, '2026-09-30T01:00:00.000Z'));
    const promo: Promo = {
      promoId: 'p1',
      vendorId: 'vendor-1',
      type: 'vendor-count',
      thresholdValue: 3,
      effect: 'free-delivery',
      detectedAt: '2026-09-30T01:00:00.000Z',
      rawText: 'x',
    };
    await putPromos(factory, [promo]);

    const removed = await clearAllStores(factory);
    expect(removed).toBe(4);
    expect(await getAllItems(factory)).toEqual([]);
    expect(await getSnapshotsForItem(factory, itemIdA)).toEqual([]);
    expect(await getAllPromos(factory)).toEqual([]);
  });

  it('is safe on an empty database', async () => {
    await expect(clearAllStores(factory)).resolves.toBe(0);
  });
});

describe('migration hook (forward-only)', () => {
  it('runs from 0 to current without error on v1 (initial shape)', async () => {
    await expect(runMigrations(factory, 0, DB_VERSION)).resolves.toBeUndefined();
  });

  it('refuses downgrades', async () => {
    await expect(runMigrations(factory, 3, 2)).rejects.toThrow(/downgrade/i);
  });

  it('is idempotent for repeated same-range runs', async () => {
    await runMigrations(factory, 0, DB_VERSION);
    await expect(runMigrations(factory, 0, DB_VERSION)).resolves.toBeUndefined();
  });
});
