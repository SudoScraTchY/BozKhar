/**
 * Deterministic local persona (D-39, no LLM).
 *
 * The first matching rule wins; deep rules are skipped when no detail
 * exists, so a list-only summary never claims to know brands or repeats.
 */
import type { Aggregate } from './aggregate';

export type PersonaId =
  'newcomer' | 'replenisher' | 'loyalist' | 'devotee' | 'bargain' | 'bulk' | 'weekend' | 'regular';

export const BULK_AVERAGE_TOMAN = 5_000_000;
export const BULK_ITEMS_PER_ORDER = 5;

export function pickPersona(agg: Aggregate): PersonaId {
  if (agg.fulfilledOrders < 3) return 'newcomer';

  if (agg.hasDeep && agg.repeatRate >= 0.25) return 'replenisher';
  if (agg.hasDeep && agg.topVendorShare >= 0.35) return 'loyalist';
  if (agg.hasDeep && agg.topBrandShare >= 0.3) return 'devotee';

  if (agg.discountRate >= 0.15) return 'bargain';

  const itemsPerOrder = agg.hasDeep && agg.paidOrders > 0 ? agg.itemCount / agg.paidOrders : 0;
  if (
    (agg.hasDeep && itemsPerOrder >= BULK_ITEMS_PER_ORDER) ||
    agg.averageOrderToman >= BULK_AVERAGE_TOMAN
  ) {
    return 'bulk';
  }

  if (agg.dateCoverage >= 0.8 && agg.weekendShare >= 0.5) return 'weekend';

  return 'regular';
}
