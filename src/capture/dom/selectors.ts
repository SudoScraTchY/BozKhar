/**
 * DOM mount points ONLY (post-S-7 architecture, see 06-architecture.md).
 *
 * The payload readers module is the primary extractor; the DOM is scoped to
 * (a) mount points for the content-script buttons and (b) a *fallback* read
 * of tiny page-context facts (current variant id) that the JSON API needs.
 * Nothing here ever extracts offers, prices, or fees.
 *
 * Versioned like any site-coupled code (NFR-05, R-02): bump
 * SELECTORS_VERSION on any change; fixture-tested, canary tests in T06.
 */

export const SELECTORS_VERSION = '0.3.0-t03';

/**
 * PDP seller/offer panel anchor (09-ui-spec Surface 1): the button mounts
 * adjacent to the seller panel so it reads as part of the vendor list.
 * Candidate list, first match wins; null = no anchor found (button not
 * injected - never a silent wrong placement).
 */
export const PDP_SELLER_PANEL_CANDIDATES = [
  // Current Digikala PDP seller box (sticky buy panel).
  '[data-testid="sellers-cta"]',
  '[data-testid="buy-box"]',
  // Legacy/themed layouts: the add-to-cart form container.
  'form[action*="cart"]',
  '[class*="seller"] [class*="add-to-cart"]',
] as const;

/**
 * Cart table anchor (09-ui-spec Surface 2): mounts near the cart summary
 * controls, not floating over the item list.
 */
export const CART_SUMMARY_CANDIDATES = [
  '[data-testid="cart-summary"]',
  // Digikala cart page checkout/supplier summary block.
  '[class*="cart"] [class*="checkout"]',
  '[class*="cart-summary"]',
] as const;

/**
 * Fallback page-context read: the PDP's currently selected variant id,
 * wherever `?variant_id=` is present in the page URL (spike S-2 deep-link
 * contract). Returns null when absent; callers must treat null as "ask the
 * service worker to resolve", never guess.
 */
export function readVariantIdFromLocation(href: string): string | null {
  try {
    return new URL(href).searchParams.get('variant_id');
  } catch {
    return null;
  }
}

/** True when the location is a PDP (`/product/dkp-<id>/...`). */
export function isProductPage(pathname: string): boolean {
  return /\/product\/dkp-\d+/.test(pathname);
}

/** True when the location is the cart page. */
export function isCartPage(pathname: string): boolean {
  return /\/cart/.test(pathname);
}

/** First existing element among candidates; null when none matches. */
export function findMountPoint(doc: Document, candidates: readonly string[]): Element | null {
  for (const sel of candidates) {
    const el = doc.querySelector(sel);
    if (el) return el;
  }
  return null;
}
