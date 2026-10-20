import { describe, expect, it } from 'vitest';
import { aggregate } from '../src/insights/aggregate';
import { jalaliToDayIndex } from '../src/insights/jalali';
import { pickPersona } from '../src/insights/persona';
import { emptySnapshot } from '../src/insights/types';
import type {
  InsightItem,
  InsightOrder,
  InsightShipment,
  InsightSnapshot,
} from '../src/insights/types';

const day = (y: number, m: number, d: number): number => jalaliToDayIndex(y, m, d);

function order(id: number, extra: Partial<InsightOrder> = {}): InsightOrder {
  return {
    orderId: id,
    status: 'sent',
    statusFa: '',
    createdText: '',
    createdDay: day(1404, 1, 1),
    payableRial: 1_000,
    paidRial: 1_000,
    refundRial: null,
    shippingRial: 0,
    discountRial: 0,
    totalCostRial: 1_000,
    detailFetchedAt: null,
    ...extra,
  };
}

function item(extra: Partial<InsightItem> = {}): InsightItem {
  return {
    productId: 1,
    titleFa: '',
    brand: null,
    categories: [],
    sellerId: null,
    sellerName: null,
    sellerRating: null,
    quantity: 1,
    returnedQuantity: 0,
    cancelledQuantity: 0,
    unitRial: 1_000,
    rrpRial: null,
    discountPercent: null,
    ...extra,
  };
}

function snapshot(
  orders: InsightOrder[],
  items: Record<number, InsightItem[]> = {},
  shipments: Record<number, InsightShipment[]> = {},
): InsightSnapshot {
  return { ...emptySnapshot(), orders, itemsByOrder: items, shipmentsByOrder: shipments };
}

describe('date range', () => {
  const orders = [
    order(1, { createdDay: day(1404, 1, 10) }),
    order(2, { createdDay: day(1404, 1, 20) }),
    order(3, { createdDay: day(1404, 1, 30) }),
    order(4, { createdDay: null, createdText: 'unknown' }),
  ];

  it('includes both boundaries', () => {
    const agg = aggregate(snapshot(orders), {
      startDay: day(1404, 1, 20),
      endDay: day(1404, 1, 30),
    });
    expect(agg.orders.map((o) => o.orderId).sort()).toEqual([2, 3]);
  });

  it('keeps undated rows only when the range is unbounded', () => {
    const all = aggregate(snapshot(orders));
    expect(all.orders).toHaveLength(4);
    expect(all.undatedOrders).toBe(1);
    expect(all.dateCoverage).toBe(0.75);

    const bounded = aggregate(snapshot(orders), { startDay: day(1404, 1, 1) });
    expect(bounded.orders).toHaveLength(3);
    expect(bounded.undatedOrders).toBe(0);
  });

  it('returns nothing when the range is inverted', () => {
    const agg = aggregate(snapshot(orders), {
      startDay: day(1404, 2, 1),
      endDay: day(1404, 1, 1),
    });
    expect(agg.orders).toEqual([]);
  });
});

describe('spend semantics', () => {
  const orders = [
    order(1, {
      paidRial: 1_000,
      refundRial: 100,
      shippingRial: 50,
      discountRial: 20,
      totalCostRial: 1_200,
    }),
    order(2, { status: 'returned', paidRial: 500, refundRial: 200, totalCostRial: null }),
    order(3, { status: 'returned', paidRial: 400, refundRial: null, totalCostRial: null }),
    order(4, { status: 'cancelled', paidRial: 700 }),
    order(5, { status: 'in_progress', paidRial: 800 }),
  ];

  it('nets refunds, keeps unknown returns, and separates statuses', () => {
    const agg = aggregate(snapshot(orders));
    expect(agg.paidOrders).toBe(3);
    expect(agg.fulfilledOrders).toBe(3);
    expect(agg.sentOrders).toBe(1);
    expect(agg.returnedOrders).toBe(2);
    expect(agg.cancelledOrders).toBe(1);
    expect(agg.inProgressOrders).toBe(1);
    // Rial: 900 + 300 + 400 = 1600 -> 160 Toman.
    expect(agg.netPaidToman).toBe(160);
    expect(agg.refundsToman).toBe(30);
    expect(agg.unknownRefundOrders).toBe(1);
    expect(agg.inProgressToman).toBe(80);
    expect(agg.cancelledToman).toBe(70);
    expect(agg.averageOrderToman).toBe(53);
    expect(agg.medianOrderToman).toBe(40);
    expect(agg.p90OrderToman).toBe(80);
    expect(agg.largestOrderToman).toBe(90);
    expect(agg.averageOrdersPerMonth).toBe(3);
    expect(agg.shippingToman).toBe(5);
    expect(agg.shippingShare).toBeCloseTo(50 / 1_600);
    expect(agg.discountToman).toBe(2);
    expect(agg.discountRate).toBeCloseTo(20 / 1_200);
    expect(agg.refundRate).toBeCloseTo(300 / 1_900);
  });

  it('adds in-progress to spend only on request', () => {
    const agg = aggregate(snapshot(orders), { includeInProgress: true });
    expect(agg.netPaidToman).toBe(240);
    expect(agg.paidOrders).toBe(4);
    expect(agg.averageOrderToman).toBe(60);
  });

  it('filters to one status', () => {
    const agg = aggregate(snapshot(orders), { statusFilter: 'returned' });
    expect(agg.orders).toHaveLength(2);
    expect(agg.fulfilledOrders).toBe(2);
    expect(agg.netPaidToman).toBe(70);
    expect(agg.inProgressOrders).toBe(0);
  });
});

describe('cancelled exclusion', () => {
  it('keeps cancelled orders and cancelled item quantities out of every total', () => {
    const orders = [
      order(201, { paidRial: 1_000_000, createdDay: day(1404, 1, 1) }),
      order(202, { status: 'cancelled', paidRial: 9_000_000, createdDay: day(1404, 1, 2) }),
    ];
    const items: Record<number, InsightItem[]> = {
      201: [
        item({
          quantity: 3,
          cancelledQuantity: 1,
          unitRial: 100_000,
          sellerName: 'A',
          brand: 'X',
          categories: ['C'],
        }),
      ],
      202: [
        item({
          quantity: 2,
          cancelledQuantity: 2,
          unitRial: 500_000,
          sellerName: 'CANCELLED',
          brand: 'CANCELLED',
          categories: ['CANCELLED'],
        }),
      ],
    };

    const agg = aggregate(snapshot(orders, items));
    // Spend: only the sent order; the 9,000,000-rial cancelled order is separate.
    expect(agg.netPaidToman).toBe(100_000);
    expect(agg.paidOrders).toBe(1);
    expect(agg.cancelledOrders).toBe(1);
    expect(agg.cancelledToman).toBe(900_000);
    // Items: 3 - 1 partial cancellation; the fully cancelled order adds none.
    expect(agg.itemCount).toBe(2);
    expect(agg.itemValueToman).toBe(20_000);
    expect(agg.distinctProducts).toBe(1);
    expect(agg.vendors.map((vendor) => vendor.name)).toEqual(['A']);
    expect(agg.vendors[0]?.quantity).toBe(2);
    expect(agg.cancelRate).toBeCloseTo(1 / 3);
    // Time/value charts contain only the contributing order.
    expect(agg.monthly).toEqual([{ year: 1404, month: 1, orders: 1, valueToman: 100_000 }]);
    expect(agg.valueBuckets.reduce((sum, bucket) => sum + bucket.orders, 0)).toBe(1);
    expect(agg.weekdays.reduce((sum, bucket) => sum + bucket.orders, 0)).toBe(1);
  });

  it('values a cancelled order by its total when no payment was recorded', () => {
    const agg = aggregate(
      snapshot([order(1, { status: 'cancelled', paidRial: 0, totalCostRial: 3_000_000 })]),
    );
    expect(agg.netPaidToman).toBe(0);
    expect(agg.cancelledToman).toBe(300_000);
  });
});

describe('deep metrics', () => {
  const orders = [
    order(101, { createdDay: day(1404, 1, 1) }),
    order(102, { createdDay: day(1404, 1, 11) }),
  ];
  const items: Record<number, InsightItem[]> = {
    101: [
      item({
        productId: 1,
        sellerId: 10,
        sellerName: 'A',
        brand: 'X',
        categories: ['C'],
        quantity: 2,
        unitRial: 1_000,
        rrpRial: 1_200,
        sellerRating: 4.5,
      }),
      item({
        productId: 2,
        sellerId: 20,
        sellerName: 'B',
        brand: 'Y',
        quantity: 1,
        unitRial: 500,
      }),
    ],
    102: [
      item({
        productId: 1,
        sellerId: 10,
        sellerName: 'A',
        brand: 'X',
        categories: ['C'],
        quantity: 1,
        unitRial: 1_100,
        rrpRial: 1_200,
        sellerRating: 4.5,
      }),
      item({
        productId: 3,
        sellerId: 20,
        sellerName: 'B',
        brand: 'Z',
        categories: ['D'],
        quantity: 3,
        returnedQuantity: 1,
        unitRial: 300,
      }),
    ],
  };
  const shipments: Record<number, InsightShipment[]> = {
    101: [{ id: 1, costRial: 100, dateText: null, dateDay: null }],
    102: [
      { id: 2, costRial: 200, dateText: null, dateDay: null },
      { id: 3, costRial: 0, dateText: null, dateDay: null },
    ],
  };

  it('aggregates items, sellers, brands, repeats and shipments', () => {
    const agg = aggregate(snapshot(orders, items, shipments));

    expect(agg.hasDeep).toBe(true);
    expect(agg.deepOrders).toBe(2);
    expect(agg.itemCount).toBe(6);
    expect(agg.itemValueToman).toBe(420);
    expect(agg.distinctProducts).toBe(3);
    expect(agg.distinctVendors).toBe(2);
    expect(agg.distinctBrands).toBe(3);
    expect(agg.distinctCategories).toBe(3);

    expect(agg.vendors[0]).toEqual({ name: 'A', valueToman: 310, quantity: 3 });
    expect(agg.topVendor).toBe('A');
    expect(agg.topVendorShare).toBeCloseTo(3_100 / 4_200);
    expect(agg.topBrandShare).toBeCloseTo(3_100 / 4_200);

    expect(agg.repeatProducts).toBe(1);
    expect(agg.repeatOrders).toBe(2);
    expect(agg.repeatRate).toBe(1);
    expect(agg.reorderGapDays).toBe(10);

    expect(agg.returnRate).toBeCloseTo(1 / 7);
    expect(agg.cancelRate).toBe(0);
    expect(agg.itemDiscountRate).toBeCloseTo(500 / 3_600);
    expect(agg.sellerRatingCoverage).toBeCloseTo(2 / 4);
    expect(agg.shipmentCount).toBe(3);
    expect(agg.shipmentCostToman).toBe(30);
  });

  it('reports no deep metrics without details', () => {
    const agg = aggregate(snapshot(orders));
    expect(agg.hasDeep).toBe(false);
    expect(agg.itemCount).toBe(0);
    expect(agg.vendors).toEqual([]);
    expect(agg.repeatRate).toBe(0);
    expect(agg.reorderGapDays).toBeNull();
  });
});

describe('charts data', () => {
  const farvardin = day(1404, 1, 1); // Friday
  const orders = [
    order(1, { createdDay: farvardin, paidRial: 1_000_000 }),
    order(2, { createdDay: farvardin + 1, paidRial: 10_000_000 }),
    order(3, { createdDay: day(1404, 2, 15), paidRial: 25_000_000 }),
    order(4, { createdDay: day(1404, 2, 16), paidRial: 120_000_000 }),
  ];

  it('builds monthly buckets in calendar order', () => {
    const agg = aggregate(snapshot(orders));
    expect(agg.monthly).toEqual([
      { year: 1404, month: 1, orders: 2, valueToman: 1_100_000 },
      { year: 1404, month: 2, orders: 2, valueToman: 14_500_000 },
    ]);
  });

  it('buckets order values and counts weekdays in Persian order', () => {
    const agg = aggregate(snapshot(orders));
    expect(agg.valueBuckets.map((b) => b.orders)).toEqual([1, 0, 1, 1, 0, 1]);
    expect(agg.weekdays.map((b) => b.weekday)).toEqual([6, 0, 1, 2, 3, 4, 5]);

    const friday = agg.weekdays.find((b) => b.weekday === 5);
    const saturday = agg.weekdays.find((b) => b.weekday === 6);
    expect(friday?.orders).toBe(1);
    expect(saturday?.orders).toBe(1);
    expect(agg.weekendShare).toBe(0.25);
  });
});

describe('pickPersona', () => {
  const base = aggregate(emptySnapshot());

  it('puts newcomers first', () => {
    expect(pickPersona({ ...base, fulfilledOrders: 2, repeatRate: 1 })).toBe('newcomer');
    expect(pickPersona({ ...base, fulfilledOrders: 3 })).toBe('regular');
  });

  it('recognizes repeat, vendor and brand loyalty', () => {
    expect(pickPersona({ ...base, fulfilledOrders: 5, hasDeep: true, repeatRate: 0.25 })).toBe(
      'replenisher',
    );
    expect(
      pickPersona({
        ...base,
        fulfilledOrders: 5,
        hasDeep: true,
        repeatRate: 0.1,
        topVendorShare: 0.35,
      }),
    ).toBe('loyalist');
    expect(
      pickPersona({
        ...base,
        fulfilledOrders: 5,
        hasDeep: true,
        topVendorShare: 0.2,
        topBrandShare: 0.3,
      }),
    ).toBe('devotee');
  });

  it('recognizes bargains, bulk and weekends', () => {
    expect(pickPersona({ ...base, fulfilledOrders: 5, discountRate: 0.15 })).toBe('bargain');
    expect(
      pickPersona({ ...base, fulfilledOrders: 5, hasDeep: true, paidOrders: 2, itemCount: 10 }),
    ).toBe('bulk');
    expect(pickPersona({ ...base, fulfilledOrders: 5, averageOrderToman: 5_000_000 })).toBe('bulk');
    expect(pickPersona({ ...base, fulfilledOrders: 5, dateCoverage: 0.8, weekendShare: 0.5 })).toBe(
      'weekend',
    );
  });

  it('skips deep rules when details are absent', () => {
    expect(
      pickPersona({
        ...base,
        fulfilledOrders: 5,
        hasDeep: false,
        repeatRate: 1,
        topVendorShare: 1,
        topBrandShare: 1,
      }),
    ).toBe('regular');
  });
});
