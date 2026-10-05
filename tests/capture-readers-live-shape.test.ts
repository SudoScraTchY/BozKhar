/**
 * Reader shape tests for the LIVE API object form of `shipment_methods`
 * (smoke finding 2026-10-06): the current api.digikala.com payload sends ONE
 * object {providers: [...]} instead of an array of methods, providers carry
 * `type: 'seller'`, and stock comes as `status: 'marketable'`.
 */
import { describe, expect, it } from 'vitest';
import { readProductPayload } from '../src/capture/readers/product';

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
