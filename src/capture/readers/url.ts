/**
 * URL builders and the closed-scope guard (D-03, NFR-07, spike S-2).
 *
 * Deep links carry the variant: `?variant_id=` reproduces the exact variant
 * on the PDP and inside cart URLs. The scope guard is defense in depth for
 * the orchestrator: any navigation target outside *.digikala.com is refused
 * before a tab ever navigates (D-02: no non-Digikala network).
 */
import { outOfScopeError } from '../errors';

const ALLOWED_SUFFIX = '.digikala.com';
/** Hosts the crawl may fetch or navigate (api + www, both *.digikala.com). */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);

/** True when the URL is http(s) and its host is (exactly) *.digikala.com. */
export function isDigikalaUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (!ALLOWED_PROTOCOLS.has(url.protocol)) return false;
    const host = url.hostname.toLowerCase();
    return host === ALLOWED_SUFFIX.slice(1) || host.endsWith(ALLOWED_SUFFIX);
  } catch {
    return false;
  }
}

/** Scope guard: throws OUT_OF_SCOPE for anything off *.digikala.com. */
export function assertDigikalaUrl(raw: string): void {
  if (!isDigikalaUrl(raw)) throw outOfScopeError(raw);
}

/** PDP deep link pinning the variant (spike S-2). */
export function productUrl(productId: string, variantId: string): string {
  return `https://www.digikala.com/product/dkp-${encodeURIComponent(productId)}/?variant_id=${encodeURIComponent(variantId)}`;
}

/** Product JSON API (the primary capture source, spike S-7/S-1). */
export function productApiUrl(productId: string, variantId: string): string {
  return `https://api.digikala.com/product/v1/products/${encodeURIComponent(productId)}/?variant_id=${encodeURIComponent(variantId)}`;
}

/** Cart JSON API. */
export const CART_API_URL = 'https://api.digikala.com/checkout/v1/carts';
export const CART_MINI_API_URL = 'https://api.digikala.com/checkout/v1/carts/mini';

/** Extract `?variant_id=` from any Digikala URL (cart items embed it, S-2). */
export function extractVariantId(raw: string): string | null {
  try {
    return new URL(raw).searchParams.get('variant_id');
  } catch {
    return null;
  }
}

/** Extract the numeric product id from a PDP path (`/product/dkp-<id>/...`). */
export function extractProductId(raw: string): string | null {
  try {
    const url = new URL(raw);
    const m = url.pathname.match(/\/product\/dkp-(\d+)/);
    return m?.[1] ?? null;
  } catch {
    return null;
  }
}
