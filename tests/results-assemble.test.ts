/**
 * Assembler tests (T05.1): cart items + append-only
 * snapshots -> solver input. Covers the D-17 variant
 * spanning, the current-cart total under the solver's
 * fee model, and the unknown-fee honesty (SDD 08).
 */
import { describe, expect, it } from 'vitest';
import {
  buildSolverInput,
  currentCartTotal,
  itemKeyOf,
  latestSnapshotsByItem,
  snapshotsForProduct,
} from '../src/results/assemble';
import type { ComparisonItem, Snapshot } from '../src/shared/types';

function item(productId: string, variantId: string, quantity = 1): ComparisonItem {
  return {
    itemId: { productId, variantId },
    product: { id: productId, title: `محصول ${productId}` },
    variant: { id: variantId, label: `گونه ${variantId}` },
    quantity,
    lock: { mode: 'none', vendorIds: [] },
    addedAt: '2026-10-08T10:00:00Z',
  };
}

function snapshot(
  productId: string,
  variantId: string,
  vendorId: string,
  vendorName: string,
  price: number,
  fee: number | null,
  capturedAt = '2026-10-08T12:00:00Z',
  imageUrl?: string,
): Snapshot {
  return {
    snapshotId: `${productId}::${variantId}::${capturedAt}`,
    itemId: { productId, variantId },
    offers: [
      {
        vendor: { id: vendorId, name: vendorName },
        price,
        stockState: 'in-stock',
        isLargeItem: false,
        delivery: { feeAmount: fee, provenance: 'page-visible', plusApplies: false },
        promoIds: [],
        capturedAt,
        extractorVersion: '0.3.0-t03',
        sourceUrl: `https://api.digikala.com/product/v1/products/${productId}/`,
      },
    ],
    promos: [],
    capturedAt,
    extractorVersion: '0.3.0-t03',
    ...(imageUrl ? { imageUrl } : {}),
  };
}

describe('assembler (T05.1)', () => {
  it('spans every captured variant of the product as an offer (D-17)', () => {
    const items = [item('p1', 'v1')];
    const snapshots = [
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10),
      snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 80, 10),
      snapshot('p1', 'v3', 'vend-c', 'فروشنده ج', 60, 10),
    ];
    const input = buildSolverInput(items, snapshots, {
      hasPlus: false,
      tolerancePercent: 2,
    });
    expect(input.items).toHaveLength(1);
    // The cart holds v1, but the solver may choose any
    // captured variant of the same product.
    expect(input.items[0]!.offers).toHaveLength(3);
    expect(input.items[0]!.offers.map((o) => o.variantId).sort()).toEqual(['v1', 'v2', 'v3']);
    expect(input.items[0]!.offers[1]!.unitPrice).toBe(80);
  });

  it('passes the product picture through to the solver input (issue #10)', () => {
    const items = [item('p1', 'v1')];
    const snapshots = [
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10),
      snapshot(
        'p1',
        'v2',
        'vend-b',
        'فروشنده ب',
        80,
        10,
        '2026-10-08T10:00:00Z',
        'https://dkstatics-public.digikala.com/digikala-products/pic.jpg',
      ),
    ];
    const input = buildSolverInput(items, snapshots, {
      hasPlus: false,
      tolerancePercent: 2,
    });
    // Display-only: the picture rides the item the results
    // page renders; the solve never reads it.
    expect(input.items[0]!.imageUrl).toBe(
      'https://dkstatics-public.digikala.com/digikala-products/pic.jpg',
    );
    // A product with no captured picture stays undefined.
    const noPic = buildSolverInput(
      [item('p2', 'v1')],
      [snapshot('p2', 'v1', 'vend-a', 'فروشنده الف', 100, 10)],
      { hasPlus: false, tolerancePercent: 2 },
    );
    expect(noPic.items[0]!.imageUrl).toBeUndefined();
  });

  it('computes the current-cart total with the fee model (one fee per vendor x class)', () => {
    // Two items from the same vendor, one fee; plus a
    // second vendor with its own fee.
    const items = [item('p1', 'v1', 2), item('p2', 'v2', 1)];
    const snapshots = [
      snapshot('p1', 'v1', 'vend-a', 'الف', 100, 50),
      snapshot('p2', 'v2', 'vend-a', 'الف', 200, 50),
    ];
    // 2*100 + 1*200 = 400 items; one 50 fee for the
    // single seller-class group.
    expect(currentCartTotal(items, snapshots)).toBe(450);
  });

  it('returns null for the current total when a fee is unknown (SDD 08)', () => {
    const items = [item('p1', 'v1')];
    const snapshots = [snapshot('p1', 'v1', 'vend-a', 'الف', 100, null)];
    expect(currentCartTotal(items, snapshots)).toBeNull();
  });

  it('returns null for the current total when a cart item has no capture', () => {
    const items = [item('p1', 'v1'), item('p9', 'v9')];
    const snapshots = [snapshot('p1', 'v1', 'vend-a', 'الف', 100, 10)];
    expect(currentCartTotal(items, snapshots)).toBeNull();
  });

  it('charges large items as their own shipment class with their own fee', () => {
    const items = [item('p1', 'v1')];
    const snaps = [snapshot('p1', 'v1', 'vend-a', 'الف', 100, 50)];
    snaps[0]!.offers[0]!.isLargeItem = true;
    // Large class: the fee still counts once, but it is
    // never Plus-covered (D-13) - the total is the same
    // arithmetic, the class is what differs downstream.
    expect(currentCartTotal(items, snaps)).toBe(150);
  });

  it('latestSnapshotsByItem keeps the newest capture per item key', () => {
    const old = snapshot('p1', 'v1', 'vend-a', 'الف', 100, 10, '2026-10-08T10:00:00Z');
    const fresh = snapshot('p1', 'v1', 'vend-a', 'الف', 90, 10, '2026-10-08T13:00:00Z');
    const map = latestSnapshotsByItem([old, fresh]);
    expect(map.get(itemKeyOf('p1', 'v1'))?.capturedAt).toBe('2026-10-08T13:00:00Z');
  });

  it('snapshotsForProduct returns only that product captures', () => {
    const snaps = [
      snapshot('p1', 'v1', 'vend-a', 'الف', 100, 10),
      snapshot('p2', 'v2', 'vend-b', 'ب', 200, 20),
    ];
    expect(snapshotsForProduct(snaps, 'p1')).toHaveLength(1);
    expect(snapshotsForProduct(snaps, 'p2')).toHaveLength(1);
    expect(snapshotsForProduct(snaps, 'p3')).toHaveLength(0);
  });

  it('sets the unknown-fee fallback to the largest known fee', () => {
    const items = [item('p1', 'v1')];
    const snapshots = [
      snapshot('p1', 'v1', 'vend-a', 'الف', 100, 30),
      snapshot('p1', 'v2', 'vend-b', 'ب', 80, 90),
    ];
    const input = buildSolverInput(items, snapshots, {
      hasPlus: false,
      tolerancePercent: 2,
    });
    expect(input.unknownFeeFallback).toBe(90);
  });

  it('solver can switch to the cheaper variant end-to-end', async () => {
    // The integration the user asked for: the cart holds
    // the expensive variant; the plan switches to the
    // cheaper one and the savings are real.
    const { solve } = await import('../src/shared/solver');
    const items = [item('p1', 'v-expensive')];
    const snapshots = [
      snapshot('p1', 'v-expensive', 'vend-a', 'الف', 500, 50),
      snapshot('p1', 'v-cheap', 'vend-b', 'ب', 200, 50),
    ];
    const input = buildSolverInput(items, snapshots, {
      hasPlus: false,
      tolerancePercent: 2,
    });
    const { plan } = solve(input);
    expect(plan.comparison?.currentCartTotal).toBe(550);
    expect(plan.grandTotal).toBe(250);
    expect(plan.comparison?.savings).toBe(300);
    // The plan says WHICH variant it switched to (D-17
    // passthrough) - the report is actionable.
    expect(plan.assignments[0]?.variantId).toBe('v-cheap');
  });

  it('savings is null (not zero) when a current fee is unknown', async () => {
    // The report must not claim "no cheaper arrangement"
    // when the real reason is that the current total
    // cannot be computed honestly (unknown fee, SDD 08).
    const { solve } = await import('../src/shared/solver');
    const items = [item('p1', 'v1')];
    const snapshots = [
      snapshot('p1', 'v1', 'vend-a', 'الف', 500, null),
      snapshot('p1', 'v2', 'vend-b', 'ب', 200, 50),
    ];
    const input = buildSolverInput(items, snapshots, {
      hasPlus: false,
      tolerancePercent: 2,
    });
    expect(input.currentCartTotal).toBeNull();
    const { plan } = solve(input);
    expect(plan.comparison?.savings).toBeNull();
    // The plan still switches to the cheaper variant -
    // choosing uses the fallback fee (SDD 08), only the
    // displayed comparison is withheld.
    expect(plan.assignments[0]?.variantId).toBe('v2');
  });

  // ---- D-19: shipment-quote fee correction ----

  const shipment = {
    key: 'latest' as const,
    capturedAt: '2026-10-09T12:00:00Z',
    packages: [
      {
        shipmentId: 'pkg-1',
        shippingCost: 1200000,
        items: [{ productId: 'p1', variantId: 'v1' }],
      },
    ],
  };

  it('prices the current arrangement with the real package fee (D-19)', () => {
    // The product API reported no fee for the current
    // offer; the quote says the package costs 1,200,000.
    const items = [item('p1', 'v1')];
    const snapshots = [snapshot('p1', 'v1', 'vend-a', 'الف', 500, null)];
    expect(currentCartTotal(items, snapshots)).toBeNull();
    expect(currentCartTotal(items, snapshots, shipment)).toBe(1200500);
  });

  it('the quote overrides a stale product-API fee', () => {
    const items = [item('p1', 'v1')];
    const snapshots = [snapshot('p1', 'v1', 'vend-a', 'الف', 500, 999)];
    expect(currentCartTotal(items, snapshots, shipment)).toBe(1200500);
  });

  it('only the current variant is priced from the quote', async () => {
    // The cart holds v1 (in the quoted package); v2 is an
    // alternative arrangement whose package fee was never
    // observed - it keeps the product-API fee.
    const { solve } = await import('../src/shared/solver');
    const items = [item('p1', 'v1')];
    const snapshots = [
      snapshot('p1', 'v1', 'vend-a', 'الف', 500, null),
      snapshot('p1', 'v2', 'vend-b', 'ب', 400, 50),
    ];
    const input = buildSolverInput(
      items,
      snapshots,
      { hasPlus: false, tolerancePercent: 2 },
      shipment,
    );
    const current = input.items[0]?.offers.find((o) => o.variantId === 'v1');
    const alternative = input.items[0]?.offers.find((o) => o.variantId === 'v2');
    expect(current?.fee).toBe(1200000);
    expect(alternative?.fee).toBe(50);
    // The current total is computable now (the quote
    // filled the gap), so the comparison is honest.
    expect(input.currentCartTotal).toBe(1200500);
    const { plan } = solve(input);
    expect(plan.comparison?.currentCartTotal).toBe(1200500);
  });

  it('a multi-item package shares one fee across the group', () => {
    // Two cart items in one quoted package: both current
    // offers carry the package fee; the group model
    // charges it ONCE (the real checkout behavior).
    const multi = {
      key: 'latest' as const,
      capturedAt: '2026-10-09T12:00:00Z',
      packages: [
        {
          shipmentId: 'pkg-shared',
          shippingCost: 1100000,
          items: [
            { productId: 'p1', variantId: 'v1' },
            { productId: 'p2', variantId: 'v2' },
          ],
        },
      ],
    };
    const items = [item('p1', 'v1'), item('p2', 'v2')];
    const snapshots = [
      snapshot('p1', 'v1', 'vend-a', 'الف', 500, null),
      snapshot('p2', 'v2', 'vend-a', 'الف', 300, null),
    ];
    // Same vendor: one group, one package fee.
    expect(currentCartTotal(items, snapshots, multi)).toBe(1100800);
  });

  it('a variant absent from the quote keeps its product-API fee', () => {
    const items = [item('p9', 'v9')];
    const snapshots = [snapshot('p9', 'v9', 'vend-a', 'الف', 100, 30)];
    expect(currentCartTotal(items, snapshots, shipment)).toBe(130);
  });

  it('no quote captured: behavior is unchanged', () => {
    const items = [item('p1', 'v1')];
    const snapshots = [snapshot('p1', 'v1', 'vend-a', 'الف', 500, 40)];
    expect(currentCartTotal(items, snapshots, null)).toBe(540);
    expect(currentCartTotal(items, snapshots, undefined)).toBe(540);
    const input = buildSolverInput(items, snapshots, { hasPlus: false, tolerancePercent: 2 }, null);
    expect(input.items[0]?.offers[0]?.fee).toBe(40);
  });
});
