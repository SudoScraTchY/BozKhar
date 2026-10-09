/**
 * Fee-consolidation repair (D-23, user report 2026-10-09).
 *
 * The greedy baseline (approximate mode) picks the
 * per-item cheapest vendor, which can leave a vendor
 * group holding a single item - a whole package fee
 * charged to carry one item. Moving that item onto a
 * vendor the plan already uses deletes the fee; the
 * move pays whenever the fee saving beats the price
 * rise.
 *
 * User's example: A(vendor1)=280, A(vendor2)=320,
 * B(vendor2)=300, each package ~100. Greedy picks
 * A@v1 + B@v2 + 2 fees = 780; the move A->v2 saves
 * the whole v1 fee (100) for a 40 price rise: 720.
 *
 * Heuristic, bounded (rounds), and lock-aware: pinned
 * items never move, banned vendors are never targets.
 * Runs before the promo repair pass; the exact mode
 * (small carts) already evaluates every arrangement
 * and does not need it.
 */
import type { Assignment } from './evaluate';
import { buildFeeTable, toAssignment } from './evaluate';
import type { SolverInput } from './types';

/** Bounded repair: a small cart cannot need many rounds. */
const MAX_ROUNDS = 12;

/**
 * The effective fee a (vendor, class) group is charged,
 * mirroring buildGroups' Plus logic: a group whose
 * every offer is Plus-covered pays nothing.
 */
function effectiveFee(
  assignments: Assignment[],
  vendorId: string,
  isLargeItem: boolean,
  hasPlus: boolean,
  feeTable: ReturnType<typeof buildFeeTable>,
): number | null {
  const members = assignments.filter(
    (a) => a.vendorId === vendorId && a.isLargeItem === isLargeItem,
  );
  if (members.length === 0) return null;
  const known = (isLargeItem ? feeTable.large : feeTable.seller).get(vendorId);
  if (known === null || known === undefined) return null;
  if (hasPlus && members.every((a) => a.plusCoversFee)) return 0;
  return known;
}

export function consolidateFees(input: SolverInput, assignments: Assignment[]): Assignment[] {
  if (assignments.length < 2) return assignments;
  const feeTable = buildFeeTable(input);
  const itemByKey = new Map(input.items.map((i) => [i.itemKey, i]));
  const hasPlus = input.settings.hasPlus;

  let changed = true;
  let rounds = 0;
  let current = assignments;
  while (changed && rounds < MAX_ROUNDS) {
    changed = false;
    rounds += 1;

    // Group membership by (vendor, class).
    const membersOf = (vendorId: string, isLargeItem: boolean) =>
      current.filter((a) => a.vendorId === vendorId && a.isLargeItem === isLargeItem);

    for (const a of current) {
      const item = itemByKey.get(a.itemKey);
      if (!item || item.lock.mode === 'pin') continue; // pinned stays put
      const cls = a.isLargeItem;
      const occupants = membersOf(a.vendorId, cls);
      // Only a sole-occupant group wastes a whole fee.
      if (occupants.length !== 1 || occupants[0]!.itemKey !== a.itemKey) {
        continue;
      }
      const feeHere = effectiveFee(current, a.vendorId, cls, hasPlus, feeTable);
      if (feeHere === null || feeHere <= 0) continue; // nothing to save

      // Try every other vendor already used in this class.
      for (const b of current) {
        if (b === a || b.isLargeItem !== cls || b.vendorId === a.vendorId) {
          continue;
        }
        if (item.lock.mode === 'ban' && item.lock.vendorIds.includes(b.vendorId)) {
          continue;
        }
        const offer = item.offers.find(
          (o) => o.vendorId === b.vendorId && o.stock !== 'out-of-stock' && o.isLargeItem === cls,
        );
        if (!offer) continue;
        // The target group's fee before and after the move:
        // adding a non-Plus-covered offer can break the
        // group's Plus waiver - that loss is a cost.
        const feeThereBefore = effectiveFee(current, b.vendorId, cls, hasPlus, feeTable);
        if (feeThereBefore === null) continue;
        const after = [...current.filter((x) => x !== a), toAssignment(item, offer)];
        const feeThereAfter = effectiveFee(after, b.vendorId, cls, hasPlus, feeTable);
        if (feeThereAfter === null) continue;
        const priceDelta = (offer.unitPrice - a.unitPrice) * item.quantity;
        const saving = feeHere + feeThereBefore - feeThereAfter - priceDelta;
        if (saving > 0) {
          current = after;
          changed = true;
          break;
        }
      }
      if (changed) break;
    }
  }
  return current;
}
