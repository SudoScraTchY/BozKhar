/**
 * T03 reader + normalizer tests against sanitized, hand-authored fixtures
 * matching the spike-documented payload shapes (SDD spike-findings.md v2).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readProductPayload, isLargeShipmentLabel } from '../src/capture/readers/product';
import { readCartPayload } from '../src/capture/readers/cart';
import {
  extractProductId,
  extractVariantId,
  isDigikalaUrl,
  productApiUrl,
} from '../src/capture/readers/url';
import { CaptureError } from '../src/capture/errors';
import { normalizeVariantToOffer, buildSnapshot, rialToToman } from '../src/capture/normalize';
import { EXTRACTOR_VERSION } from '../src/capture/version';

const FIXTURES = join(__dirname, 'fixtures', 'capture');
function load(name: string): unknown {
  return JSON.parse(readFileSync(join(FIXTURES, name), 'utf-8'));
}

describe('T03 product payload reader (spike S-1 shapes)', () => {
  const view = readProductPayload(load('product-basic.json'));

  it('reads product identity and title', () => {
    expect(view.productId).toBe('16622211');
    expect(view.title).toBe('گوشی موبایل نمونه');
    expect(view.variants).toHaveLength(4);
  });

  it('reads per-seller fee from providers[].price (Rial in, raw out)', () => {
    const v = view.variants.find((x) => x.variantId === '62270876');
    expect(v?.feeRial).toBe(350000);
    expect(v?.feeIsKnownFree).toBe(false);
    expect(v?.sellerId).toBe('101');
    expect(v?.priceRial).toBe(45500000);
    expect(v?.stockState).toBe('in-stock');
  });

  it('reads known-free fee (is_free) as zero-with-provenance', () => {
    const v = view.variants.find((x) => x.variantId === '62270877');
    expect(v?.feeRial).toBe(0);
    expect(v?.feeIsKnownFree).toBe(true);
  });

  it('reads FBM (providers: []) as fee UNKNOWN, not zero (spike F-4)', () => {
    const v = view.variants.find((x) => x.variantId === '62270878');
    expect(v?.feeRial).toBeNull();
    expect(v?.feeIsKnownFree).toBe(false);
    // is_locked_for_digiplus still surfaces as Plus entitlement.
    expect(v?.plusCoversFee).toBe(true);
  });

  it('reads out-of-stock variant without dropping it', () => {
    const v = view.variants.find((x) => x.variantId === '62270879');
    expect(v?.stockState).toBe('out-of-stock');
    expect(v?.feeRial).toBe(350000);
  });

  it('large & heavy class detected from shipping_type (spike S-5)', () => {
    expect(isLargeShipmentLabel('ارسال کالاهای بزرگ و سنگین')).toBe(true);
    expect(isLargeShipmentLabel('ارسال توسط فروشنده')).toBe(false);
    const large = readProductPayload(load('product-large-item.json'));
    const v = large.variants[0];
    expect(v?.isLargeItem).toBe(true);
    expect(v?.feeRial).toBe(3590000);
  });

  it('Plus entitlement from digiplus.services[] and the lock flag (spike S-3)', () => {
    const plus = readProductPayload(load('product-plus.json'));
    expect(plus.variants[0]?.plusCoversFee).toBe(true);
    expect(plus.variants[1]?.plusCoversFee).toBe(false);
  });

  it('malformed payload raises STRUCTURE_UNRECOGNIZED (per-item containment)', () => {
    expect(() => readProductPayload(load('product-malformed.json'))).toThrow(CaptureError);
    try {
      readProductPayload(load('product-malformed.json'));
    } catch (e) {
      expect((e as CaptureError).code).toBe('STRUCTURE_UNRECOGNIZED');
    }
  });
});

describe('T03 cart payload reader (spike S-2/F-2 shapes)', () => {
  const items = readCartPayload(load('cart-basic.json'));

  it('reads cart items with variant identity from the URL (S-2)', () => {
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({
      productId: '16622211',
      variantId: '62270876',
      quantity: 2,
      sellerId: '101',
    });
  });

  it('sees the repeated per-seller fee line on each item of that seller (F-2)', () => {
    expect(items[0]?.feeRial).toBe(350000);
    expect(items[1]?.feeRial).toBe(350000);
  });

  it('reads FBM cart item (no fee line) as unknown fee', () => {
    expect(items[2]?.feeRial).toBeNull();
    expect(items[2]?.sellerId).toBe('103');
  });
});

describe('T03 URL module (scope guard + deep links, spike S-2)', () => {
  it('scope guard accepts digikala hosts only', () => {
    expect(isDigikalaUrl('https://api.digikala.com/product/v1/products/1/')).toBe(true);
    expect(isDigikalaUrl('https://www.digikala.com/product/dkp-1/')).toBe(true);
    expect(isDigikalaUrl('https://digikala.com/')).toBe(true);
    expect(isDigikalaUrl('https://evil-digikala.com/')).toBe(false); // suffix trick
    expect(isDigikalaUrl('https://digikala.com.evil.com/')).toBe(false);
    expect(isDigikalaUrl('file:///C:/x')).toBe(false);
    expect(isDigikalaUrl('not a url')).toBe(false);
  });

  it('builds variant-pinned PDP + API deep links', () => {
    expect(productApiUrl('16622211', '62270876')).toBe(
      'https://api.digikala.com/product/v1/products/16622211/?variant_id=62270876',
    );
  });

  it('extracts ids from Digikala URLs', () => {
    expect(extractVariantId('https://www.digikala.com/product/dkp-1/x?variant_id=62270876')).toBe(
      '62270876',
    );
    expect(extractProductId('https://www.digikala.com/product/dkp-16622211/x/')).toBe('16622211');
    expect(extractVariantId('https://www.digikala.com/no-param')).toBeNull();
  });
});

describe('T03 normalizer (Rial -> Toman, provenance, SDD 08 shapes)', () => {
  const view = readProductPayload(load('product-basic.json'));
  const capturedAt = '2026-10-05T10:00:00.000Z';

  it('converts Rial to Toman exactly once', () => {
    expect(rialToToman(45500000)).toBe(4550000);
    expect(rialToToman(350000)).toBe(35000);
    expect(rialToToman(5)).toBe(1); // rounding on odd remainders
  });

  it('normalizes a variant to the canonical Offer shape', () => {
    const v = view.variants.find((x) => x.variantId === '62270876');
    expect(v).toBeDefined();
    const offer = normalizeVariantToOffer(view.productId, v!, { capturedAt });
    expect(offer).toMatchObject({
      vendor: { id: '101', name: 'فروشنده الف' },
      price: 4550000,
      stockState: 'in-stock',
      isLargeItem: false,
    });
    expect(offer.delivery).toEqual({
      feeAmount: 35000,
      provenance: 'page-visible',
      plusApplies: false,
    });
    expect(offer.extractorVersion).toBe(EXTRACTOR_VERSION);
    expect(offer.capturedAt).toBe(capturedAt);
  });

  it('keeps unknown fee as explicit null with page-visible provenance', () => {
    const v = view.variants.find((x) => x.variantId === '62270878');
    expect(v).toBeDefined();
    const offer = normalizeVariantToOffer(view.productId, v!, { capturedAt });
    expect(offer.delivery.feeAmount).toBeNull();
    expect(offer.delivery.provenance).toBe('page-visible');
  });

  it('builds an append-only Snapshot stamped with item identity + version', () => {
    const v = view.variants.find((x) => x.variantId === '62270876');
    expect(v).toBeDefined();
    const offer = normalizeVariantToOffer(view.productId, v!, { capturedAt });
    const snap = buildSnapshot(view.productId, '62270876', 'variant label', [offer], {
      capturedAt,
    });
    expect(snap.snapshotId).toBe('16622211::62270876::2026-10-05T10:00:00.000Z');
    expect(snap.itemId).toEqual({ productId: '16622211', variantId: '62270876' });
    expect(snap.offers).toHaveLength(1);
    expect(snap.extractorVersion).toBe(EXTRACTOR_VERSION);
  });

  it('cart-preview provenance when fees came from the cart payload', () => {
    const v = view.variants.find((x) => x.variantId === '62270877');
    expect(v).toBeDefined();
    const offer = normalizeVariantToOffer(view.productId, v!, {
      capturedAt,
      feeProvenance: 'cart-preview',
    });
    expect(offer.delivery.provenance).toBe('cart-preview');
    expect(offer.delivery.feeAmount).toBe(0); // known-free stays a real zero
  });
});
