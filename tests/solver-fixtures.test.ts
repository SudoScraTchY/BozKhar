/**
 * T04 fixture suite - every worked example and themed case from
 * SDD 07-solver-behavior.md, loaded from tests/fixtures/solver/*.json.
 *
 * The fixtures are the spec's numbers, verbatim: fee-coupling (117 vs naive
 * 130), xyz-gating (all three sub-cases incl. outright Z rejection),
 * lock-ride-along (113 for the unlocked portion), plus promo satisfaction,
 * Plus on/off, unknown fees, quantities, ties and degenerate cases.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { solve } from '../src/shared/solver';
import type { SolverInput } from '../src/shared/solver/types';

interface FixtureExpect {
  mode?: 'exact' | 'approximate';
  grandTotal?: number;
  itemSubtotal?: number;
  deliverySubtotal?: number;
  assignments?: Record<string, string>;
  groups?: Array<{
    vendorId: string;
    feeFlag: string;
    fee: number | null;
    promoIds?: string[];
    lineItemKeys?: string[];
  }>;
  hints?: Array<{
    itemKey: string;
    promoId?: string;
    extraUnitCost: number;
    feeRemoved: number;
    netEffect: number;
    verdict: string;
    toleranceBound?: number;
  }>;
  absentHintItemKeys?: string[];
  hiddenHintItemKeys?: string[];
  totalIsEstimate?: boolean;
  estimateRange?: { low: number; high: number };
  baselineTotal?: number;
  variant?: {
    hasPlus?: boolean;
    tolerancePercent?: number;
    unknownFeeFallback?: number;
    grandTotal?: number;
    groups?: FixtureExpect['groups'];
    hints?: FixtureExpect['hints'];
    note?: string;
  };
  note?: string;
}

interface Fixture {
  name: string;
  description: string;
  input: SolverInput;
  expect: FixtureExpect;
}

const FIXTURE_DIR = join(__dirname, 'fixtures', 'solver');

function loadFixtures(): Fixture[] {
  return readdirSync(FIXTURE_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(FIXTURE_DIR, f), 'utf-8')) as Fixture);
}

function withVariant(input: SolverInput, v: NonNullable<FixtureExpect['variant']>): SolverInput {
  return {
    ...input,
    settings: {
      hasPlus: v.hasPlus ?? input.settings.hasPlus,
      tolerancePercent: v.tolerancePercent ?? input.settings.tolerancePercent,
    },
    unknownFeeFallback: v.unknownFeeFallback ?? input.unknownFeeFallback,
  };
}

function assertExpectation(input: SolverInput, exp: FixtureExpect): void {
  const { plan, hints } = solve(input);

  if (exp.mode !== undefined) expect(plan.mode).toBe(exp.mode);
  if (exp.grandTotal !== undefined) expect(plan.grandTotal).toBe(exp.grandTotal);
  if (exp.itemSubtotal !== undefined) expect(plan.itemSubtotal).toBe(exp.itemSubtotal);
  if (exp.deliverySubtotal !== undefined) expect(plan.deliverySubtotal).toBe(exp.deliverySubtotal);

  if (exp.assignments) {
    const byKey: Record<string, string> = {};
    // Recover vendor per item from the groups (plan lines do not carry it).
    for (const g of plan.groups) {
      for (const line of g.lines) byKey[line.itemKey] = g.vendorId;
    }
    expect(Object.keys(byKey).sort()).toEqual(Object.keys(exp.assignments).sort());
    for (const [k, v] of Object.entries(exp.assignments)) {
      expect(byKey[k]).toBe(v);
    }
  }

  if (exp.groups) {
    expect(plan.groups.length).toBe(exp.groups.length);
    for (const g of exp.groups) {
      const match = plan.groups.find((p) => p.vendorId === g.vendorId);
      expect(match, `group for ${g.vendorId}`).toBeDefined();
      if (!match) continue;
      expect(match.feeFlag).toBe(g.feeFlag);
      expect(match.fee).toBe(g.fee);
      if (g.promoIds) expect(match.promoIds).toEqual(g.promoIds);
      if (g.lineItemKeys) expect(match.lines.map((l) => l.itemKey)).toEqual(g.lineItemKeys);
    }
  }

  if (exp.hints) {
    expect(hints.length).toBe(exp.hints.length);
    for (const h of exp.hints) {
      const match = hints.find((x) => x.itemKey === h.itemKey);
      expect(match, `hint for ${h.itemKey}`).toBeDefined();
      if (!match) continue;
      expect(match.extraUnitCost).toBe(h.extraUnitCost);
      expect(match.feeRemoved).toBe(h.feeRemoved);
      expect(match.netEffect).toBe(h.netEffect);
      expect(match.verdict).toBe(h.verdict);
      if (h.promoId) expect(match.promoId).toBe(h.promoId);
      if (h.toleranceBound !== undefined) expect(match.toleranceBound).toBe(h.toleranceBound);
    }
  }

  if (exp.absentHintItemKeys) {
    for (const key of exp.absentHintItemKeys) {
      expect(hints.find((h) => h.itemKey === key)).toBeUndefined();
    }
  }
  if (exp.hiddenHintItemKeys) {
    for (const key of exp.hiddenHintItemKeys) {
      expect(hints.find((h) => h.itemKey === key)).toBeUndefined();
    }
  }

  if (exp.totalIsEstimate !== undefined) expect(plan.totalIsEstimate).toBe(exp.totalIsEstimate);
  if (exp.estimateRange) expect(plan.estimateRange).toEqual(exp.estimateRange);

  if (exp.baselineTotal !== undefined) {
    // The per-item-cheapest baseline must be strictly worse or equal (property).
    expect(plan.grandTotal).toBeLessThanOrEqual(exp.baselineTotal);
  }
}

describe('T04 solver fixtures (SDD 07)', () => {
  const fixtures = loadFixtures();

  it('loads the mandatory corpus', () => {
    const names = fixtures.map((f) => f.name);
    expect(names).toContain('fee-coupling');
    expect(names).toContain('xyz-gating');
    expect(names).toContain('xyz-gating-tolerance');
    expect(names).toContain('lock-ride-along');
  });

  for (const f of fixtures) {
    it(`fixture: ${f.name}`, () => {
      assertExpectation(f.input, f.expect);

      if (f.expect.variant) {
        const v = f.expect.variant;
        if (v.grandTotal !== undefined || v.groups !== undefined || v.hints !== undefined) {
          assertExpectation(withVariant(f.input, v), {
            grandTotal: v.grandTotal,
            groups: v.groups,
            hints: v.hints,
          });
        }
      }
    });
  }
});

describe('T04 FR-12 invariants (asserted on every fixture)', () => {
  for (const f of loadFixtures()) {
    it(`${f.name}: fee lines reconcile and carry exactly one flag`, () => {
      const { plan } = solve(f.input);

      const flags = [
        'regular',
        'plus-covered',
        'promo-waived',
        'large-item',
        'already-paid-by-lock',
      ];
      let delivery = 0;
      let items = 0;
      for (const g of plan.groups) {
        expect(flags).toContain(g.feeFlag);
        expect(g.fee).not.toBeNull();
        delivery += g.fee ?? 0;
        items += g.subtotal;
        // Lines reconcile to the group subtotal.
        expect(g.subtotal).toBe(g.lines.reduce((s, l) => s + l.lineTotal, 0));
      }
      // Displayed lines always reconcile to the grand total (FR-12).
      expect(plan.itemSubtotal).toBe(items);
      expect(plan.deliverySubtotal).toBe(delivery);
      expect(plan.grandTotal).toBe(plan.itemSubtotal + plan.deliverySubtotal);
    });
  }
});
