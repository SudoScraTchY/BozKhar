/**
 * Solver package barrel (T04). One-page API note: SDD 07 is the behavioral
 * spec; see src/shared/solver/API.md for the input list -> plan + hints shape.
 */
export type * from './types';
export { solve } from './solve';
export { perItemCheapestBaseline } from './evaluate';
export { MAX_EXACT_ITEMS, MAX_EXACT_VENDORS, selectMode, isWithinEnvelope } from './envelope';
