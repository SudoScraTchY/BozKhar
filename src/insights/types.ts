/**
 * Normalized order-insights entities (feature 2).
 *
 * The service worker maps the undocumented order APIs onto exactly these
 * shapes and drops everything else (address, payments, invoice links,
 * images). Money stays in Rial here so aggregates can sum before the one
 * Rial→Toman conversion at display time.
 */

export type OrderStatus = 'in_progress' | 'sent' | 'cancelled' | 'returned';

export const ORDER_STATUSES: readonly OrderStatus[] = [
  'in_progress',
  'sent',
  'cancelled',
  'returned',
];

export type InsightTabs = Record<OrderStatus, number>;

export interface InsightOrder {
  orderId: number;
  status: OrderStatus;
  statusFa: string;
  /** The original Jalali text, kept for display when it cannot be parsed. */
  createdText: string;
  /** UTC day index (Julian day number); null when the text is unparseable. */
  createdDay: number | null;
  payableRial: number;
  paidRial: number | null;
  refundRial: number | null;
  shippingRial: number | null;
  discountRial: number | null;
  totalCostRial: number | null;
  detailFetchedAt: number | null;
}

export interface InsightItem {
  productId: number;
  titleFa: string;
  brand: string | null;
  /** [category, item_category2..5], empty strings dropped. */
  categories: string[];
  sellerId: number | null;
  sellerName: string | null;
  sellerRating: number | null;
  quantity: number;
  returnedQuantity: number;
  cancelledQuantity: number;
  unitRial: number | null;
  rrpRial: number | null;
  discountPercent: number | null;
}

export interface InsightShipment {
  id: number;
  costRial: number | null;
  dateText: string | null;
  dateDay: number | null;
}

/** One orderCache row: the normalized header plus its optional detail. */
export interface OrderCacheRecord {
  orderId: number;
  order: InsightOrder;
  items: InsightItem[];
  shipments: InsightShipment[];
  /** When the list row was last read (drives the status TTL). */
  listFetchedAt: number;
}

/** The one insightMeta row: what the last sync saw. */
export interface InsightMetaRecord {
  key: 'sync';
  tabs: InsightTabs;
  syncedAt: number;
}

/** Everything the page renders, assembled from the local cache. */
export interface InsightSnapshot {
  orders: InsightOrder[];
  itemsByOrder: Record<number, InsightItem[]>;
  shipmentsByOrder: Record<number, InsightShipment[]>;
  syncedAt: number;
  tabs: InsightTabs;
}

export function emptySnapshot(): InsightSnapshot {
  return {
    orders: [],
    itemsByOrder: {},
    shipmentsByOrder: {},
    syncedAt: 0,
    tabs: { in_progress: 0, sent: 0, cancelled: 0, returned: 0 },
  };
}
