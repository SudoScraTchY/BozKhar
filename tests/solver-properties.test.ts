/**
 * T04 property tests (SDD 07 "Determinism and testing") - seeded, bounded
 * randomized inputs. The plan's total never exceeds the per-item-cheapest
 * baseline's total and never exceeds any supplied alternative assignment;
 * identical inputs produce byte-identical output (FR-11).
 */
import { describe, expect, it } from 'vitest';
import { solve } from '../src/shared/solver';
import { perItemCheapestBaseline } from '../src/shared/solver/evaluate';
import { prefilter, assignmentTotal } from '../src/shared/solver/enumerate';
import type { Assignment } from '../src/shared/solver/evaluate';
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

function randomInput(rng: () => number): SolverInput {
  const vendorCount = 2 + Math.floor(rng() * 4); // 2..5 vendors
  const vendors = Array.from({ length: vendorCount }, (_, i) => `V${i + 1}`);
  const itemCount = 2 + Math.floor(rng() * 5); // 2..6 items
  const items: SolverItem[] = [];
  const promos: SolverInput['promos'] = [];

  for (let i = 0; i < itemCount; i++) {
    const offerCount = 1 + Math.floor(rng() * vendorCount);
    const shuffled = [...vendors].sort(() => rng() - 0.5).slice(0, offerCount);
    const offers: SolverOffer[] = shuffled.map((vendorId) => ({
      vendorId,
      unitPrice: 10 + Math.floor(rng() * 90),
      stock: rng() < 0.9 ? 'in-stock' : 'out-of-stock',
      isLargeItem: false,
      fee: rng() < 0.85 ? 5 + Math.floor(rng() * 30) : null,
      plusCoversFee: false,
    }));
    const lockRoll = rng();
    const lock =
      lockRoll < 0.15
        ? { mode: 'pin' as const, vendorIds: [shuffled[0] ?? 'V1'] }
        : lockRoll < 0.3
          ? {
              mode: 'ban' as const,
              vendorIds: shuffled.slice(0, Math.max(1, shuffled.length - 1)),
            }
          : { mode: 'none' as const, vendorIds: [] };
    items.push({
      itemKey: `item-${i}::v`,
      quantity: 1 + Math.floor(rng() * 2),
      offers,
      lock,
    });
  }

  // Occasionally attach a reachable vendor-count promo.
  if (rng() < 0.5) {
    promos.push({
      promoId: 'P-VC',
      vendorId: vendors[0] ?? 'V1',
      type: 'vendor-count',
      thresholdValue: 2 + Math.floor(rng() * 3),
      effect: 'free-delivery',
    });
  }

  return {
    items,
    promos,
    settings: { hasPlus: rng() < 0.3, tolerancePercent: 2 },
    unknownFeeFallback: 50,
  };
}

describe('T04 properties (seeded randomization)', () => {
  const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i);

  it('plan total <= per-item-cheapest baseline total, for every seed', () => {
    for (const seed of SEEDS) {
      const input = randomInput(makeRng(seed));
      const { plan } = solve(input);
      const baseline = perItemCheapestBaseline(input);
      const baselineTotal = assignmentTotal(input, baseline);
      expect(
        plan.grandTotal,
        `seed ${seed}: plan ${plan.grandTotal} > baseline ${baselineTotal}`,
      ).toBeLessThanOrEqual(baselineTotal);
    }
  });

  it('plan total <= any supplied alternative assignment, for every seed', () => {
    for (const seed of SEEDS) {
      const input = randomInput(makeRng(seed));
      const { plan } = solve(input);
      const pf = prefilter(input);

      // Every feasible alternative via cartesian growth over per-item
      // candidates, capped hard: 2..6 items x <=5 offers stays small.
      // Pinned items contribute their fixed assignment to every alternative,
      // so totals are comparable across the same item set.
      let combos: Assignment[][] = [pf.pinned.map((a) => ({ ...a }))];
      for (const s of pf.solvable) {
        const next: Assignment[][] = [];
        for (const combo of combos) {
          for (const o of s.candidates) {
            next.push([
              ...combo,
              {
                itemKey: s.item.itemKey,
                vendorId: o.vendorId,
                unitPrice: o.unitPrice,
                quantity: s.item.quantity,
                isLargeItem: o.isLargeItem,
                plusCoversFee: o.plusCoversFee,
                fee: o.fee,
              },
            ]);
          }
        }
        combos = next;
        if (combos.length > 5000) break; // safety net; cannot trigger at these sizes
      }
      const complete = combos.filter((c) => c.length === pf.solvable.length);
      for (const alt of complete) {
        const altTotal = assignmentTotal(input, alt);
        expect(
          plan.grandTotal,
          `seed ${seed}: plan ${plan.grandTotal} > alternative ${altTotal}`,
        ).toBeLessThanOrEqual(altTotal);
      }
    }
  });

  it('determinism: identical input -> byte-identical plan and hints (FR-11)', () => {
    for (const seed of SEEDS) {
      const input = randomInput(makeRng(seed));
      const a = solve(structuredClone(input));
      const b = solve(structuredClone(input));
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });

  it('every emitted hint is auditable: arithmetic reconciles', () => {
    for (const seed of SEEDS) {
      const input = randomInput(makeRng(seed));
      const { hints } = solve(input);
      for (const h of hints) {
        expect(h.netEffect).toBe(h.feeRemoved - h.extraUnitCost);
        if (h.verdict === 'within-tolerance') {
          expect(h.netEffect).toBeLessThanOrEqual(0);
          expect(-h.netEffect).toBeLessThanOrEqual(h.toleranceBound);
        } else {
          expect(h.netEffect).toBeGreaterThan(0);
        }
      }
    }
  });
});
