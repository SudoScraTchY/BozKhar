/**
 * Order payload readers: shape tolerance and the privacy allowlist.
 * The fixtures mirror the live payloads captured 2026-10-17, including
 * the fields the readers must never carry forward.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { jalaliToDayIndex, parseJalaliDate } from '../src/insights/jalali';
import { readDetailPayload, readListPayload, readTabsPayload } from '../src/insights/readers';

const DIR = join(__dirname, 'fixtures', 'insights');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(DIR, name), 'utf-8')) as unknown;

const SENSITIVE_MARKERS = [
  'SENSITIVE-ADDRESS',
  'SENSITIVE-PAYMENT',
  'SENSITIVE-METHOD',
  'SENSITIVE-INVOICE',
  'SENSITIVE-IMAGE',
];

describe('readTabsPayload', () => {
  it('reads the four status counts', () => {
    expect(readTabsPayload(fixture('tabs.json'))).toEqual({
      in_progress: 1,
      sent: 3,
      cancelled: 1,
      returned: 1,
    });
  });

  it('treats missing tabs as zero and rejects a payload without tabs', () => {
    expect(readTabsPayload({ data: { tabs: { sent: { count: 2 } } } })).toEqual({
      in_progress: 0,
      sent: 2,
      cancelled: 0,
      returned: 0,
    });
    expect(() => readTabsPayload({ data: {} })).toThrow(/tabs are missing/);
  });
});

describe('readListPayload', () => {
  it('normalizes a page with Jalali dates and price details', () => {
    const page = readListPayload(fixture('list-sent-page-1.json'), 'sent', 1);
    expect(page.page).toBe(1);
    expect(page.totalPages).toBe(2);
    expect(page.totalItems).toBe(3);
    expect(page.orders).toHaveLength(2);

    const [first, second] = page.orders;
    expect(first).toMatchObject({
      orderId: 1001,
      status: 'sent',
      statusFa: 'تحویل شده',
      createdText: '13 آبان 1404',
      createdDay: jalaliToDayIndex(1404, 8, 13),
      payableRial: 2450000,
      paidRial: 2450000,
      refundRial: null,
      shippingRial: 100000,
      discountRial: 150000,
      totalCostRial: 2700000,
      detailFetchedAt: null,
    });
    expect(parseJalaliDate(second!.createdText)?.dayIndex).toBe(second!.createdDay);
  });

  it('never carries address, payment, invoice or image fields', () => {
    const page = readListPayload(fixture('list-sent-page-1.json'), 'sent', 1);
    const serialized = JSON.stringify(page);
    for (const marker of SENSITIVE_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
  });

  it('falls back to the requested page when the pager is absent', () => {
    const page = readListPayload({ data: { orders: [{ id: 7, payable_price: 1000 }] } }, 'sent', 4);
    expect(page.page).toBe(4);
    expect(page.totalPages).toBe(1);
    expect(page.totalItems).toBe(1);
  });

  it('keeps an undated row and skips rows without a usable id', () => {
    const page = readListPayload(
      {
        data: {
          orders: [{ id: 8, payable_price: 1000 }, { payable_price: 2000 }, { id: 'bad' }],
        },
      },
      'sent',
      1,
    );
    expect(page.orders).toHaveLength(1);
    expect(page.orders[0]?.createdDay).toBeNull();
  });

  it('rejects a payload without an orders array', () => {
    expect(() => readListPayload({ data: {} }, 'sent', 1)).toThrow(/no orders array/);
  });
});

describe('readDetailPayload', () => {
  it('reads items, sellers, prices and shipments', () => {
    const result = readDetailPayload(
      fixture('detail-sent.json'),
      {
        orderId: 1001,
        status: 'sent',
      },
      1_700_000_000_000,
    );

    expect(result.order.orderId).toBe(1001);
    expect(result.order.detailFetchedAt).toBe(1_700_000_000_000);
    expect(result.items).toHaveLength(2);

    const phone = result.items[0]!;
    expect(phone).toMatchObject({
      productId: 111,
      titleFa: 'گوشی موبایل سامسونگ',
      brand: 'سامسونگ',
      categories: ['موبایل', 'گوشی موبایل'],
      sellerId: 501,
      sellerName: 'دیجی‌کالا',
      sellerRating: 4.7,
      quantity: 2,
      returnedQuantity: 0,
      cancelledQuantity: 0,
      unitRial: 1200000,
      rrpRial: 1400000,
      discountPercent: 14,
    });
    // A numeric string rating becomes a number.
    expect(result.items[1]?.sellerRating).toBe(4.2);

    expect(result.shipments).toEqual([
      {
        id: 701,
        costRial: 100000,
        dateText: '15 آبان 1404',
        dateDay: jalaliToDayIndex(1404, 8, 15),
      },
    ]);
  });

  it('reads the live data.order wrapper used by GET /v1/order/{id}/', () => {
    const liveShape = fixture('detail-sent.json') as {
      data: Record<string, unknown>;
    };
    const wrapped = { status: 'ok', data: { order: liveShape.data } };
    const result = readDetailPayload(wrapped, { orderId: 1001, status: 'sent' }, 5);

    expect(result.order.orderId).toBe(1001);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      productId: 111,
      sellerId: 501,
      unitRial: 1200000,
    });
    expect(result.shipments).toHaveLength(1);
  });

  it('drops every sensitive field from the detail fixture', () => {
    const result = readDetailPayload(
      fixture('detail-sent.json'),
      { orderId: 1001, status: 'sent' },
      1,
    );
    const serialized = JSON.stringify(result);
    for (const marker of SENSITIVE_MARKERS) {
      expect(serialized).not.toContain(marker);
    }
  });

  it('keeps returned quantities and the refund amount', () => {
    const result = readDetailPayload(
      fixture('detail-returned.json'),
      { orderId: 2001, status: 'returned' },
      1,
    );
    expect(result.order.refundRial).toBe(200000);
    expect(result.items[0]).toMatchObject({ returnedQuantity: 1, quantity: 1 });
  });

  it('carries an existing order forward when the detail omits header fields', () => {
    const existing = {
      orderId: 1001,
      status: 'sent' as const,
      statusFa: 'تحویل شده',
      createdText: '13 آبان 1404',
      createdDay: jalaliToDayIndex(1404, 8, 13),
      payableRial: 2450000,
      paidRial: 2450000,
      refundRial: null,
      shippingRial: 100000,
      discountRial: 150000,
      totalCostRial: 2700000,
      detailFetchedAt: null,
    };
    const result = readDetailPayload(
      { data: { order_items: [] } },
      { orderId: 1001, status: 'sent', existing },
      99,
    );
    expect(result.order.createdDay).toBe(existing.createdDay);
    expect(result.order.detailFetchedAt).toBe(99);
  });

  it('keeps a cancelled order cancelled when the detail payload disagrees', () => {
    const result = readDetailPayload(
      {
        data: {
          id: 7,
          status: 'sent',
          status_fa: 'تحویل شده',
          order_items: [],
          shipments: [],
        },
      },
      { orderId: 7, status: 'cancelled' },
      1,
    );
    expect(result.order.status).toBe('cancelled');
    expect(result.order.statusFa).toBe('');
  });

  it('rejects a detail without an items array', () => {
    expect(() => readDetailPayload({ data: { id: 1 } }, { orderId: 1, status: 'sent' }, 1)).toThrow(
      /no order_items array/,
    );
  });
});
