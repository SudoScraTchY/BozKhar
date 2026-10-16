/**
 * Cart JSON API payload reader (spike S-2/S-6).
 *
 * Reads documented shapes only:
 *   data.cart_item[] / data.items[] — each with product{id,title_fa,url{uri}},
 *   quantity, seller{id,title} or variants[].seller, price{selling_price}.
 * Cart item URLs embed `?variant_id=` (S-2) — variant identity comes from there.
 *
 * The cart payload repeats the per-seller fee line on every item of that
 * seller (spike F-2); readers surface the raw fee per item and the merge
 * step dedupes. FBM items (no fee line) become feeRial null = unknown.
 */
import { structureUnrecognized } from '../errors';
import { extractVariantId } from './url';

export interface RawCartItem {
  /**
   * The cart ROW id. Only the apply flow needs it: removing a line
   * names this id (D-28's DELETE body), so it must not be lost
   * (D-30).
   */
  id?: number | string;
  quantity?: number;
  product?: {
    id?: number | string;
    title_fa?: string;
    title_en?: string;
    url?: { uri?: string };
  };
  variant?: {
    id?: number | string;
    /** LIVE shape (2026-10-07): seller lives on the variant. */
    seller?: { id?: number | string; title?: string };
    /** LIVE shape: the fee (shipment provider) lives on the variant. */
    shipment_methods?: RawShipmentMethodsLike;
  };
  seller?: { id?: number | string; title?: string };
  price?: { selling_price?: number };
  shipment_methods?: RawShipmentMethodsLike;
}

interface RawShipmentMethods {
  providers?: Array<{ price?: { value?: number; is_free?: boolean } }>;
}

/** Object form (live) or array-of-methods form (legacy fixtures). */
export type RawShipmentMethodsLike = RawShipmentMethods | RawShipmentMethods[];

/** One vendor package of the LIVE cart payload. */
export interface RawCartPackage {
  cart_items?: RawCartItem[];
}

export interface RawCartPayload {
  data?:
    | {
        cart_item?: RawCartItem[];
        items?: RawCartItem[];
        /** LIVE shape (verified 2026-10-07): packages[].cart_items[]. */
        packages?: RawCartPackage[];
      }
    | RawCartItem[];
}

export interface CartItemView {
  productId: string;
  variantId: string | null;
  title: string;
  quantity: number;
  sellerId: string;
  sellerName: string;
  priceRial: number | null;
  /** Per-seller fee line as repeated on this item (Rial); null = unknown/FBM. */
  feeRial: number | null;
  feeIsKnownFree: boolean;
  sourceUrl: string | null;
}

/**
 * The cart payload's item list, across every documented shape:
 * data.packages[].cart_items[] (LIVE, verified 2026-10-07),
 * data.cart_item[], data.items[], or data itself as an array.
 *
 * Exported so every consumer agrees on the shapes: the apply flow's
 * transport reads the same payload and must find the same rows
 * (D-30 - a shape-blind read there silently found no cart rows, so
 * nothing was ever applyable).
 */
export function cartItemsOf(raw: unknown): RawCartItem[] {
  const d = raw && typeof raw === 'object' ? (raw as RawCartPayload).data : undefined;
  if (Array.isArray(d)) return d;
  if (!d) return [];
  // LIVE shape first (verified against the real API 2026-10-07):
  // data.packages[].cart_items[] - one package per shipment group.
  if (Array.isArray(d.packages)) {
    const out: RawCartItem[] = [];
    for (const pkg of d.packages) {
      if (pkg && Array.isArray(pkg.cart_items)) out.push(...pkg.cart_items);
    }
    if (out.length > 0) return out;
  }
  if (Array.isArray(d.cart_item)) return d.cart_item;
  if (Array.isArray(d.items)) return d.items;
  return [];
}

function readCartFee(item: RawCartItem): { feeRial: number | null; feeIsKnownFree: boolean } {
  // LIVE shape: shipment_methods sits on the variant; the
  // legacy fixture form has it on the item.
  const methods = item.shipment_methods ?? item.variant?.shipment_methods;
  // Object form (live) or first-of-array (legacy fixtures).
  const first = Array.isArray(methods) ? methods[0] : methods;
  const providers = first?.providers ?? [];
  const withPrice = providers.find((p) => p.price !== undefined);
  if (!withPrice?.price) return { feeRial: null, feeIsKnownFree: false };
  if (withPrice.price.is_free === true) return { feeRial: 0, feeIsKnownFree: true };
  if (typeof withPrice.price.value === 'number')
    return { feeRial: withPrice.price.value, feeIsKnownFree: false };
  return { feeRial: null, feeIsKnownFree: false };
}

export function readCartPayload(raw: unknown): CartItemView[] {
  if (typeof raw !== 'object' || raw === null) {
    throw structureUnrecognized('cart payload is not an object');
  }
  const items = cartItemsOf(raw);
  const out: CartItemView[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item) continue;
    const productId = item.product?.id !== undefined ? String(item.product.id) : '';
    if (!productId) {
      throw structureUnrecognized(`cart_item[${i}].product.id missing`);
    }
    const uri = item.product?.url?.uri;
    const absolute = uri ? new URL(uri, 'https://www.digikala.com').toString() : null;
    // Variant identity from the URL (spike S-2); explicit variant object wins.
    const variantId =
      item.variant?.id !== undefined
        ? String(item.variant.id)
        : absolute
          ? extractVariantId(absolute)
          : null;

    const { feeRial, feeIsKnownFree } = readCartFee(item);
    // LIVE shape: the seller sits on the variant; the legacy
    // fixture form has it on the item.
    const seller = item.seller ?? item.variant?.seller;
    out.push({
      productId,
      variantId,
      title: item.product?.title_fa ?? item.product?.title_en ?? '',
      quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
      sellerId: seller?.id !== undefined ? String(seller.id) : '',
      sellerName: seller?.title ?? '',
      priceRial: typeof item.price?.selling_price === 'number' ? item.price.selling_price : null,
      feeRial,
      feeIsKnownFree,
      sourceUrl: absolute,
    });
  }
  return out;
}
