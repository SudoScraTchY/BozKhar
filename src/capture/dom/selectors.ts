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

export const SELECTORS_VERSION = '0.5.0-t03';

/**
 * Torob trigger anchor (D-47): the product title, never the buy box. The
 * desktop buy box lives inside a `sticky top-[180px]` wrapper, so anything
 * inserted after it is painted over by the box while scrolling; on mobile
 * the only buy-box CTA is inside the fixed bottom bar. The title is in
 * normal flow on both layouts, above the fold, and cannot be overlapped.
 * Both BozKhar PDP actions mount under this title.
 */
export const PDP_TITLE_CANDIDATES = [
  '[data-testid="pdp-title"]', // desktop PDP title
  'h1', // live mobile PDP has no test id on the heading
] as const;

/**
 * Cart table anchor (09-ui-spec Surface 2): mounts near the cart summary
 * controls, not floating over the item list.
 *
 * Live-site alignment (smoke 2026-10-06): Digikala's cart page has no
 * stable test-id; the checkout CTA (ثبت سفارش) sits inside an absolutely
 * positioned summary card. Candidates: the card container (bg-neutral-000
 * + shadow), legacy test-ids, and the checkout link's positioning wrapper.
 */
export const CART_SUMMARY_CANDIDATES = [
  '[data-testid="cart-summary"]',
  // Live cart page: the summary card that hosts the checkout CTA.
  'div.bg-neutral-000.rounded.shadow-3-bottom',
  'a[href*="/checkout"][class*="w-full"]', // the ثبت سفارش link itself (fallback)
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

/** True for the order-history tab and its individual order pages. */
export function isOrderHistoryPage(pathname: string): boolean {
  return /\/profile\/orders(?:\/|$)/.test(pathname);
}

/** First existing element among candidates; null when none matches. */
export function findMountPoint(doc: Document, candidates: readonly string[]): Element | null {
  for (const sel of candidates) {
    const el = doc.querySelector(sel);
    if (el) return el;
  }
  return null;
}
