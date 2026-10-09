/**
 * Shipment-quote reader tests (D-19): the
 * /v4/shipment/ response normalizes into the
 * stored record; malformed input never throws
 * and never produces a half-empty record.
 */
import { describe, expect, it } from 'vitest';
import { readShipmentRecord } from '../src/capture/readers/shipment';

const LIVE_SHAPE = {
  status: 200,
  data: {
    shipment_types: {
      normal: [
        {
          shipment_id: 'b8d1bf_1_23',
          package_price: 5700000,
          submit_types: [
            {
              id: 16,
              name: 'ارسال فروشنده',
              shipping_cost: 1200000,
              cost: 1200000,
            },
          ],
          cart_items: [
            {
              id: 259702067,
              quantity: 1,
              variant: { id: 52584941 },
              product: { id: 3537380 },
            },
          ],
        },
        {
          shipment_id: 'acb206_2_23',
          package_price: 13819000,
          submit_types: [
            {
              id: 16,
              name: 'ارسال فروشنده',
              shipping_cost: 1100000,
              cost: 1100000,
            },
          ],
          cart_items: [
            {
              id: 276422806,
              quantity: 1,
              variant: { id: 82074892 },
              product: { id: 16622211 },
            },
            {
              id: 276423406,
              quantity: 1,
              variant: { id: 53078909 },
              product: { id: 8881997 },
            },
          ],
        },
      ],
    },
    default_shipment: 'normal',
  },
};

describe('readShipmentRecord (D-19)', () => {
  it('normalizes the live response shape into packages', () => {
    const record = readShipmentRecord(LIVE_SHAPE, '2026-10-09T12:00:00Z');
    expect(record).not.toBeNull();
    expect(record?.key).toBe('latest');
    expect(record?.capturedAt).toBe('2026-10-09T12:00:00Z');
    expect(record?.packages).toHaveLength(2);
    expect(record?.packages[0]).toEqual({
      shipmentId: 'b8d1bf_1_23',
      shippingCost: 120000,
      items: [{ productId: '3537380', variantId: '52584941' }],
    });
    // The two-item package carries BOTH items -
    // they share one vendor and one fee.
    expect(record?.packages[1]?.items).toEqual([
      { productId: '16622211', variantId: '82074892' },
      { productId: '8881997', variantId: '53078909' },
    ]);
    expect(record?.packages[1]?.shippingCost).toBe(110000);
  });

  it('returns null for a response without quotable packages', () => {
    expect(readShipmentRecord({}, 't')).toBeNull();
    expect(readShipmentRecord(null, 't')).toBeNull();
    expect(readShipmentRecord({ data: {} }, 't')).toBeNull();
    expect(readShipmentRecord({ data: { shipment_types: {} } }, 't')).toBeNull();
  });

  it('skips packages with no fee or no items, and keeps the rest', () => {
    const record = readShipmentRecord(
      {
        data: {
          shipment_types: {
            normal: [
              // no submit_types: no fee -> skipped
              { shipment_id: 'x', cart_items: [{ variant: { id: 'v' } }] },
              // no cart_items: skipped
              {
                shipment_id: 'y',
                submit_types: [{ shipping_cost: 1000 }],
              },
              // valid
              {
                shipment_id: 'z',
                submit_types: [{ shipping_cost: 2000 }],
                cart_items: [{ variant: { id: 'v2' }, product: { id: 'p2' } }],
              },
            ],
          },
        },
      },
      't',
    );
    expect(record?.packages).toHaveLength(1);
    expect(record?.packages[0]?.shipmentId).toBe('z');
    expect(record?.packages[0]?.shippingCost).toBe(200);
  });

  it('ignores non-numeric fees and malformed item entries', () => {
    const record = readShipmentRecord(
      {
        data: {
          shipment_types: {
            normal: [
              {
                shipment_id: 'bad',
                submit_types: [{ shipping_cost: 'free' }],
                cart_items: [
                  { variant: { id: 'v' }, product: { id: 'p' } },
                  { variant: {}, product: { id: 'p' } },
                  { variant: { id: 'v' }, product: {} },
                ],
              },
            ],
          },
        },
      },
      't',
    );
    // Fee not a number -> the package is not quotable.
    expect(record).toBeNull();
  });
});
