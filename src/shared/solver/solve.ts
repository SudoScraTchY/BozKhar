/**
 * Solver public entry (SDD 07 "Inputs and outputs").
 *
 * Pure function: plain data in, plan + hints out. No I/O, no DOM, no state, no
 * clock, no randomness (D-15, NFR-09). Money is integer Toman.
 */
import type { SolverInput, SolverResult, UnsolvedItem } from './types';
import { prefilter, enumerateBest } from './enumerate';
import { buildPlan } from './evaluate';
import { buildHints } from './hints';
import { selectMode } from './envelope';
import { approximateAssignments } from './approximate';
import type { Assignment } from './evaluate';

export { MAX_EXACT_ITEMS, MAX_EXACT_VENDORS, selectMode, isWithinEnvelope } from './envelope';

export function solve(input: SolverInput): SolverResult {
  // SDD 08: an unknown fee scores at the largest known fee in
  // the input (the documented default for unknownFeeFallback) -
  // never a silent zero, which would quote a total too low.
  const fallback = input.unknownFeeFallback ?? largestKnownFee(input);
  const scoped: SolverInput =
    fallback === undefined ? input : { ...input, unknownFeeFallback: fallback };
  const pf = prefilter(scoped);

  const vendorCount = pf.poolVendorIds.length;
  const itemCount = pf.solvable.length + pf.pinned.length;
  const mode = selectMode({ itemCount, vendorCount });

  let assignments: Assignment[];
  if (mode === 'exact') {
    assignments = enumerateBest(scoped, pf);
  } else {
    assignments = approximateAssignments(scoped);
  }

  const unsolved: UnsolvedItem[] = pf.unsolved;
  const plan = buildPlan(scoped, assignments, mode, unsolved);
  const hints = buildHints(scoped, plan);

  return { plan, hints };
}

/** The largest known (non-null) fee in the input; undefined when none is known. */
function largestKnownFee(input: SolverInput): number | undefined {
  let max: number | undefined;
  for (const item of input.items) {
    for (const offer of item.offers) {
      if (offer.fee !== null && (max === undefined || offer.fee > max)) {
        max = offer.fee;
      }
    }
  }
  return max;
}

export { perItemCheapestBaseline } from './evaluate';
export type { Assignment } from './evaluate';
