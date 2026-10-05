/**
 * Normalizer (SDD 08): reader views -> canonical Offer / Snapshot entities.
 *
 * Money: payloads are Rial, the canonical model and the solver are Toman
 * (1 Toman = 10 Rial). Conversion happens exactly once, here - everything
 * downstream sees integers in Toman.
 *
 * Fee provenance (SDD 08): 'page-visible' when the payload carried a fee
 * value (including a known-free fee); 'cart-preview' when the fee came from
 * the cart payload's repeated per-seller line; null feeAmount with
 * 'page-visible' provenance = known-absent (FBM), an explicit unknown - never
 * a silent zero.
 */
import type { Offer, Snapshot, Snapshot as SnapshotT } from '../shared/types';
import { EXTRACTOR_VERSION } from './version';
import type { ProductVariantView } from './readers/product';
import { productApiUrl } from './readers/url';

export const RIAL_PER_TOMAN = 10;

export function rialToToman(rial: number): number {
  return Math.round(rial / RIAL_PER_TOMAN);
}

export interface NormalizeOptions {
  /** ISO timestamp for the capture moment; defaults to now. */
  capturedAt?: string;
  /**
   * Where the fee values came from. The product API is the page surface
   * ('page-visible'); fees read from the cart payload are 'cart-preview'.
   */
  feeProvenance?: 'page-visible' | 'cart-preview';
  snapshotId?: string;
}

export function normalizeVariantToOffer(
  productId: string,
  variant: ProductVariantView,
  options: NormalizeOptions = {},
): Offer {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const provenance = options.feeProvenance ?? 'page-visible';

  // Known-free stays 0 (a known value); absent/unknown stays null.
  const feeToman = variant.feeRial === null ? null : rialToToman(variant.feeRial);

  return {
    vendor: {
      id: variant.sellerId,
      name: variant.sellerName,
    },
    price:
      variant.priceRial === null
        ? 0 // unpurchasable variant; stockState carries the truth
        : rialToToman(variant.priceRial),
    stockState: variant.stockState,
    isLargeItem: variant.isLargeItem,
    delivery: {
      feeAmount: feeToman,
      provenance,
      plusApplies: variant.plusCoversFee,
    },
    promoIds: [],
    capturedAt,
    extractorVersion: EXTRACTOR_VERSION,
    sourceUrl: productApiUrl(productId, variant.variantId),
  };
}

export function buildSnapshot(
  productId: string,
  variantId: string,
  variantLabel: string,
  offers: Offer[],
  options: NormalizeOptions = {},
): SnapshotT {
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  return {
    snapshotId: options.snapshotId ?? `${productId}::${variantId}::${capturedAt}`,
    itemId: { productId, variantId },
    offers,
    promos: [],
    capturedAt,
    extractorVersion: EXTRACTOR_VERSION,
  };
}

/** Convenience: one variant -> one offer + snapshot in canonical shape. */
export function normalizeProductVariant(
  view: { productId: string; title: string; variants: ProductVariantView[] },
  variantId: string,
  variantLabel: string,
  options: NormalizeOptions = {},
): { offer: Offer; snapshot: Snapshot } | null {
  const variant = view.variants.find((v) => v.variantId === variantId);
  if (!variant) return null;
  const offer = normalizeVariantToOffer(view.productId, variant, options);
  return {
    offer,
    snapshot: buildSnapshot(view.productId, variantId, variantLabel, [offer], options),
  };
}
