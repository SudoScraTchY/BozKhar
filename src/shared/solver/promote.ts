/**
 * Promo repair pass (SDD 07 step 5).
 *
 * When a vendor-wide count promo sits just below its threshold, re-assigning
 * unlocked items to the promo vendor can pay for itself: the fee removed can
 * exceed the total price increase of the moves. Re-assignments only - the main
 * plan never adds units (D-09); extra units are the hint layer's business.
 */
import type { SolverInput } from './types';
import type { Assignment } from './evaluate';
import { assignmentTotal } from './enumerate';
import { countForPromo } from './promos';
import type { Prefiltered } from './enumerate';
import { buildGroups } from './evaluate';
import { scoringTotal } from './evaluate';

/**
 * One repair attempt per unsatisfied vendor-count promo: apply the minimal
 * bundle of unlocked-item moves that reaches the threshold, and accept it only
 * when the resulting total (fee removed) is strictly lower. Deterministic:
 * candidate moves are ordered by (price increase, itemKey).
 */
export function repairAssignment(
  input: SolverInput,
  assignment: Assignment[],
  pf: Prefiltered,
): Assignment[] {
  const vendorCountPromos = input.promos.filter((p) => p.type === 'vendor-count');
  if (vendorCountPromos.length === 0) return assignment;

  let current = assignment;
  let currentTotal = assignmentTotal(input, current);

  // Unlocked items only - pins never move (D-06).
  const moveable = new Set(pf.solvable.map((s) => s.item.itemKey));

  for (const promo of vendorCountPromos) {
    const toScope = (a: Assignment) => ({
      itemKey: a.itemKey,
      vendorId: a.vendorId,
      quantity: a.quantity,
      isLargeItem: a.isLargeItem,
    });
    if (countForPromo(promo, current.map(toScope)) >= promo.thresholdValue) continue;

    // The fee this promo would remove: the promo vendor's seller-class fee.
    const target = buildGroups(input, current).groups.find(
      (g) => g.vendorId === promo.vendorId && g.shipmentClass === 'seller',
    );
    if (!target || target.fee === null || target.fee === 0) continue;

    // Candidate moves: unlocked non-large items with an in-stock offer at the
    // promo vendor. Cheapest price increase first, then itemKey (determinism).
    type Move = { itemKey: string; delta: number; offer: Assignment; units: number };
    const moves: Move[] = [];
    for (const a of current) {
      if (!moveable.has(a.itemKey) || a.vendorId === promo.vendorId || a.isLargeItem) continue;
      const item = input.items.find((i) => i.itemKey === a.itemKey);
      const alt = item?.offers.find(
        (o) => o.vendorId === promo.vendorId && o.stock !== 'out-of-stock',
      );
      if (!alt) continue;
      moves.push({
        itemKey: a.itemKey,
        delta: (alt.unitPrice - a.unitPrice) * a.quantity,
        units: a.quantity,
        offer: {
          itemKey: a.itemKey,
          vendorId: alt.vendorId,
          unitPrice: alt.unitPrice,
          quantity: a.quantity,
          isLargeItem: alt.isLargeItem,
          plusCoversFee: alt.plusCoversFee,
          fee: alt.fee,
          ...(alt.capturedAt !== undefined ? { capturedAt: alt.capturedAt } : {}),
        },
      });
    }
    moves.sort((x, y) => x.delta - y.delta || x.itemKey.localeCompare(y.itemKey));

    // Accumulate the minimal move set that reaches the threshold.
    let unitsShort = promo.thresholdValue - countForPromo(promo, current.map(toScope));
    const applied = new Map<string, Assignment>();
    for (const move of moves) {
      if (unitsShort <= 0) break;
      applied.set(move.itemKey, move.offer);
      unitsShort -= move.units;
    }
    if (unitsShort > 0 || applied.size === 0) continue; // threshold unreachable by moves

    // Accept only if the fee removed beats the total price increase (SDD 07).
    const withMoves: Assignment[] = current.map((a) => applied.get(a.itemKey) ?? a);
    const newTotal = scoringTotal(input, withMoves);
    if (newTotal < currentTotal) {
      current = withMoves;
      currentTotal = newTotal;
    }
  }

  return current;
}
