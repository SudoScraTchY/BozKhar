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
  quantity?: number;
  product?: {
    id?: number | string;
    title_fa?: string;
    title_en?: string;
    url?: { uri?: string };
  };
  variant?: { id?: number | string };
  seller?: { id?: number | string; title?: string };
  price?: { selling_price?: number };
  shipment_methods?: Array<{
    providers?: Array<{ price?: { value?: number; is_free?: boolean } }>;
  }>;
}

export interface RawCartPayload {
  data?: { cart_item?: RawCartItem[]; items?: RawCartItem[] } | RawCartItem[];
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

function firstArray(raw: RawCartPayload): RawCartItem[] {
  const d = raw.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.cart_item)) return d.cart_item;
  if (d && Array.isArray(d.items)) return d.items;
  return [];
}

function readCartFee(item: RawCartItem): { feeRial: number | null; feeIsKnownFree: boolean } {
  const providers = item.shipment_methods?.[0]?.providers ?? [];
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
  const items = firstArray(raw as RawCartPayload);
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
    out.push({
      productId,
      variantId,
      title: item.product?.title_fa ?? item.product?.title_en ?? '',
      quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
      sellerId: item.seller?.id !== undefined ? String(item.seller.id) : '',
      sellerName: item.seller?.title ?? '',
      priceRial: typeof item.price?.selling_price === 'number' ? item.price.selling_price : null,
      feeRial,
      feeIsKnownFree,
      sourceUrl: absolute,
    });
  }
  return out;
}
