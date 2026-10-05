/**
 * T04 performance + envelope tests (SDD 07, OQ-09, FR-11).
 *
 * - 30 items × 10 vendors must solve < 1s, plain JS, one thread, no workers.
 * - The envelope (40 items / 15 vendors) runs exact; beyond it the mode flips
 *   to labeled `approximate`.
 * - selectMode / isWithinEnvelope unit checks.
 */
import { describe, expect, it } from 'vitest';
import { solve } from '../src/shared/solver';
import {
  MAX_EXACT_ITEMS,
  MAX_EXACT_VENDORS,
  isWithinEnvelope,
  selectMode,
} from '../src/shared/solver/envelope';
import type { SolverInput, SolverItem, SolverOffer } from '../src/shared/solver/types';

/** Deterministic xorshift PRNG - seeded, no Math.random anywhere. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 0xffffffff;
  };
}

function syntheticInput(itemCount: number, vendorCount: number, seed: number): SolverInput {
  const rng = makeRng(seed);
  const vendors = Array.from(
    { length: vendorCount },
    (_, i) => `V${String(i + 1).padStart(2, '0')}`,
  );
  const items: SolverItem[] = [];
  for (let i = 0; i < itemCount; i++) {
    // Every item is offered by ~60% of vendors, deterministic prices/fees.
    const offers: SolverOffer[] = [];
    for (const vendorId of vendors) {
      if (rng() > 0.6) continue;
      offers.push({
        vendorId,
        unitPrice: 100 + Math.floor(rng() * 900),
        stock: rng() < 0.95 ? 'in-stock' : 'out-of-stock',
        isLargeItem: false,
        fee: 5 + Math.floor(rng() * 45),
        plusCoversFee: false,
      });
    }
    if (offers.length === 0) {
      offers.push({
        vendorId: vendors[0] ?? 'V01',
        unitPrice: 500,
        stock: 'in-stock',
        isLargeItem: false,
        fee: 20,
        plusCoversFee: false,
      });
    }
    items.push({
      itemKey: `item-${String(i).padStart(3, '0')}::v`,
      quantity: 1,
      offers,
      lock: { mode: 'none', vendorIds: [] },
    });
  }
  return { items, promos: [], settings: { hasPlus: false, tolerancePercent: 2 } };
}

describe('T04 envelope unit checks (OQ-09)', () => {
  it('constants match the SDD scale envelope', () => {
    expect(MAX_EXACT_ITEMS).toBe(40);
    expect(MAX_EXACT_VENDORS).toBe(15);
  });

  it('selectMode: exact inside, approximate beyond', () => {
    expect(selectMode({ itemCount: 40, vendorCount: 15 })).toBe('exact');
    expect(selectMode({ itemCount: 41, vendorCount: 15 })).toBe('approximate');
    expect(selectMode({ itemCount: 40, vendorCount: 16 })).toBe('approximate');
    expect(selectMode({ itemCount: 1, vendorCount: 1 })).toBe('exact');
  });

  it('isWithinEnvelope agrees with selectMode', () => {
    expect(isWithinEnvelope({ itemCount: 40, vendorCount: 15 })).toBe(true);
    expect(isWithinEnvelope({ itemCount: 41, vendorCount: 15 })).toBe(false);
    expect(isWithinEnvelope({ itemCount: 30, vendorCount: 10 })).toBe(true);
  });
});

describe('T04 performance (SDD 07 DoD)', () => {
  it('30 items × 10 vendors solves in < 1s', () => {
    const input = syntheticInput(30, 10, 42);
    const t0 = performance.now();
    const { plan } = solve(input);
    const elapsed = performance.now() - t0;
    expect(plan.mode).toBe('exact');
    expect(plan.unsolved).toEqual([]);
    expect(elapsed).toBeLessThan(1000);
  });

  it('40 items × 15 vendors (envelope edge) still exact and sane', () => {
    const input = syntheticInput(40, 15, 7);
    const { plan } = solve(input);
    expect(plan.mode).toBe('exact');
    expect(plan.unsolved).toEqual([]);
    // FR-12 reconciliation still holds at scale.
    expect(plan.grandTotal).toBe(plan.itemSubtotal + plan.deliverySubtotal);
  });

  it('beyond the envelope: approximate mode is labeled as such', () => {
    const input = syntheticInput(45, 16, 11);
    const { plan } = solve(input);
    expect(plan.mode).toBe('approximate');
    // Approximate output satisfies the same structural invariants.
    expect(plan.grandTotal).toBe(plan.itemSubtotal + plan.deliverySubtotal);
  });
});
