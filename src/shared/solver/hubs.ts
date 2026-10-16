/**
 * Hub-set candidate search (approximate mode; user report 2026-10-16).
 *
 * The greedy baseline ranks offers by unit price alone, and the fee repair
 * (consolidate.ts) can only merge a *single-item* group onto a vendor the plan
 * already uses. Both are local: neither ever reconsiders WHICH vendor should
 * carry a package. The report's 5-item cart is the proof - the plan put four
 * items on a 188,000-toman package and the fifth on its own (2,002,840), while
 * the same four on a 150,000 package plus the fifth on its own 110,000 seller
 * totals 1,959,530, i.e. 43,310 cheaper, on the seller the cart already had.
 *
 * This pass evaluates the hub family directly: pick one or two vendors, send
 * every item that can buy there to its best offer among them, and let an item
 * with no offer there keep its own best single-vendor option (so a set is
 * never infeasible). Candidates are scored with the solver's own scoringTotal
 * and the pass only ever returns a strictly cheaper plan than the one it was
 * handed - it is a repair, not a rewrite. Pure and deterministic: hub ids
 * sorted, masks ascending, replacement only on a strict win.
 */
import type { SolverInput, SolverOffer } from './types';
import type { Assignment } from './evaluate';
import { buildFeeTable, scoringTotal, toAssignment } from './evaluate';
import type { Prefiltered } from './enumerate';

/**
 * Pairs are where the win lives (one shared package plus one solo item), and
 * enumerating every pair costs |hubs|^2/2. Only the cheapest-fee hubs are
 * paired: a vendor whose package is dear is a poor thing to share.
 */
const MAX_PAIR_HUBS = 24;

/** A vendor's effective seller-class package fee (unknown scores at the fallback). */
type VendorFee = (vendorId: string, isLargeItem: boolean) => number;

/** True when `a` is strictly the better pick for one item (price + its own package fee). */
function betterOffer(a: SolverOffer, b: SolverOffer, vendorFee: VendorFee): boolean {
  const costA = a.unitPrice + vendorFee(a.vendorId, a.isLargeItem);
  const costB = b.unitPrice + vendorFee(b.vendorId, b.isLargeItem);
  if (costA !== costB) return costA < costB;
  if (a.unitPrice !== b.unitPrice) return a.unitPrice < b.unitPrice;
  return a.vendorId.localeCompare(b.vendorId) < 0;
}

function bestOffer(offers: SolverOffer[], vendorFee: VendorFee): SolverOffer {
  return offers.reduce((best, o) => (betterOffer(o, best, vendorFee) ? o : best));
}

export function bestHubSetPlan(
  input: SolverInput,
  pf: Prefiltered,
  baseline: Assignment[],
): Assignment[] {
  const feeTable = buildFeeTable(input);
  const fallback = input.unknownFeeFallback ?? 0;
  const vendorFee: VendorFee = (vendorId, isLargeItem) => {
    const known = (isLargeItem ? feeTable.large : feeTable.seller).get(vendorId);
    return known === null || known === undefined ? fallback : known;
  };

  let best = baseline;
  let bestTotal = scoringTotal(input, baseline);

  const hubs = [...new Set(pf.solvable.flatMap((s) => s.candidates.map((o) => o.vendorId)))].sort(
    (a, b) => a.localeCompare(b),
  );
  const pairHubs = [...hubs]
    .sort((a, b) => vendorFee(a, false) - vendorFee(b, false) || a.localeCompare(b))
    .slice(0, MAX_PAIR_HUBS);

  const consider = (set: Set<string>): void => {
    const chosen: Assignment[] = [];
    for (const s of pf.solvable) {
      const inSet = s.candidates.filter((o) => set.has(o.vendorId));
      // No offer inside the set: keep the item's own best rather than dropping
      // it - a hub set is a candidate arrangement, not a constraint.
      chosen.push(
        toAssignment(s.item, bestOffer(inSet.length > 0 ? inSet : s.candidates, vendorFee)),
      );
    }
    const candidate = [...pf.pinned, ...chosen];
    const total = scoringTotal(input, candidate);
    if (total < bestTotal) {
      best = candidate;
      bestTotal = total;
    }
  };

  for (const v of hubs) consider(new Set([v]));
  for (let i = 0; i < pairHubs.length; i += 1) {
    for (let j = i + 1; j < pairHubs.length; j += 1) {
      consider(new Set([pairHubs[i]!, pairHubs[j]!]));
    }
  }

  return best;
}
