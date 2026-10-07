/**
 * Reader shape tests for the LIVE API object form of `shipment_methods`
 * (smoke finding 2026-10-06): the current api.digikala.com payload sends ONE
 * object {providers: [...]} instead of an array of methods, providers carry
 * `type: 'seller'`, and stock comes as `status: 'marketable'`.
 */
import { describe, expect, it } from 'vitest';
import { readProductPayload } from '../src/capture/readers/product';
import { readCartPayload } from '../src/capture/readers/cart';

import cartLiveShape from './fixtures/capture/cart-live-shape.json';

const LIVE_SHAPE = {
  data: {
    product: {
      id: 16622211,
      title_fa: 'محصول واقعی',
      variants: [
        {
          id: 58880138,
          status: 'marketable',
          seller: { id: 700848, title: 'طهران فارماسی' },
          price: {
            selling_price: 3_390_000,
            is_locked_for_digiplus: false,
          },
          // LIVE: object form, provider type 'seller', price present.
          shipment_methods: {
            description: 'موجود در انبار فروشنده',
            providers: [
              {
                type: 'seller',
                shipping_mode: 'seller',
                title: 'تحویل عادی فروشنده',
                price: { value: 2_500_000, is_free: false },
              },
            ],
          },
          digiplus: { services: ['پشتیبانی اختصاصی'] },
        },
        {
          id: 58880139,
          status: 'unavailable',
          seller: { id: 700849, title: 'فروشنده دو' },
          price: { selling_price: 4_000_000 },
          shipment_methods: {
            providers: [{ type: 'seller', price: { value: 490_000, is_free: false } }],
          },
        },
      ],
    },
  },
};

describe('readProductPayload: live object-form shipment_methods (smoke finding)', () => {
  it('reads fee/stock from the object form and status field', () => {
    const view = readProductPayload(LIVE_SHAPE);
    expect(view.productId).toBe('16622211');
    expect(view.variants).toHaveLength(2);

    const [first, second] = view.variants;
    expect(first?.variantId).toBe('58880138');
    expect(first?.sellerId).toBe('700848');
    expect(first?.stockState).toBe('in-stock'); // status marketable
    expect(first?.feeRial).toBe(2_500_000); // Rial
    expect(first?.priceRial).toBe(3_390_000);
    expect(first?.plusCoversFee).toBe(false); // support service, not shipment

    expect(second?.stockState).toBe('out-of-stock'); // status unavailable
  });

  it('treats type:"seller" as the fee provider (live field)', () => {
    const view = readProductPayload({
      data: {
        product: {
          id: 1,
          variants: [
            {
              id: 2,
              status: 'marketable',
              // Two providers: non-seller with price first; seller must win.
              shipment_methods: {
                providers: [
                  { title: 'سریع', price: { value: 999_999, is_free: false } },
                  { type: 'seller', price: { value: 111_111, is_free: false } },
                ],
              },
            },
          ],
        },
      },
    });
    expect(view.variants[0]?.feeRial).toBe(111_111);
  });
});

describe('readCartPayload: live packages shape (verified 2026-10-07)', () => {
  it('reads items from data.packages[].cart_items[] with variant seller + fee', () => {
    const views = readCartPayload(cartLiveShape);
    expect(views).toHaveLength(3);

    const [a, b, c] = views;
    expect(a?.productId).toBe('16622211');
    expect(a?.variantId).toBe('62270876'); // from the variant object
    expect(a?.sellerId).toBe('101'); // seller lives on the variant
    expect(a?.sellerName).toBe('فروشنده نمونه یک');
    expect(a?.priceRial).toBe(45500000);
    expect(a?.feeRial).toBe(350000); // fee line lives on the variant
    expect(a?.feeIsKnownFree).toBe(false);
    expect(a?.quantity).toBe(2);
    expect(a?.sourceUrl).toBe(
      'https://www.digikala.com/product/dkp-16622211/%DA%AF%D9%88%D8%B4%DB%8C-%D9%86%D9%85%D9%88%D9%86%D9%87-%D8%A7%D9%84%D9%81?variant_id=62270876',
    );

    // Second item repeats the same seller's fee line (spike F-2).
    expect(b?.sellerId).toBe('101');
    expect(b?.feeRial).toBe(350000);

    // Third item: different seller, FBM (no providers) => fee unknown.
    expect(c?.sellerId).toBe('102');
    expect(c?.feeRial).toBeNull();
    expect(c?.feeIsKnownFree).toBe(false);
  });

  it('flattens multiple packages into one item list', () => {
    const views = readCartPayload({
      data: {
        packages: [
          {
            cart_items: [
              {
                quantity: 1,
                product: { id: 1, title_fa: 'الف', url: { uri: '/product/dkp-1/?variant_id=11' } },
                variant: { id: 11, seller: { id: 9, title: 'س' } },
                price: { selling_price: 100 },
              },
            ],
          },
          {
            cart_items: [
              {
                quantity: 1,
                product: { id: 2, title_fa: 'ب', url: { uri: '/product/dkp-2/?variant_id=22' } },
                variant: { id: 22, seller: { id: 9, title: 'س' } },
                price: { selling_price: 200 },
              },
            ],
          },
        ],
      },
    });
    expect(views.map((v) => v.productId)).toEqual(['1', '2']);
  });
});
