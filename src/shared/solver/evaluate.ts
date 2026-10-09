/**
 * Scoring and the fee model (SDD 07 step 4, FR-12).
 *
 * One fee line per shipment group, each carrying exactly one flag. The group
 * unit is vendor x shipping class: large & heavy goods ship as their own class
 * with their own fee (spike S-5), so a vendor can legitimately own two groups.
 *
 * Flag precedence when several could apply (documented in 07 implementation
 * notes): promo-waived > plus-covered > already-paid-by-lock > regular;
 * large-item groups are never Plus-covered or promo-waived (D-13).
 *
 * Unknown fees (null) are charged at `unknownFeeFallback` for scoring and
 * display, with the plan flagged estimate-only and an honest low..high range -
 * never a silent zero (SDD 08).
 */
import type {
  FeeFlag,
  Plan,
  PlanGroup,
  PlanLine,
  SolverInput,
  SolverItem,
  SolverOffer,
  UnsolvedItem,
} from './types';
import { satisfiedPromoIds } from './promos';

/** One concrete choice: item i buys quantity units from vendor v at this price. */
export interface Assignment {
  itemKey: string;
  vendorId: string;
  vendorName?: string;
  unitPrice: number;
  quantity: number;
  isLargeItem: boolean;
  /** Per-offer flag: a Plus membership waives this offer's seller shipment fee. */
  plusCoversFee: boolean;
  /** Chosen offer's fee (null = unknown). Kept so plan building needs no re-lookup. */
  fee: number | null;
  /** D-17 passthrough: the variant the chosen offer belongs to. */
  variantId?: string;
  capturedAt?: string;
}

export interface GroupBuild {
  groups: PlanGroup[];
  deliverySubtotal: number;
  totalIsEstimate: boolean;
  /** Groups whose fee was charged at the fallback because the payload had none. */
  unknownFeeGroupCount: number;
}

function compareItemKey(a: Assignment, b: Assignment): number {
  return a.itemKey.localeCompare(b.itemKey);
}

/**
 * Options for group building. `scoreOnly` (enumeration/repair) treats pinned
 * vendors as any other vendor - their fee is charged if the set uses them -
 * while the default (final plan build) flags them already-paid-by-lock.
 */
export interface GroupOptions {
  scoreOnly?: boolean;
  /** Precomputed fee table (avoids rebuilding per enumeration step). */
  feeTable?: FeeTable;
}

/**
 * Per-vendor effective fee table, a function of the INPUT only.
 *
 * The spike's payload model is one fee per vendor shipment (D-14); when two
 * offers of the same vendor disagree (fee changed between capture moments, or
 * partial data), the table takes the max known fee - conservative, total-safe,
 * and identical to the single fee in the consistent common case. Being
 * input-only is what makes the grand total a function of the vendor SET, which
 * vendor-set enumeration (SDD 07 step 3) requires for exactness.
 *
 * null = every known fee for that vendor+class is unknown -> the group falls
 * back to unknownFeeFallback and the plan is labeled estimate-only.
 */
export interface FeeTable {
  seller: Map<string, number | null>;
  large: Map<string, number | null>;
}

export function buildFeeTable(input: SolverInput): FeeTable {
  const seller = new Map<string, number | null>();
  const large = new Map<string, number | null>();
  // D-22: a live-quoted package fee (feeSource 'shipment')
  // is the real charge for that vendor's package and wins
  // over product-API estimates, which are per-offer
  // guesses that can sit above (or below) the real fee.
  const observed = { seller: new Set<string>(), large: new Set<string>() };
  for (const item of input.items) {
    for (const o of item.offers) {
      if (o.stock === 'out-of-stock') continue; // unreachable, never a fee source
      const map = o.isLargeItem ? large : seller;
      const seen = o.isLargeItem ? observed.large : observed.seller;
      if (o.feeSource === 'shipment' && o.fee !== null) {
        seen.add(o.vendorId);
        // Two observed packages for one vendor: charge
        // the higher - never quote a total too low.
        const current = map.get(o.vendorId);
        map.set(
          o.vendorId,
          current === null || current === undefined ? o.fee : Math.max(current, o.fee),
        );
        continue;
      }
      if (seen.has(o.vendorId)) continue; // an observed fee already owns this vendor
      const current = map.get(o.vendorId);
      if (o.fee !== null) {
        map.set(o.vendorId, Math.max(current ?? 0, o.fee));
      } else if (!map.has(o.vendorId)) {
        map.set(o.vendorId, null);
      }
    }
  }
  return { seller, large };
}

/**
 * Builds the shipment groups and fee lines for a full assignment (pinned items
 * included - their vendor's fee is charged exactly once, flagged
 * already-paid-by-lock).
 */
export function buildGroups(
  input: SolverInput,
  assignments: Assignment[],
  options: GroupOptions = {},
): GroupBuild {
  const scoreOnly = options.scoreOnly === true;
  const feeTable = options.feeTable ?? buildFeeTable(input);
  const fallback = input.unknownFeeFallback ?? 0;
  const sorted = [...assignments].sort(compareItemKey);

  const pinnedVendors = new Set<string>();
  for (const item of input.items) {
    if (item.lock.mode === 'pin') {
      const pinned = sorted.find((a) => a.itemKey === item.itemKey);
      if (pinned) pinnedVendors.add(pinned.vendorId);
    }
  }

  const satisfied = satisfiedPromoIds(
    input.promos,
    sorted.map((a) => ({
      itemKey: a.itemKey,
      vendorId: a.vendorId,
      quantity: a.quantity,
      isLargeItem: a.isLargeItem,
    })),
  );

  // vendor -> class -> lines (insertion order is itemKey order; stabilized below)
  const byVendor = new Map<string, { seller: PlanLine[]; large: PlanLine[] }>();
  for (const a of sorted) {
    let entry = byVendor.get(a.vendorId);
    if (!entry) {
      entry = { seller: [], large: [] };
      byVendor.set(a.vendorId, entry);
    }
    const line: PlanLine = {
      itemKey: a.itemKey,
      unitPrice: a.unitPrice,
      quantity: a.quantity,
      lineTotal: a.unitPrice * a.quantity,
      isLargeItem: a.isLargeItem,
      ...(a.variantId !== undefined ? { variantId: a.variantId } : {}),
      ...(a.capturedAt !== undefined ? { capturedAt: a.capturedAt } : {}),
    };
    // An item's title/variant ride along from the input for display.
    const item = input.items.find((i) => i.itemKey === a.itemKey);
    if (item?.title !== undefined) line.title = item.title;
    if (item?.variantLabel !== undefined) line.variantLabel = item.variantLabel;
    if (a.isLargeItem) entry.large.push(line);
    else entry.seller.push(line);
  }

  const groups: PlanGroup[] = [];
  let deliverySubtotal = 0;
  let totalIsEstimate = false;
  let unknownFeeGroupCount = 0;

  for (const vendorId of [...byVendor.keys()].sort((x, y) => x.localeCompare(y))) {
    const entry = byVendor.get(vendorId);
    if (!entry) continue;
    const vendorName = sorted.find((a) => a.vendorId === vendorId)?.vendorName;

    if (entry.seller.length > 0) {
      // Vendor-level effective fee from the input-only table (D-14 semantics).
      const knownFee = feeTable.seller.get(vendorId) ?? null;
      const allPlusCovered = entry.seller.every(() =>
        sorted
          .filter((a) => a.vendorId === vendorId && !a.isLargeItem)
          .every((a) => a.plusCoversFee),
      );
      const waivedPromos = input.promos.filter(
        (p) => p.vendorId === vendorId && satisfied.has(p.promoId),
      );

      let flag: FeeFlag;
      let fee: number | null;
      let promoIds: string[] = [];
      if (waivedPromos.length > 0) {
        flag = 'promo-waived';
        fee = 0;
        promoIds = waivedPromos.map((p) => p.promoId);
      } else if (input.settings.hasPlus && allPlusCovered) {
        flag = 'plus-covered';
        fee = 0;
      } else if (!scoreOnly && pinnedVendors.has(vendorId)) {
        flag = 'already-paid-by-lock';
        fee = knownFee ?? fallback;
        if (knownFee === null) {
          totalIsEstimate = true;
          unknownFeeGroupCount++;
        }
      } else {
        flag = 'regular';
        fee = knownFee ?? fallback;
        if (knownFee === null) {
          totalIsEstimate = true;
          unknownFeeGroupCount++;
        }
      }
      deliverySubtotal += fee;
      groups.push({
        vendorId,
        ...(vendorName !== undefined ? { vendorName } : {}),
        shipmentClass: 'seller',
        lines: entry.seller,
        fee,
        feeFlag: flag,
        promoIds,
        subtotal: entry.seller.reduce((s, l) => s + l.lineTotal, 0),
      });
    }

    if (entry.large.length > 0) {
      const knownFee = feeTable.large.get(vendorId) ?? null;
      const fee = knownFee ?? fallback;
      if (knownFee === null) {
        totalIsEstimate = true;
        unknownFeeGroupCount++;
      }
      deliverySubtotal += fee;
      groups.push({
        vendorId,
        ...(vendorName !== undefined ? { vendorName } : {}),
        shipmentClass: 'large-item',
        lines: entry.large,
        fee,
        feeFlag: 'large-item',
        promoIds: [],
        subtotal: entry.large.reduce((s, l) => s + l.lineTotal, 0),
      });
    }
  }

  return { groups, deliverySubtotal, totalIsEstimate, unknownFeeGroupCount };
}

/** Assembles the final Plan from a complete assignment list. */
export function buildPlan(
  input: SolverInput,
  assignments: Assignment[],
  mode: Plan['mode'],
  unsolved: UnsolvedItem[],
): Plan {
  const feeTable = buildFeeTable(input);
  const { groups, deliverySubtotal, totalIsEstimate, unknownFeeGroupCount } = buildGroups(
    input,
    assignments,
    { feeTable },
  );
  const itemSubtotal = groups.reduce((s, g) => s + g.subtotal, 0);
  const grandTotal = itemSubtotal + deliverySubtotal;

  const assignmentsOut = groups
    .flatMap((g) => g.lines)
    .sort((a, b) => a.itemKey.localeCompare(b.itemKey));

  const plan: Plan = {
    mode,
    assignments: assignmentsOut,
    groups,
    itemSubtotal,
    deliverySubtotal,
    grandTotal,
    unsolved,
    totalIsEstimate,
  };

  if (totalIsEstimate) {
    // Honest range: low assumes unknown fees cost 0, high assumes the fallback
    // that was actually charged in grandTotal.
    const fallback = input.unknownFeeFallback ?? 0;
    plan.estimateRange = {
      low: grandTotal - unknownFeeGroupCount * fallback,
      high: grandTotal,
    };
  }

  if (input.currentCartTotal !== undefined) {
    plan.comparison = {
      currentCartTotal: input.currentCartTotal,
      savings: input.currentCartTotal === null ? null : input.currentCartTotal - grandTotal,
    };
  }

  return plan;
}

/** Scoring total: pins charged as normal vendors (enumeration view). */
export function scoringTotal(
  input: SolverInput,
  assignments: Assignment[],
  feeTable?: FeeTable,
): number {
  const { groups } = buildGroups(input, assignments, { scoreOnly: true, feeTable });
  return groups.reduce((s, g) => s + g.subtotal, 0) + groups.reduce((s, g) => s + (g.fee ?? 0), 0);
}

/**
 * The per-item-cheapest baseline (SDD 07 determinism notes / T04 property):
 * every unlocked item takes its cheapest allowed offer ignoring fees; pinned
 * items stay pinned. It is a feasible assignment, so the optimal plan's total
 * can never exceed it.
 */
export function perItemCheapestBaseline(
  input: SolverInput,
  allowedOffer?: (offer: SolverOffer, item: SolverItem) => boolean,
): Assignment[] {
  const out: Assignment[] = [];
  for (const item of input.items) {
    if (item.lock.mode === 'pin') {
      const offer = item.offers.find(
        (o) => o.vendorId === item.lock.vendorIds[0] && o.stock !== 'out-of-stock',
      );
      if (offer) out.push(toAssignment(item, offer));
      continue;
    }
    const banned = item.lock.mode === 'ban' ? new Set(item.lock.vendorIds) : undefined;
    const candidates = item.offers.filter((o) => !banned?.has(o.vendorId));
    const allowed = allowedOffer ? candidates.filter((o) => allowedOffer(o, item)) : candidates;
    const best = allowed
      .filter((o) => o.stock !== 'out-of-stock')
      .sort((a, b) => a.unitPrice - b.unitPrice || a.vendorId.localeCompare(b.vendorId))[0];
    if (best) out.push(toAssignment(item, best));
  }
  return out.sort(compareItemKey);
}

export function toAssignment(item: SolverItem, offer: SolverOffer): Assignment {
  return {
    itemKey: item.itemKey,
    vendorId: offer.vendorId,
    ...(offer.vendorName !== undefined ? { vendorName: offer.vendorName } : {}),
    unitPrice: offer.unitPrice,
    quantity: item.quantity,
    isLargeItem: offer.isLargeItem,
    plusCoversFee: offer.plusCoversFee,
    fee: offer.fee,
    ...(offer.variantId !== undefined ? { variantId: offer.variantId } : {}),
    ...(offer.capturedAt !== undefined ? { capturedAt: offer.capturedAt } : {}),
  };
}
