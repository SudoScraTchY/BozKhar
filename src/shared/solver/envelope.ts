/**
 * Scale envelope and mode selection (D-15, OQ-09).
 *
 * Exact subset enumeration doubles the candidate-vendor count per added vendor,
 * so the envelope is stated once here and enforced in one place: above it the
 * solver degrades to the labeled approximate mode rather than silently
 * pretending the answer is optimal (SDD 07 edge cases).
 */

/** OQ-09 default: up to 40 items and 15 distinct candidate vendors stay exact. */
export const MAX_EXACT_ITEMS = 40;
export const MAX_EXACT_VENDORS = 15;

export interface EnvelopeUsage {
  itemCount: number;
  vendorCount: number;
}

export type SolveMode = 'exact' | 'approximate';

export function selectMode(usage: EnvelopeUsage): SolveMode {
  if (usage.itemCount > MAX_EXACT_ITEMS) return 'approximate';
  if (usage.vendorCount > MAX_EXACT_VENDORS) return 'approximate';
  return 'exact';
}

export function isWithinEnvelope(usage: EnvelopeUsage): boolean {
  return selectMode(usage) === 'exact';
}
