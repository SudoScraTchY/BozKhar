/**
 * Approximate mode (D-15, OQ-09) - the labeled fallback above the scale
 * envelope: per-item cheapest, then fee consolidation, hub-set search and the
 * promo repair pass, honestly labeled.
 */
import type { SolverInput } from './types';
import type { Assignment } from './evaluate';
import { prefilter, assignmentTotal } from './enumerate';
import { repairAssignment } from './promote';
import { toAssignment } from './evaluate';
import { consolidateFees } from './consolidate';
import { bestHubSetPlan } from './hubs';

/**
 * Greedy baseline + fee consolidation + hub-set search + repair.
 * Deterministic: candidate order follows the sorted
 * candidates from prefilter, and every pass only
 * replaces on a strict win.
 */
export function approximateAssignments(input: SolverInput): Assignment[] {
  const pf = prefilter(input);
  const chosen: Assignment[] = [...pf.pinned];

  for (const s of pf.solvable) {
    // Cheapest in-set candidate; fee breaks ties toward consolidation.
    const best = s.candidates.find((o) => o.stock !== 'out-of-stock');
    if (best) chosen.push(toAssignment(s.item, best));
  }

  // D-23: the greedy per-item cheapest can strand a
  // package fee on a single item; move items onto
  // vendors the plan already uses when the fee saved
  // beats the price rise (the user's 780 -> 720 case).
  const consolidated = consolidateFees(input, chosen);

  // Both passes above are local - neither reconsiders which vendor should
  // carry a package. Score the hub family as well and keep whichever plan is
  // strictly cheaper (the 2026-10-16 report: 2,002,840 -> 1,959,530).
  const pooled = bestHubSetPlan(input, pf, consolidated);

  const repaired = input.promos.length > 0 ? repairAssignment(input, pooled, pf) : pooled;
  return repaired;
}

export function approximateTotal(input: SolverInput): number {
  return assignmentTotal(input, approximateAssignments(input));
}
