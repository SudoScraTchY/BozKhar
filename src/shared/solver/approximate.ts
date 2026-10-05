/**
 * Approximate mode (D-15, OQ-09) - the labeled fallback above the scale
 * envelope: per-item cheapest, then the promo repair pass, honestly labeled.
 */
import type { SolverInput } from './types';
import type { Assignment } from './evaluate';
import { prefilter, assignmentTotal } from './enumerate';
import { repairAssignment } from './promote';
import { toAssignment } from './evaluate';

/**
 * Greedy baseline + repair. Deterministic: candidate order follows the sorted
 * candidates from prefilter, and the comparator only replaces on a strict win.
 */
export function approximateAssignments(input: SolverInput): Assignment[] {
  const pf = prefilter(input);
  const chosen: Assignment[] = [...pf.pinned];

  for (const s of pf.solvable) {
    // Cheapest in-set candidate; fee breaks ties toward consolidation.
    const best = s.candidates.find((o) => o.stock !== 'out-of-stock');
    if (best) chosen.push(toAssignment(s.item, best));
  }

  const repaired = input.promos.length > 0 ? repairAssignment(input, chosen, pf) : chosen;
  return repaired;
}

export function approximateTotal(input: SolverInput): number {
  return assignmentTotal(input, approximateAssignments(input));
}
