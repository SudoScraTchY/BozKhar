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
import type { ComparisonItem, Offer, ShipmentRecord, Snapshot } from '../shared/types';
import type { SolverInput, SolverItem, SolverOffer, SolverPromo } from '../shared/solver';

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

function toSolverOffer(snap: Snapshot, offer: Offer, correctedFee?: number): SolverOffer {
  return {
    vendorId: offer.vendor.id,
    ...(offer.vendor.name ? { vendorName: offer.vendor.name } : {}),
    unitPrice: offer.price,
    stock: offer.stockState,
    isLargeItem: offer.isLargeItem,
    // D-19: the shipment quote's package fee is the real
    // charge for the cart's current arrangement; it
    // overrides the product API's (sometimes missing)
    // per-offer estimate. Alternative variants keep the
    // product-API fee - their package fee is unobserved.
    fee: correctedFee ?? offer.delivery.feeAmount,
    ...(correctedFee !== undefined
      ? { feeSource: 'shipment' as const }
      : offer.delivery.feeAmount !== null
        ? { feeSource: 'product-api' as const }
        : {}),
    plusCoversFee: offer.delivery.plusApplies,
    ...(offer.capturedAt ? { capturedAt: offer.capturedAt } : {}),
    // D-17 passthrough: the variant this offer belongs to.
    variantId: snap.itemId.variantId,
  };
}

/**
 * D-19: the real package fee per variant id, from the
 * shipment quote captured with the crawl. A variant
 * appears in at most one package (the cart holds it
 * once); the package's fee is what the user is
 * actually charged to ship that package.
 */
export function shipmentFeeByVariant(
  shipment: ShipmentRecord | null | undefined,
): Map<string, number> {
  const map = new Map<string, number>();
  if (!shipment) return map;
  for (const pkg of shipment.packages) {
    for (const it of pkg.items) {
      map.set(it.variantId, pkg.shippingCost);
    }
  }
  return map;
}

/**
 * The current cart's cost under the solver's fee
 * model: items grouped by vendor x shipping class, one fee per group. Null
 * when any cart item has no current offer, or any current
 * group's fee is unknown - an explicit gap, never a silent
 * zero or a silently partial total (SDD 08).
 *
 * D-19: a variant's fee from the shipment quote (when
 * captured) is the real charge and wins over the
 * product API's per-offer fee.
 */
export function currentCartTotal(
  items: ComparisonItem[],
  snapshots: Snapshot[],
  shipment?: ShipmentRecord | null,
): number | null {
  const latest = latestSnapshotsByItem(snapshots);
  const feeByVariant = shipmentFeeByVariant(shipment);
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
    const fee = feeByVariant.get(item.itemId.variantId) ?? offer.delivery.feeAmount;
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
 *
 * D-19: when a shipment quote was captured with the crawl, the
 * cart's current arrangement is priced with the real package
 * fees (only the current variant's offer - the arrangement
 * the user is actually being charged for; alternative offers
 * keep the product-API fees).
 */
export function buildSolverInput(
  items: ComparisonItem[],
  snapshots: Snapshot[],
  settings: { hasPlus: boolean; tolerancePercent: number },
  shipment?: ShipmentRecord | null,
): SolverInput {
  const byProduct = new Map<string, Snapshot[]>();
  for (const snap of snapshots) {
    const list = byProduct.get(snap.itemId.productId) ?? [];
    list.push(snap);
    byProduct.set(snap.itemId.productId, list);
  }
  const feeByVariant = shipmentFeeByVariant(shipment);
  // Promos ride along from the captures (D-08). The
  // solver knows two shapes; amount-threshold is
  // unverified (OQ-01) and is dropped here.
  const solverPromos: SolverPromo[] = [];
  for (const snap of snapshots) {
    for (const promo of snap.promos) {
      if (promo.type !== 'same-item-count' && promo.type !== 'vendor-count') {
        continue;
      }
      solverPromos.push({
        promoId: promo.promoId,
        vendorId: promo.vendorId,
        type: promo.type,
        thresholdValue: promo.thresholdValue,
        effect: promo.effect,
        ...(promo.type === 'same-item-count'
          ? { itemKey: itemKeyOf(snap.itemId.productId, snap.itemId.variantId as string) }
          : {}),
        ...(promo.rawText ? { rawText: promo.rawText } : {}),
      });
    }
  }
  const solverItems: SolverItem[] = items.map((item) => {
    const productSnaps = byProduct.get(item.itemId.productId) ?? [];
    const isCurrentVariant = (snap: Snapshot): boolean =>
      snap.itemId.variantId === item.itemId.variantId;
    const offers = productSnaps.flatMap((snap) =>
      snap.offers.map((o) =>
        toSolverOffer(
          snap,
          o,
          // Only the cart's current selection is priced
          // from the quote (its package fee is observed);
          // every alternative keeps the product-API fee.
          isCurrentVariant(snap) ? feeByVariant.get(snap.itemId.variantId) : undefined,
        ),
      ),
    );
    // Display-only passthrough: the product's main
    // picture, so the results page can show it
    // beside the item name (issue #10).
    const withImage = productSnaps.find((snap) => snap.imageUrl);
    return {
      itemKey: itemKeyOf(item.itemId.productId, item.itemId.variantId),
      ...(item.product.title ? { title: item.product.title } : {}),
      ...(item.variant.label ? { variantLabel: item.variant.label } : {}),
      ...(withImage?.imageUrl ? { imageUrl: withImage.imageUrl } : {}),
      quantity: item.quantity,
      offers,
      lock: { mode: item.lock.mode, vendorIds: item.lock.vendorIds },
    };
  });
  return {
    items: solverItems,
    promos: solverPromos,
    settings: {
      hasPlus: settings.hasPlus,
      tolerancePercent: settings.tolerancePercent,
    },
    // SDD 08: unknown fees score at the largest known fee.
    unknownFeeFallback: largestKnownFee(solverItems),
    currentCartTotal: currentCartTotal(items, snapshots, shipment),
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
