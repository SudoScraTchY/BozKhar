/**
 * Hub-set candidate search (approximate mode).
 *
 * Both the greedy baseline and the D-23 fee repair are local: the baseline
 * ranks by unit price alone (so a cheaper total on a dearer package can lose),
 * and the repair can only merge a *single-item* group onto a vendor the plan
 * already uses (so it can neither re-anchor a whole package onto a cheaper
 * vendor nor send an item back to a solo vendor with a cheaper fee).
 *
 * `solve()` only reaches this pass above the exact envelope, so the small
 * cases below probe `bestHubSetPlan` directly; the end-to-end cart that
 * reported the bug is fixture `hub-set-hijack`.
 */
import { describe, expect, it } from 'vitest';
import { prefilter } from '../src/shared/solver/enumerate';
import { approximateAssignments } from '../src/shared/solver/approximate';
import { consolidateFees } from '../src/shared/solver/consolidate';
import { bestHubSetPlan } from '../src/shared/solver/hubs';
import { perItemCheapestBaseline, scoringTotal } from '../src/shared/solver/evaluate';
import type { SolverInput, SolverItem, SolverOffer } from '../src/shared/solver/types';

const SETTINGS = { hasPlus: false, tolerancePercent: 0 };

function offer(vendorId: string, unitPrice: number, fee: number | null): SolverOffer {
  return {
    vendorId,
    unitPrice,
    stock: 'in-stock',
    isLargeItem: false,
    fee,
    plusCoversFee: false,
  };
}

function item(itemKey: string, offers: SolverOffer[]): SolverItem {
  return { itemKey, quantity: 1, offers, lock: { mode: 'none', vendorIds: [] } };
}

/** The fee-repair result the hub pass is handed (greedy + D-23). */
function beforeHub(input: SolverInput) {
  return consolidateFees(input, perItemCheapestBaseline(input));
}

function vendorByItem(input: SolverInput, assignments: ReturnType<typeof beforeHub>) {
  const byKey: Record<string, string> = {};
  for (const a of assignments) byKey[a.itemKey] = a.vendorId;
  return byKey;
}

describe('hub-set search repairs fee-blind greedy choices', () => {
  it('returns an item to the solo vendor whose total is cheaper', () => {
    // v2 wins on unit price (90 < 100) but its package is 200; v1's total is
    // 140 against v2's 290. The greedy baseline takes v2 and the D-23 repair
    // never looks at v1 (nothing else uses it).
    const input: SolverInput = {
      items: [
        item('A', [offer('v1', 100, 40), offer('v2', 90, 200)]),
        item('B', [offer('v3', 50, 30)]),
      ],
      promos: [],
      settings: SETTINGS,
    };
    const before = beforeHub(input);
    const after = bestHubSetPlan(input, prefilter(input), before);

    expect(scoringTotal(input, before)).toBe(370);
    expect(scoringTotal(input, after)).toBe(220);
    expect(vendorByItem(input, after)['A']).toBe('v1');
  });

  it('re-anchors a shared package onto a vendor with a cheaper fee', () => {
    // A and B both sit on ve (fee 300) because it is cheapest per unit; vc
    // serves both for 20 more each and charges 100, so the package moves.
    const input: SolverInput = {
      items: [
        item('A', [offer('ve', 100, 300), offer('vc', 110, 100)]),
        item('B', [offer('ve', 100, 300), offer('vc', 120, 100)]),
        item('C', [offer('vs', 50, 30)]),
      ],
      promos: [],
      settings: SETTINGS,
    };
    const before = beforeHub(input);
    const after = bestHubSetPlan(input, prefilter(input), before);

    expect(scoringTotal(input, before)).toBe(580);
    expect(scoringTotal(input, after)).toBe(410);
    expect(vendorByItem(input, after)).toEqual({ A: 'vc', B: 'vc', C: 'vs' });
  });

  it('never returns a plan dearer than the one it was handed', () => {
    // The D-23 example is already optimal: v2 is the cheapest package AND the
    // cheapest unit there. Every hub set must lose or tie, so the pass is a
    // no-op.
    const input: SolverInput = {
      items: [
        item('A', [offer('v1', 280, 100), offer('v2', 320, 100)]),
        item('B', [offer('v2', 300, 100)]),
      ],
      promos: [],
      settings: SETTINGS,
    };
    const before = beforeHub(input);
    const after = bestHubSetPlan(input, prefilter(input), before);

    expect(scoringTotal(input, before)).toBe(720);
    expect(vendorByItem(input, after)).toEqual({ A: 'v2', B: 'v2' });
    // And the whole approximate pipeline agrees.
    expect(vendorByItem(input, approximateAssignments(input))).toEqual({ A: 'v2', B: 'v2' });
  });

  it('is deterministic', () => {
    const input: SolverInput = {
      items: [
        item('A', [offer('ve', 100, 300), offer('vc', 110, 100)]),
        item('B', [offer('ve', 100, 300), offer('vc', 120, 100)]),
        item('C', [offer('vs', 50, 30)]),
      ],
      promos: [],
      settings: SETTINGS,
    };
    const first = bestHubSetPlan(input, prefilter(input), beforeHub(input));
    const second = bestHubSetPlan(input, prefilter(input), beforeHub(input));
    expect(first).toEqual(second);
  });

  it('charges an unknown fee at the fallback when ranking hubs', () => {
    // va's fee is unknown (null): it scores at unknownFeeFallback, so the
    // cheap-fee vb hub still wins even though va is cheaper per unit.
    const input: SolverInput = {
      items: [
        item('A', [offer('va', 100, null), offer('vb', 130, 20)]),
        item('B', [offer('vb', 100, 20)]),
      ],
      promos: [],
      settings: SETTINGS,
      unknownFeeFallback: 500,
    };
    const after = bestHubSetPlan(input, prefilter(input), beforeHub(input));
    expect(vendorByItem(input, after)['A']).toBe('vb');
  });
});
