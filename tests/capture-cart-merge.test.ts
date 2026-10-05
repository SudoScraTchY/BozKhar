/**
 * T03.5 merge policy tests: cart quantities win; existing snapshots stay as
 * history; existing items keep identity fields; no-variant lines skipped
 * explicitly.
 */
import { describe, expect, it } from 'vitest';
import { cartViewsToEntries, mergeCartIntoItems, type MergeEntry } from '../src/capture/cart-merge';
import type { CartItemView } from '../src/capture/readers/cart';
import type { ComparisonItem } from '../src/shared/types';

function itemView(over: Partial<CartItemView>): CartItemView {
  return {
    productId: '1001',
    variantId: '2001',
    title: 'گوشی',
    quantity: 1,
    sellerId: 's1',
    sellerName: 'فروشنده یک',
    priceRial: 1_000_000,
    feeRial: 49_000,
    feeIsKnownFree: false,
    sourceUrl: 'https://www.digikala.com/product/dkp-1001/?variant_id=2001',
    ...over,
  };
}

function existingItem(over: Partial<ComparisonItem>): ComparisonItem {
  return {
    itemId: { productId: '1001', variantId: '2001' },
    product: { id: '1001', title: 'قبلی' },
    variant: { id: '2001', label: 'نسخه ۶۴' },
    quantity: 1,
    lock: { mode: 'pin', vendorIds: ['s9'] },
    addedAt: '2026-10-01T00:00:00.000Z',
    latestSnapshotId: 'snap-old',
    ...over,
  };
}

describe('cart-merge (T03.5)', () => {
  it('cart quantities win over existing items', () => {
    const res = mergeCartIntoItems(
      [existingItem({ quantity: 1 })],
      [{ productId: '1001', variantId: '2001', title: 'گوشی', quantity: 3 }],
    );
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.quantity).toBe(3);
  });

  it('existing items keep identity fields (addedAt, lock, variant label)', () => {
    const res = mergeCartIntoItems(
      [existingItem({ quantity: 1, lock: { mode: 'pin', vendorIds: ['s9'] } })],
      [{ productId: '1001', variantId: '2001', title: 'گوشی', quantity: 2 }],
    );
    const item = res.items[0]!;
    expect(item.addedAt).toBe('2026-10-01T00:00:00.000Z');
    expect(item.lock).toEqual({ mode: 'pin', vendorIds: ['s9'] });
    expect(item.variant.label).toBe('نسخه ۶۴');
    // Snapshot pointer untouched: snapshots are history (SDD 08).
    expect(item.latestSnapshotId).toBe('snap-old');
  });

  it('new cart items get addedAt now and a no-op lock', () => {
    let calls = 0;
    const now = () => {
      calls++;
      return new Date(0);
    };
    const res = mergeCartIntoItems(
      [],
      [{ productId: '1002', variantId: '2002', title: 'هدفون', quantity: 2 }],
      now,
    );
    expect(calls).toBe(1);
    expect(res.items[0]).toMatchObject({
      itemId: { productId: '1002', variantId: '2002' },
      quantity: 2,
      lock: { mode: 'none', vendorIds: [] },
      addedAt: '1970-01-01T00:00:00.000Z',
    });
  });

  it('skips cart lines without a variant id and counts them explicitly', () => {
    const entries: MergeEntry[] = [
      { productId: '1003', variantId: '', title: 'بدون نسخه', quantity: 1 },
      { productId: '1004', variantId: '2004', title: 'خوب', quantity: 1 },
    ];
    const res = mergeCartIntoItems([], entries);
    expect(res.items.map((i) => i.itemId.productId)).toEqual(['1004']);
    expect(res.skippedNoVariant).toBe(1);
  });

  it('cartViewsToEntries drops empty identities from reader views', () => {
    const entries = cartViewsToEntries([
      itemView({}),
      itemView({ productId: '', variantId: '9999' }),
      itemView({ productId: '1005', variantId: null }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ productId: '1001', variantId: '2001' });
  });

  it('is pure: does not mutate the existing list', () => {
    const prior = existingItem({ quantity: 1 });
    const snapshotOfPrior = { ...prior };
    mergeCartIntoItems(
      [prior],
      [{ productId: '1001', variantId: '2001', title: 'گوشی', quantity: 7 }],
    );
    expect(prior).toEqual(snapshotOfPrior);
  });
});
