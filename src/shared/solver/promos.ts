/**
 * Promo counting and satisfaction (SDD 07 step 4, D-08).
 *
 * Two supported shapes, both waiving one seller shipment fee:
 * - `same-item-count`: units of one specific item bought from one vendor;
 * - `vendor-count`: units bought from one vendor, across items.
 *
 * Large-item assignments are excluded from both counts: they ship as their own
 * class (spike finding S-5) and their fee is not promo-waivable (D-13).
 *
 * Implementation note (raised in 10-risks-open-questions.md): counts are in
 * *units*, because the hint layer adds exactly one unit to cross a threshold
 * (D-10/D-11). Counting distinct items instead would make a vendor-count promo
 * unreachable by a one-unit hint, which the stakeholder's rules require.
 */
import type { SolverPromo } from './types';

/** The part of an assignment that promo counting cares about. */
export interface PromoScopeAssignment {
  itemKey: string;
  vendorId: string;
  quantity: number;
  isLargeItem: boolean;
}

/** Units counted toward this promo by the given assignment. */
export function countForPromo(promo: SolverPromo, assignments: PromoScopeAssignment[]): number {
  let total = 0;
  for (const a of assignments) {
    if (a.isLargeItem) continue;
    if (a.vendorId !== promo.vendorId) continue;
    if (promo.type === 'same-item-count' && a.itemKey !== promo.itemKey) continue;
    total += a.quantity;
  }
  return total;
}

/** How many more units are needed to satisfy the promo (0 when already satisfied). */
export function unitsShortOfPromo(promo: SolverPromo, assignments: PromoScopeAssignment[]): number {
  return Math.max(0, promo.thresholdValue - countForPromo(promo, assignments));
}

/**
 * Promos the assignment already satisfies. A satisfied promo waives its
 * vendor's seller shipment fee once (evalute.ts turns this into the
 * `promo-waived` flag).
 */
export function satisfiedPromoIds(
  promos: SolverPromo[],
  assignments: PromoScopeAssignment[],
): Set<string> {
  const satisfied = new Set<string>();
  for (const promo of promos) {
    if (countForPromo(promo, assignments) >= promo.thresholdValue) {
      satisfied.add(promo.promoId);
    }
  }
  return satisfied;
}

/**
 * Whether a promo is structurally applicable to a solve: it must scope to an
 * assignment set that actually reaches its vendor.
 */
export function promoAppliesToVendor(promo: SolverPromo, vendorUsed: boolean): boolean {
  return vendorUsed;
}
