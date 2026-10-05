/**
 * Hint layer (SDD 07 step 7; D-09/D-10/D-11).
 *
 * After the main solve, for each count promo that is exactly one unit away for
 * an item already in the list, evaluate adding one unit of that item at the
 * promo vendor: the fee it would remove counts against the extra unit's price.
 *
 * Gating (D-10): net saving -> always emitted. Net increase -> emitted only
 * when it stays within tolerancePercent of the cart total. Larger increases
 * and net-zero-irrelevant cases are rejected outright - a rejected candidate
 * is simply absent from the output.
 */
import type { Hint, SolverInput, SolverPromo } from './types';
import type { Plan } from './types';
import { countForPromo } from './promos';

/**
 * Hints for the solved plan. `cartTotal` for tolerance is the plan's grand
 * total (the cart the hints ride on); tolerance bound = round(cartTotal * pct / 100).
 */
export function buildHints(input: SolverInput, plan: Plan): Hint[] {
  const hints: Hint[] = [];
  const solvedKeys = new Set(plan.assignments.map((l) => l.itemKey));

  const cartTotal = plan.grandTotal;
  // D-10 gating bound. floor() pins the SDD's worked pair (150-cart, 2% -> 3
  // shown; 1% -> 1.5 -> hidden): rounding would show the 1% case.
  const toleranceBound = Math.floor((cartTotal * input.settings.tolerancePercent) / 100);

  for (const promo of input.promos) {
    const candidate = oneUnitCandidate(input, plan, promo, solvedKeys);
    if (!candidate) continue;

    const netEffect = candidate.feeRemoved - candidate.extraUnitCost;

    if (netEffect > 0) {
      hints.push({
        kind: 'extra-unit',
        promoId: promo.promoId,
        promoType: promo.type,
        itemKey: candidate.itemKey,
        vendorId: promo.vendorId,
        extraUnitCost: candidate.extraUnitCost,
        feeRemoved: candidate.feeRemoved,
        netEffect,
        verdict: 'saving',
        toleranceBound,
      });
    } else if (cartTotal > 0 && -netEffect <= toleranceBound) {
      // Net increase (or exact zero) within tolerance - shown, labeled honestly.
      hints.push({
        kind: 'extra-unit',
        promoId: promo.promoId,
        promoType: promo.type,
        itemKey: candidate.itemKey,
        vendorId: promo.vendorId,
        extraUnitCost: candidate.extraUnitCost,
        feeRemoved: candidate.feeRemoved,
        netEffect,
        verdict: 'within-tolerance',
        toleranceBound,
      });
    }
    // else: rejected outright - D-10. The candidate is simply not emitted.
  }

  // Deterministic order: promo, then item.
  return hints.sort(
    (a, b) => a.promoId.localeCompare(b.promoId) || a.itemKey.localeCompare(b.itemKey),
  );
}

interface Candidate {
  itemKey: string;
  extraUnitCost: number;
  feeRemoved: number;
}

/**
 * The one-unit candidate for a promo, if one exists.
 *
 * A promo qualifies when it is unsatisfied and exactly one *unit* short of its
 * threshold. The candidate item must already be in the list (D-11) and be
 * assignable to the promo vendor (in stock, not large - large items are a
 * separate shipment class whose fee is not promo-waivable, D-13).
 */
function oneUnitCandidate(
  input: SolverInput,
  plan: Plan,
  promo: SolverPromo,
  solvedKeys: Set<string>,
): Candidate | null {
  const toScope = (line: {
    itemKey: string;
    vendorId: string;
    isLargeItem: boolean;
    quantity: number;
  }) => line;

  // Units currently counted toward the promo from the plan's assignment.
  const vendorLines: Array<{
    itemKey: string;
    vendorId: string;
    quantity: number;
    isLargeItem: boolean;
  }> = [];
  for (const group of plan.groups) {
    if (group.vendorId !== promo.vendorId || group.shipmentClass !== 'seller') continue;
    for (const line of group.lines) {
      vendorLines.push({
        itemKey: line.itemKey,
        vendorId: group.vendorId,
        quantity: line.quantity,
        isLargeItem: line.isLargeItem,
      });
    }
  }
  const counted = countForPromo(promo, vendorLines.map(toScope));
  const unitsShort = promo.thresholdValue - counted;
  if (unitsShort !== 1) return null; // hints fire only at exactly one unit away

  // Candidate items: in the list, currently NOT at the promo vendor (moving or
  // adding must change the count), with a buyable non-large offer there.
  for (const item of input.items) {
    if (!solvedKeys.has(item.itemKey)) continue;
    const alreadyAtVendor = vendorLines.some((l) => l.itemKey === item.itemKey);
    if (alreadyAtVendor && promo.type === 'same-item-count') {
      // Adding a unit of an item already counted still adds one unit.
      // Allowed - the count is in units of that item.
    }
    const offer = item.offers.find(
      (o) => o.vendorId === promo.vendorId && o.stock !== 'out-of-stock' && !o.isLargeItem,
    );
    if (!offer) continue;

    // The fee removed: the promo vendor's seller fee *if the plan currently
    // charges it*. If it is already waived (plus/promo/pin) there is nothing
    // to save.
    const group = plan.groups.find(
      (g) => g.vendorId === promo.vendorId && g.shipmentClass === 'seller',
    );
    if (!group || group.fee === null || group.fee === 0) return null;

    return {
      itemKey: item.itemKey,
      extraUnitCost: offer.unitPrice,
      feeRemoved: group.fee,
    };
  }

  return null;
}
