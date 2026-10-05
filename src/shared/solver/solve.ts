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
  const pf = prefilter(input);

  const vendorCount = pf.poolVendorIds.length;
  const itemCount = pf.solvable.length + pf.pinned.length;
  const mode = selectMode({ itemCount, vendorCount });

  let assignments: Assignment[];
  if (mode === 'exact') {
    assignments = enumerateBest(input, pf);
  } else {
    assignments = approximateAssignments(input);
  }

  const unsolved: UnsolvedItem[] = pf.unsolved;
  const plan = buildPlan(input, assignments, mode, unsolved);
  const hints = buildHints(input, plan);

  return { plan, hints };
}

export { perItemCheapestBaseline } from './evaluate';
export type { Assignment } from './evaluate';
