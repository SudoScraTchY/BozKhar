/**
 * Exact vendor-set enumeration (SDD 07 steps 1-3, 5-6; D-15).
 *
 * Pre-filter (step 1), vendor pool (step 2), subset enumeration with in-set
 * cheapest assignment (steps 3-4), promo repair (step 5), best selection with
 * the tie-break chain total -> fewer vendors -> deterministic vendor ids
 * (step 6). Locks are trivial pre-filtering: pins are fixed assignments whose
 * vendors ride in every candidate set, bans vanish before enumeration.
 */
import type { SolverInput, SolverItem, SolverOffer, UnsolvedItem } from './types';
import { type Assignment, scoringTotal, toAssignment } from './evaluate';
import { repairAssignment } from './promote';

export interface Prefiltered {
  /** Unlocked items that can be solved, with their allowed in-stock offers. */
  solvable: Array<{ item: SolverItem; candidates: SolverOffer[] }>;
  /** Fixed assignments for pinned items (empty when none). */
  pinned: Assignment[];
  unsolved: UnsolvedItem[];
  /** Distinct vendors reachable by unlocked items, plus pinned vendors, sorted. */
  poolVendorIds: string[];
  pinnedVendorIds: Set<string>;
}

function compareCandidates(a: SolverOffer, b: SolverOffer): number {
  return (
    a.unitPrice - b.unitPrice ||
    a.vendorId.localeCompare(b.vendorId) ||
    (a.fee ?? Number.MAX_SAFE_INTEGER) - (b.fee ?? Number.MAX_SAFE_INTEGER)
  );
}

export function prefilter(input: SolverInput): Prefiltered {
  const solvable: Prefiltered['solvable'] = [];
  const pinned: Assignment[] = [];
  const unsolved: UnsolvedItem[] = [];
  const pinnedVendorIds = new Set<string>();

  for (const item of input.items) {
    const inStock = item.offers.filter((o) => o.stock !== 'out-of-stock');

    if (item.lock.mode === 'pin') {
      const pinnedVendorId = item.lock.vendorIds[0] ?? '';
      const offer = inStock.find((o) => o.vendorId === pinnedVendorId);
      if (offer) {
        pinned.push(toAssignment(item, offer));
        pinnedVendorIds.add(pinnedVendorId);
      } else {
        // The pinned vendor exists in the offer list but has nothing buyable,
        // vs. not being there at all - distinct, honest reasons (FR-06).
        const vendorPresent = item.offers.some((o) => o.vendorId === pinnedVendorId);
        unsolved.push({
          itemKey: item.itemKey,
          ...(item.title !== undefined ? { title: item.title } : {}),
          reason: vendorPresent ? 'pinned-vendor-unavailable' : 'no-available-vendor',
        });
      }
      continue;
    }

    const banned = item.lock.mode === 'ban' ? new Set(item.lock.vendorIds) : undefined;
    const candidates = inStock.filter((o) => !banned?.has(o.vendorId)).sort(compareCandidates);

    if (candidates.length === 0) {
      const allOutOfStock =
        item.offers.length > 0 && item.offers.every((o) => o.stock === 'out-of-stock');
      unsolved.push({
        itemKey: item.itemKey,
        ...(item.title !== undefined ? { title: item.title } : {}),
        reason: allOutOfStock ? 'all-offers-out-of-stock' : 'no-available-vendor',
      });
      continue;
    }
    solvable.push({ item, candidates });
  }

  const pool = new Set<string>(pinnedVendorIds);
  for (const s of solvable) for (const o of s.candidates) pool.add(o.vendorId);
  const poolVendorIds = [...pool].sort((a, b) => a.localeCompare(b));

  return { solvable, pinned, unsolved, poolVendorIds, pinnedVendorIds };
}

/** Count of distinct vendors a final assignment actually uses. */
export function usedVendorCount(assignment: Assignment[]): number {
  return new Set(assignment.map((a) => a.vendorId)).size;
}

export function assignmentTotal(input: SolverInput, assignment: Assignment[]): number {
  return scoringTotal(input, assignment);
}

function assignmentSignature(assignment: Assignment[]): string {
  return assignment
    .map((a) => `${a.itemKey}@${a.vendorId}:${a.unitPrice}`)
    .sort((x, y) => x.localeCompare(y))
    .join('|');
}

/**
 * Picks the best assignment by exhaustive subset enumeration. Deterministic:
 * masks iterate ascending, and the comparator only replaces on a strict win,
 * so equal-scoring candidates keep the first (lowest-mask) winner.
 */
export function enumerateBest(input: SolverInput, pf: Prefiltered): Assignment[] {
  const poolVendorIds = pf.poolVendorIds;
  const bitIndex = new Map<string, number>();
  poolVendorIds.forEach((v, i) => bitIndex.set(v, i));

  let baseMask = 0;
  for (const v of pf.pinnedVendorIds) baseMask |= 1 << (bitIndex.get(v) ?? -1);

  const vendorBit = (vendorId: string): number => bitIndex.get(vendorId) ?? -1;

  let best: Assignment[] | null = null;
  let bestTotal = Number.POSITIVE_INFINITY;
  let bestVendorCount = Number.POSITIVE_INFINITY;
  let bestSignature = '';
  const seenSignatures = new Set<string>();

  const limit = 1 << poolVendorIds.length;
  for (let mask = baseMask; mask < limit; mask = (mask + 1) | baseMask) {
    // Step 4: in-set cheapest assignment for every unlocked item.
    const chosen: Assignment[] = [];
    let feasible = true;
    for (const s of pf.solvable) {
      const offer = s.candidates.find((o) => (mask & (1 << vendorBit(o.vendorId))) !== 0);
      if (!offer) {
        feasible = false;
        break;
      }
      chosen.push(toAssignment(s.item, offer));
    }
    if (!feasible) continue;

    const signature = assignmentSignature(chosen);
    if (seenSignatures.has(signature)) continue;
    seenSignatures.add(signature);

    // Step 5: promo repair pass (re-assignments only).
    const assignment = [...pf.pinned, ...chosen];
    const repaired = input.promos.length > 0 ? repairAssignment(input, assignment, pf) : assignment;

    // Signature after repair differs; memo on the pre-repair signature is
    // still sound: identical greedy assignments repair identically.
    const total = assignmentTotal(input, repaired);
    const vendorCount = usedVendorCount(repaired);

    if (
      total < bestTotal ||
      (total === bestTotal && vendorCount < bestVendorCount) ||
      (total === bestTotal &&
        vendorCount === bestVendorCount &&
        (best === null || signatureOf(repaired) < bestSignature))
    ) {
      best = repaired;
      bestTotal = total;
      bestVendorCount = vendorCount;
      bestSignature = signatureOf(repaired);
    }
  }

  // Every item had candidates, so some mask is always feasible.
  return best ?? [...pf.pinned];
}

function signatureOf(assignment: Assignment[]): string {
  return assignmentSignature(assignment);
}
