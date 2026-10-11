/**
 * The live CartTransport (D-26): the Digikala gateway
 * behind CartApplier. Discovered read-only from the
 * logged-in site (2026-10-10):
 *
 *   GET    /checkout/v1/carts            the cart
 *   POST   /checkout/v1/carts/items      { variant_ids: [...] }
 *   DELETE /checkout/v1/carts/items      { cartItemIds: [...] }
 *   GET    /product/v1/products/{id}/?variant_id={v}
 *
 * D-19 lesson: routing headers break this host's CORS
 * preflight — send Content-Type only; the session
 * cookie authenticates every call.
 */
import { rialToToman } from '../capture/normalize';
import { readProductPayload } from '../capture/readers/product';
import { extractVariantId } from '../capture/readers/url';
import type { CartLine, CartTransport, LiveOffer } from './apply';

const GATEWAY = 'https://api.digikala.com';

async function gateway<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${GATEWAY}${path}`, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`cart API ${res.status} on ${path}`);
  }
  return (await res.json()) as T;
}

/** Raw cart_item shape (only what the transport needs). */
interface RawCartItem {
  id?: number | string;
  product?: {
    id?: number | string;
    url?: { uri?: string };
    title_fa?: string;
  };
  variant?: { id?: number | string; seller?: { id?: number | string; title?: string } };
  seller?: { id?: number | string; title?: string };
  quantity?: number;
}

interface RawCartResponse {
  data?: { cart_items?: RawCartItem[] };
}

function variantIdFromUri(uri: string | undefined): string | null {
  if (!uri) return null;
  try {
    const absolute = new URL(uri, 'https://www.digikala.com').toString();
    return extractVariantId(absolute);
  } catch {
    return null;
  }
}

/** Normalizes the live cart into transport lines. */
export function toCartLines(raw: RawCartResponse): CartLine[] {
  const items = raw.data?.cart_items ?? [];
  const out: CartLine[] = [];
  for (const item of items) {
    if (!item) continue;
    const productId = item.product?.id !== undefined ? String(item.product.id) : '';
    const seller = item.seller ?? item.variant?.seller;
    const variantId =
      item.variant?.id !== undefined
        ? String(item.variant.id)
        : variantIdFromUri(item.product?.url?.uri);
    if (!productId || !variantId || item.id === undefined) continue;
    out.push({
      cartItemId: String(item.id),
      productId,
      variantId,
      sellerId: seller?.id !== undefined ? String(seller.id) : '',
      sellerName: seller?.title ?? '',
      quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
    });
  }
  return out;
}

/** The transport the apply flow runs on. */
export const cartTransport: CartTransport = {
  async fetchCart(): Promise<CartLine[]> {
    const raw = await gateway<RawCartResponse>('/checkout/v1/carts', { method: 'GET' });
    return toCartLines(raw);
  },

  async fetchOffer(
    productId: string,
    variantId: string,
    vendorId: string,
  ): Promise<LiveOffer | null> {
    const url = `/product/v1/products/${encodeURIComponent(productId)}/?variant_id=${encodeURIComponent(variantId)}`;
    const raw = await gateway<unknown>(url, { method: 'GET' });
    const view = readProductPayload(raw);
    // The chosen (variant, seller) pair must still exist
    // and be purchasable.
    for (const variant of view.variants) {
      if (variant.variantId !== variantId) continue;
      if (variant.sellerId !== vendorId) continue;
      if (variant.priceRial === null) return null;
      return {
        vendorId: variant.sellerId,
        price: rialToToman(variant.priceRial),
        stockState: variant.stockState,
      };
    }
    return null;
  },

  async addVariant(variantId: string): Promise<void> {
    await gateway('/checkout/v1/carts/items', {
      method: 'POST',
      body: JSON.stringify({ variant_ids: [variantId] }),
    });
  },

  async removeCartItem(cartItemId: string): Promise<void> {
    await gateway('/checkout/v1/carts/items', {
      method: 'DELETE',
      body: JSON.stringify({ cartItemIds: [cartItemId] }),
    });
  },
};
