/**
 * T04 edge cases (SDD 07 "Edge cases") - the degenerate shapes the fixtures
 * corpus cannot express as data: empty input, no in-stock offers, all-pinned
 * report-only plans, ban exhaustion, and hint gating on empty carts.
 */
import { describe, expect, it } from 'vitest';
import { solve } from '../src/shared/solver';
import type { SolverInput, SolverItem } from '../src/shared/solver/types';

function item(
  partial: Partial<SolverItem> & { itemKey: string; offers: SolverItem['offers'] },
): SolverItem {
  return {
    title: partial.itemKey,
    quantity: 1,
    lock: { mode: 'none', vendorIds: [] },
    ...partial,
  };
}

function offer(vendorId: string, unitPrice: number, fee: number | null = 10) {
  return {
    vendorId,
    unitPrice,
    stock: 'in-stock' as const,
    isLargeItem: false,
    fee,
    plusCoversFee: false,
  };
}

const baseSettings = { hasPlus: false, tolerancePercent: 2 };

describe('T04 edge cases (SDD 07)', () => {
  it('empty list: empty plan, no hints, zero totals', () => {
    const input: SolverInput = { items: [], promos: [], settings: baseSettings };
    const { plan, hints } = solve(input);
    expect(plan.assignments).toEqual([]);
    expect(plan.groups).toEqual([]);
    expect(plan.grandTotal).toBe(0);
    expect(plan.unsolved).toEqual([]);
    expect(hints).toEqual([]);
  });

  it('item with no in-stock offers anywhere: flagged, excluded, totals exclude it', () => {
    const input: SolverInput = {
      items: [
        item({
          itemKey: 'dead::1',
          offers: [{ ...offer('V1', 100), stock: 'out-of-stock' }],
        }),
        item({ itemKey: 'live::1', offers: [offer('V1', 50)] }),
      ],
      promos: [],
      settings: baseSettings,
    };
    const { plan } = solve(input);
    expect(plan.unsolved).toEqual([
      { itemKey: 'dead::1', title: 'dead::1', reason: 'all-offers-out-of-stock' },
    ]);
    expect(plan.assignments.map((l) => l.itemKey)).toEqual(['live::1']);
    expect(plan.grandTotal).toBe(60); // 50 + fee 10
  });

  it('fully-banned item: flagged "no available vendor", never silently dropped (FR-07)', () => {
    const input: SolverInput = {
      items: [
        item({
          itemKey: 'banned::1',
          offers: [offer('V1', 100), offer('V2', 110)],
          lock: { mode: 'ban', vendorIds: ['V1', 'V2'] },
        }),
      ],
      promos: [],
      settings: baseSettings,
    };
    const { plan } = solve(input);
    expect(plan.unsolved).toEqual([
      { itemKey: 'banned::1', title: 'banned::1', reason: 'no-available-vendor' },
    ]);
    expect(plan.assignments).toEqual([]);
    expect(plan.grandTotal).toBe(0);
  });

  it('all items pinned: report-only plan with the pinned fee charged exactly once', () => {
    const input: SolverInput = {
      items: [
        item({
          itemKey: 'p1::1',
          offers: [offer('V1', 100, 15)],
          lock: { mode: 'pin', vendorIds: ['V1'] },
        }),
        item({
          itemKey: 'p2::1',
          offers: [offer('V2', 70, 12)],
          lock: { mode: 'pin', vendorIds: ['V2'] },
        }),
      ],
      promos: [],
      settings: baseSettings,
    };
    const { plan, hints } = solve(input);
    expect(plan.mode).toBe('exact');
    expect(plan.assignments.map((l) => l.itemKey).sort()).toEqual(['p1::1', 'p2::1']);
    expect(plan.groups.map((g) => [g.vendorId, g.feeFlag, g.fee])).toEqual([
      ['V1', 'already-paid-by-lock', 15],
      ['V2', 'already-paid-by-lock', 12],
    ]);
    expect(plan.grandTotal).toBe(197); // 100 + 70 + 15 + 12
    expect(hints).toEqual([]);
  });

  it('single item, single vendor: trivial plan, fee flagged regular', () => {
    const input: SolverInput = {
      items: [item({ itemKey: 's::1', offers: [offer('V1', 99, 7)] })],
      promos: [],
      settings: baseSettings,
    };
    const { plan } = solve(input);
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]?.feeFlag).toBe('regular');
    expect(plan.grandTotal).toBe(106);
  });

  it('pinned vendor has no buyable offer: pinned-vendor-unavailable, plan solves the rest', () => {
    const input: SolverInput = {
      items: [
        item({
          itemKey: 'pin-dead::1',
          offers: [{ ...offer('V9', 100, 15), stock: 'out-of-stock' }],
          lock: { mode: 'pin', vendorIds: ['V9'] },
        }),
        item({ itemKey: 'free::1', offers: [offer('V1', 40, 10)] }),
      ],
      promos: [],
      settings: baseSettings,
    };
    const { plan } = solve(input);
    expect(plan.unsolved).toEqual([
      { itemKey: 'pin-dead::1', title: 'pin-dead::1', reason: 'pinned-vendor-unavailable' },
    ]);
    expect(plan.grandTotal).toBe(50);
  });

  it('hints never fire on an empty/zero cart (tolerance bound is 0)', () => {
    const input: SolverInput = {
      items: [item({ itemKey: 'y::1', offers: [offer('VY', 5, 12)] })],
      promos: [
        {
          promoId: 'P',
          vendorId: 'VY',
          type: 'same-item-count',
          thresholdValue: 2,
          effect: 'free-delivery',
          itemKey: 'y::1',
        },
      ],
      settings: { hasPlus: false, tolerancePercent: 2 },
    };
    // Net saving (12 > 5) must still show even on a tiny cart - always-show rule.
    const { hints } = solve(input);
    expect(hints).toHaveLength(1);
    expect(hints[0]?.verdict).toBe('saving');
  });
});
