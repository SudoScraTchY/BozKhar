import { describe, expect, it } from 'vitest';
import { solve } from '../src/shared/solver/solve';
import { approximateAssignments } from '../src/shared/solver/approximate';
import { buildFeeTable, buildGroups } from '../src/shared/solver/evaluate';
import type { SolverInput, SolverItem, SolverOffer } from '../src/shared/solver/types';

/**
 * D-23: fee consolidation in approximate mode.
 *
 * The user's exact example (2026-10-09 report):
 * Item A - vendor 1: 280, vendor 2: 320
 * Item B - vendor 2: 300
 * Each vendor package costs ~100. Consolidating both
 * items on vendor 2 = 320 + 300 + 100 = 720 beats
 * splitting = 280 + 100 + 300 + 100 = 780.
 *
 * The greedy baseline picks the per-item cheapest vendor
 * (A->v1, B->v2) with the fee only as a tie-breaker, so it
 * never evaluates the "join two items on one vendor" move.
 * The repair pass must find it.
 */
function offer(
  vendorId: string,
  vendorName: string,
  unitPrice: number,
  fee: number,
  variantId: string,
  feeSource?: SolverOffer['feeSource'],
): SolverOffer {
  return {
    vendorId,
    vendorName,
    unitPrice,
    stock: 'in-stock',
    isLargeItem: false,
    fee,
    feeSource,
    plusCoversFee: false,
    variantId,
  };
}

function userExampleItems(): SolverItem[] {
  return [
    {
      itemKey: 'A',
      title: 'Item A',
      quantity: 1,
      offers: [
        offer('v1', 'Vendor 1', 280, 100, 'a-v1'),
        offer('v2', 'Vendor 2', 320, 100, 'a-v2'),
      ],
      lock: { mode: 'none', vendorIds: [] },
    },
    {
      itemKey: 'B',
      title: 'Item B',
      quantity: 1,
      offers: [offer('v2', 'Vendor 2', 300, 100, 'b-v2')],
      lock: { mode: 'none', vendorIds: [] },
    },
  ];
}

const SETTINGS = { hasPlus: false, tolerancePercent: 0 };

describe('D-23 fee consolidation (approximate mode)', () => {
  it('repairs the greedy baseline to the vendor-consolidated arrangement (user example)', () => {
    const input: SolverInput = {
      items: userExampleItems(),
      promos: [],
      settings: SETTINGS,
    };
    const result = solve(input);
    // 320 + 300 + 100 (one package on vendor 2),
    // not 280 + 300 + 100 + 100 (two packages).
    expect(result.plan.grandTotal).toBe(720);
    expect(result.plan.groups).toHaveLength(1);
    expect(result.plan.groups[0]?.vendorId).toBe('v2');
    expect(result.plan.groups[0]?.fee).toBe(100);
  });

  it('never repairs into a worse arrangement than the greedy baseline', () => {
    // The repair pass is a pass over the baseline: it must
    // only apply a consolidation when it lowers the total.
    const input: SolverInput = {
      items: userExampleItems(),
      promos: [],
      settings: SETTINGS,
    };
    const greedyGroups = buildGroups(input, approximateAssignments(input)).groups;
    const greedyTotal = greedyGroups.reduce((sum, g) => sum + g.subtotal + (g.fee ?? 0), 0);
    const result = solve(input);
    expect(result.plan.grandTotal).toBeLessThanOrEqual(greedyTotal);
  });

  it('keeps splitting when consolidation does not pay off', () => {
    // v2's package fee is so large that the single-package
    // move still wins (290 + 300 + 1000 = 1590 beats
    // 280 + 100 + 300 + 1000 = 1680) - but make v2's
    // ITEM price terrible: then splitting on v1 for A is
    // cheaper than any consolidation on v2.
    const items: SolverItem[] = [
      {
        itemKey: 'A',
        title: 'Item A',
        quantity: 1,
        offers: [
          offer('v1', 'Vendor 1', 280, 100, 'a-v1'),
          offer('v2', 'Vendor 2', 900, 100, 'a-v2'),
        ],
        lock: { mode: 'none', vendorIds: [] },
      },
      {
        itemKey: 'B',
        title: 'Item B',
        quantity: 1,
        offers: [offer('v2', 'Vendor 2', 300, 100, 'b-v2')],
        lock: { mode: 'none', vendorIds: [] },
      },
    ];
    const input: SolverInput = { items, promos: [], settings: SETTINGS };
    const result = solve(input);
    // Splitting: 280 + 100 + 300 + 100 = 780.
    // Consolidating on v2: 900 + 300 + 100 = 1300.
    // Splitting must win.
    expect(result.plan.grandTotal).toBe(780);
    expect(result.plan.groups).toHaveLength(2);
  });
});

describe('D-22 fee table prefers shipment-observed fees', () => {
  it('uses the live package fee over the product-API estimate', () => {
    // The product API guesses 250 for v2; the live quote
    // (feeSource 'shipment') says the real charge is 100.
    const items: SolverItem[] = [
      {
        itemKey: 'A',
        quantity: 1,
        offers: [
          offer('v2', 'Vendor 2', 320, 100, 'a-v2', 'shipment'),
          offer('v2', 'Vendor 2', 320, 250, 'a-v3', 'product-api'),
        ],
        lock: { mode: 'none', vendorIds: [] },
      },
    ];
    const table = buildFeeTable({ items, promos: [], settings: SETTINGS });
    expect(table.seller.get('v2')).toBe(100);
  });

  it('charges the higher of two observed packages for one vendor', () => {
    // SDD 08: never quote a total too low. Two observed
    // packages for one vendor in one quote means two
    // separate fees - the table charges the higher.
    const items: SolverItem[] = [
      {
        itemKey: 'A',
        quantity: 1,
        offers: [offer('v2', 'Vendor 2', 320, 100, 'a-v2', 'shipment')],
        lock: { mode: 'none', vendorIds: [] },
      },
      {
        itemKey: 'B',
        quantity: 1,
        offers: [offer('v2', 'Vendor 2', 300, 250, 'b-v2', 'shipment')],
        lock: { mode: 'none', vendorIds: [] },
      },
    ];
    const table = buildFeeTable({ items, promos: [], settings: SETTINGS });
    expect(table.seller.get('v2')).toBe(250);
  });
});
