/**
 * Solver-input assembly (T05.1).
 *
 * Pure: cart items + the append-only snapshot store in, the
 * solver's plain-data input out. No I/O, no DOM, no chrome.* -
 * the results page supplies the data.
 *
 * The current-cart total is computed with the solver's own fee
 * model (one fee per vendor x shipment-class group) so the
 * "before" and "after" numbers reconcile against the same
 * arithmetic (FR-12).
 */
import type { ComparisonItem, Offer, Snapshot } from '../shared/types';
import type { SolverInput, SolverItem, SolverOffer } from '../shared/solver';

export const ITEM_KEY_SEP = '::';

export function itemKeyOf(productId: string, variantId: string): string {
  return `${productId}${ITEM_KEY_SEP}${variantId}`;
}

/** Latest snapshot per item key (append-only store: capture time wins). */
export function latestSnapshotsByItem(snapshots: Snapshot[]): Map<string, Snapshot> {
  const map = new Map<string, Snapshot>();
  for (const snap of snapshots) {
    const key = itemKeyOf(snap.itemId.productId, snap.itemId.variantId);
    const prev = map.get(key);
    if (
      !prev ||
      snap.capturedAt > prev.capturedAt ||
      (snap.capturedAt === prev.capturedAt && snap.snapshotId > prev.snapshotId)
    ) {
      map.set(key, snap);
    }
  }
  return map;
}

/** Every captured variant of one product (D-17). */
export function snapshotsForProduct(snapshots: Snapshot[], productId: string): Snapshot[] {
  return snapshots.filter((s) => s.itemId.productId === productId);
}

function toSolverOffer(snap: Snapshot, offer: Offer): SolverOffer {
  return {
    vendorId: offer.vendor.id,
    ...(offer.vendor.name ? { vendorName: offer.vendor.name } : {}),
    unitPrice: offer.price,
    stock: offer.stockState,
    isLargeItem: offer.isLargeItem,
    fee: offer.delivery.feeAmount,
    plusCoversFee: offer.delivery.plusApplies,
    ...(offer.capturedAt ? { capturedAt: offer.capturedAt } : {}),
    // D-17 passthrough: the variant this offer belongs to.
    variantId: snap.itemId.variantId,
  };
}

/**
 * The current cart's cost under the solver's fee model: items
 * grouped by vendor x shipping class, one fee per group. Null
 * when any cart item has no current offer, or any current
 * group's fee is unknown - an explicit gap, never a silent
 * zero or a silently partial total (SDD 08).
 */
export function currentCartTotal(items: ComparisonItem[], snapshots: Snapshot[]): number | null {
  const latest = latestSnapshotsByItem(snapshots);
  const groups = new Map<string, { subtotal: number; fee: number | null }>();
  for (const item of items) {
    const snap = latest.get(itemKeyOf(item.itemId.productId, item.itemId.variantId));
    // In the D-17 capture a snapshot holds exactly one variant's
    // offer; offers[0] is that offer (a multi-offer snapshot is a
    // future shape - the first offer stands in honestly until then).
    const offer = snap?.offers[0];
    if (!offer) return null; // no capture for a cart item: total unknown
    const groupKey = `${offer.vendor.id}|${offer.isLargeItem ? 'large' : 'seller'}`;
    const group = groups.get(groupKey) ?? { subtotal: 0, fee: null };
    group.subtotal += offer.price * item.quantity;
    const fee = offer.delivery.feeAmount;
    if (fee !== null) {
      // One vendor x class charges one fee; conflicting reads take
      // the higher, the honest charge.
      group.fee = group.fee === null ? fee : Math.max(group.fee, fee);
    }
    groups.set(groupKey, group);
  }
  let total = 0;
  for (const group of groups.values()) {
    total += group.subtotal;
    if (group.fee === null) return null; // unknown fee: total unknown
    total += group.fee;
  }
  return total;
}

/**
 * The solver input for the whole comparison list: every captured
 * variant of every cart item's product (D-17) is an offer the
 * solver may choose. Locks ride along from the stored items.
 */
export function buildSolverInput(
  items: ComparisonItem[],
  snapshots: Snapshot[],
  settings: { hasPlus: boolean; tolerancePercent: number },
): SolverInput {
  const byProduct = new Map<string, Snapshot[]>();
  for (const snap of snapshots) {
    const list = byProduct.get(snap.itemId.productId) ?? [];
    list.push(snap);
    byProduct.set(snap.itemId.productId, list);
  }
  const solverItems: SolverItem[] = items.map((item) => {
    const productSnaps = byProduct.get(item.itemId.productId) ?? [];
    const offers = productSnaps.flatMap((snap) => snap.offers.map((o) => toSolverOffer(snap, o)));
    return {
      itemKey: itemKeyOf(item.itemId.productId, item.itemId.variantId),
      ...(item.product.title ? { title: item.product.title } : {}),
      ...(item.variant.label ? { variantLabel: item.variant.label } : {}),
      quantity: item.quantity,
      offers,
      lock: { mode: item.lock.mode, vendorIds: item.lock.vendorIds },
    };
  });
  return {
    items: solverItems,
    promos: [],
    settings: {
      hasPlus: settings.hasPlus,
      tolerancePercent: settings.tolerancePercent,
    },
    // SDD 08: unknown fees score at the largest known fee.
    unknownFeeFallback: largestKnownFee(solverItems),
    currentCartTotal: currentCartTotal(items, snapshots),
  };
}

/** The largest known (non-null) fee across the assembled offers. */
function largestKnownFee(items: SolverItem[]): number | undefined {
  let max: number | undefined;
  for (const item of items) {
    for (const offer of item.offers) {
      if (offer.fee !== null && (max === undefined || offer.fee > max)) {
        max = offer.fee;
      }
    }
  }
  return max;
}
