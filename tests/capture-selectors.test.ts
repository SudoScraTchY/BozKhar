/**
 * Selectors module tests (mount points only, post-S-7): PDP/cart anchors,
 * page-kind detection, and the fallback variant-id read.
 */
// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import {
  SELECTORS_VERSION,
  PDP_SELLER_PANEL_CANDIDATES,
  CART_SUMMARY_CANDIDATES,
  findMountPoint,
  isProductPage,
  isCartPage,
  readVariantIdFromLocation,
} from '../src/capture/dom/selectors';

function docWith(html: string): Document {
  const host = document.createElement('div');
  host.innerHTML = html;
  return { querySelector: (sel: string) => host.querySelector(sel) } as unknown as Document;
}

describe('selectors (mount points only)', () => {
  it('is versioned', () => {
    expect(SELECTORS_VERSION).toMatch(/^\d+\.\d+\.\d+/);
  });

  it('finds the first matching PDP anchor', () => {
    const doc = docWith('<div data-testid="sellers-cta"></div>');
    const el = findMountPoint(doc, PDP_SELLER_PANEL_CANDIDATES);
    expect(el?.getAttribute('data-testid')).toBe('sellers-cta');
  });

  it('finds a fallback cart anchor when the primary is absent', () => {
    const doc = docWith('<div class="cart-summary"></div>');
    const el = findMountPoint(doc, CART_SUMMARY_CANDIDATES);
    expect(el?.className).toContain('cart-summary');
  });

  it('returns null when no anchor exists (never a wrong mount)', () => {
    expect(findMountPoint(docWith('<main></main>'), PDP_SELLER_PANEL_CANDIDATES)).toBeNull();
    expect(findMountPoint(docWith('<main></main>'), CART_SUMMARY_CANDIDATES)).toBeNull();
  });

  it('detects PDP and cart pages from the pathname', () => {
    expect(isProductPage('/product/dkp-12345/xiaomi-phone/')).toBe(true);
    expect(isProductPage('/cart')).toBe(false);
    expect(isCartPage('/cart')).toBe(true);
    expect(isCartPage('/product/dkp-1/x/')).toBe(false);
  });

  it('reads the variant id from the location (spike S-2 fallback)', () => {
    expect(readVariantIdFromLocation('https://www.digikala.com/product/dkp-1/?variant_id=77')).toBe(
      '77',
    );
    expect(readVariantIdFromLocation('https://www.digikala.com/product/dkp-1/')).toBeNull();
    expect(readVariantIdFromLocation('not a url')).toBeNull();
  });
});
