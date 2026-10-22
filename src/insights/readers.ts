/**
 * Raw order payload → normalized entities.
 *
 * These payloads are undocumented and vary by status. The readers are
 * deliberately allowlist-only: they construct every entity field by field,
 * so an address, a payment row, an invoice URL or a product image can
 * never travel past the service worker, let alone reach the cache.
 *
 * Missing optional fields stay null; a malformed row is skipped rather
 * than guessed. A payload without its required container throws
 * STRUCTURE_UNRECOGNIZED, which the UI surfaces as "couldn't read".
 */
import { structureUnrecognized } from '../capture/errors';
import { parseJalaliDate } from './jalali';
import type { InsightItem, InsightOrder, InsightShipment, InsightTabs, OrderStatus } from './types';

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec | null {
  return typeof value === 'object' && value !== null ? (value as Rec) : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toInt(value: unknown): number | null {
  const n = toNumber(value);
  return n === null ? null : Math.trunc(n);
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim() !== '') return value.trim();
  }
  return null;
}

function pickNumber(rec: Rec | null, keys: readonly string[]): number | null {
  if (!rec) return null;
  for (const key of keys) {
    const n = toNumber(rec[key]);
    if (n !== null) return n;
  }
  return null;
}

/** The `data` wrapper (or the payload itself when the wrapper is absent). */
function payloadData(raw: unknown): Rec {
  const root = asRecord(raw);
  if (!root) throw structureUnrecognized('the order payload is not an object');
  return asRecord(root.data) ?? root;
}

// ---------------------------------------------------------------------------
// Tabs

export function readTabsPayload(raw: unknown): InsightTabs {
  const data = payloadData(raw);
  const tabs = asRecord(data.tabs);
  if (!tabs) throw structureUnrecognized('tabs are missing from the orders payload');
  const count = (status: OrderStatus): number => {
    const row = asRecord(tabs[status]);
    const n = row ? toInt(row.count) : null;
    return n !== null && n > 0 ? n : 0;
  };
  return {
    in_progress: count('in_progress'),
    sent: count('sent'),
    cancelled: count('cancelled'),
    returned: count('returned'),
  };
}

// ---------------------------------------------------------------------------
// Order rows (list + detail share the header fields)

function readOrderRow(
  row: Rec,
  fallback: { orderId: number; status: OrderStatus; existing?: InsightOrder },
): InsightOrder {
  const id = toInt(row.id) ?? fallback.orderId;
  const price = asRecord(row.price_details) ?? asRecord(row.priceDetails);
  const createdText = pickString(row.created_at, row.createdAt) ?? '';
  const parsed = parseJalaliDate(createdText);
  const status =
    typeof row.status === 'string' && isStatus(row.status) ? row.status : fallback.status;
  const payable = pickNumber(price, ['total_cost', 'totalCost', 'items_total']) ?? 0;
  const paid = pickNumber(price, ['user_paid', 'userPaid']) ?? toNumber(row.payable_price);
  const refund = pickNumber(price, ['user_received', 'userReceived']);
  const existing = fallback.existing;

  return {
    orderId: id,
    status,
    statusFa: pickString(row.status_fa, row.statusFa) ?? existing?.statusFa ?? '',
    createdText,
    createdDay: parsed?.dayIndex ?? existing?.createdDay ?? null,
    payableRial: toNumber(row.payable_price) ?? paid ?? existing?.payableRial ?? payable,
    paidRial: paid ?? existing?.paidRial ?? null,
    refundRial: refund !== null && refund > 0 ? refund : (existing?.refundRial ?? null),
    shippingRial:
      pickNumber(price, ['shipping_cost', 'shippingCost']) ?? existing?.shippingRial ?? null,
    discountRial: pickNumber(price, ['discount']) ?? existing?.discountRial ?? null,
    totalCostRial:
      pickNumber(price, ['total_cost', 'totalCost', 'items_total']) ??
      existing?.totalCostRial ??
      null,
    detailFetchedAt: existing?.detailFetchedAt ?? null,
  };
}

function isStatus(value: string): value is OrderStatus {
  return (
    value === 'in_progress' || value === 'sent' || value === 'cancelled' || value === 'returned'
  );
}

// ---------------------------------------------------------------------------
// List page

export interface ListPageResult {
  orders: InsightOrder[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export function readListPayload(
  raw: unknown,
  status: OrderStatus,
  requestedPage = 1,
): ListPageResult {
  const data = payloadData(raw);
  const rows = asArray(data.orders);
  if (!rows) throw structureUnrecognized('the order list has no orders array');

  const orders: InsightOrder[] = [];
  for (const value of rows) {
    const row = asRecord(value);
    if (!row) continue;
    const id = toInt(row.id);
    if (id === null || id <= 0) continue;
    orders.push(readOrderRow(row, { orderId: id, status }));
  }

  const pager = asRecord(data.pager) ?? asRecord(data.pagination);
  const page = (pager ? toInt(pager.current_page ?? pager.currentPage) : null) ?? requestedPage;
  const totalPages = Math.max(
    1,
    (pager ? toInt(pager.total_pages ?? pager.totalPages) : null) ?? 1,
  );
  const totalItems = (pager ? toInt(pager.total_items ?? pager.totalItems) : null) ?? orders.length;

  return { orders, page, totalPages, totalItems };
}

// ---------------------------------------------------------------------------
// Detail

export interface DetailResult {
  order: InsightOrder;
  items: InsightItem[];
  shipments: InsightShipment[];
}

function readItem(value: unknown): InsightItem | null {
  const rec = asRecord(value);
  if (!rec) return null;

  const product = asRecord(rec.product) ?? asRecord(rec.product_data) ?? asRecord(rec.productData);
  const variant =
    asRecord(rec.variant) ?? asRecord((asArray(rec.variants) ?? [])[0]) ?? asRecord(rec.variants);
  const seller = asRecord(variant?.seller) ?? asRecord(rec.seller);
  const price = asRecord(variant?.price) ?? asRecord(rec.price);
  const dataLayer = asRecord(product?.data_layer) ?? asRecord(product?.dataLayer);

  const productId = toInt(product?.id ?? rec.product_id ?? rec.productId);
  if (productId === null || productId <= 0) return null;

  const quantity = pickNumber(rec, ['quantity', 'count']) ?? pickNumber(variant, ['quantity']) ?? 1;
  const returned =
    pickNumber(rec, ['returned_quantity', 'returned_count', 'returnedQuantity', 'returnedCount']) ??
    0;
  const cancelled =
    pickNumber(rec, [
      'cancelled_quantity',
      'canceled_quantity',
      'cancelled_count',
      'canceled_count',
      'cancelledQuantity',
      'canceledQuantity',
      'cancelledCount',
      'canceledCount',
    ]) ?? 0;

  const categories = [
    dataLayer?.category,
    dataLayer?.item_category2,
    dataLayer?.item_category3,
    dataLayer?.item_category4,
    dataLayer?.item_category5,
  ]
    .map((c) => pickString(c))
    .filter((c): c is string => c !== null);

  return {
    productId,
    titleFa: pickString(product?.title_fa, product?.titleFa, rec.title_fa, rec.title) ?? '',
    brand: pickString(dataLayer?.brand),
    categories,
    sellerId: toInt(seller?.id),
    sellerName: pickString(seller?.title, seller?.name),
    sellerRating: pickNumber(seller, ['rating', 'stars']),
    quantity: Math.max(0, quantity),
    returnedQuantity: Math.max(0, returned),
    cancelledQuantity: Math.max(0, cancelled),
    unitRial: pickNumber(price, ['selling_price', 'sellingPrice', 'price']),
    rrpRial: pickNumber(price, ['rrp_price', 'rrpPrice']),
    discountPercent: pickNumber(price, ['discount_percent', 'discountPercent']),
  };
}

function readShipment(value: unknown, index: number): InsightShipment | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const dateText = pickString(rec.date, rec.start_date, rec.startDate);
  return {
    id: toInt(rec.id) ?? index + 1,
    costRial: pickNumber(rec, ['cost', 'shipping_cost', 'shippingCost', 'price']),
    dateText,
    dateDay: dateText ? (parseJalaliDate(dateText)?.dayIndex ?? null) : null,
  };
}

export function readDetailPayload(
  raw: unknown,
  fallback: { orderId: number; status: OrderStatus; existing?: InsightOrder },
  fetchedAt: number,
): DetailResult {
  const data = payloadData(raw);
  // Live shape (2026-10-19): GET /v1/order/{id}/ wraps the order at
  // data.order; older fixtures and some list-shaped payloads put the
  // fields at data.*. Both normalize to the same entity.
  const detail = asRecord(data.order) ?? data;
  const order = readOrderRow(detail, fallback);

  // The list's status tab is the authority for terminal states. A detail
  // payload with a different vocabulary must never turn a cancelled or
  // returned order into spend (D-45).
  const status =
    fallback.status === 'cancelled' || fallback.status === 'returned'
      ? fallback.status
      : order.status;
  const statusFa = status === order.status ? order.statusFa : '';

  const itemRows = asArray(detail.order_items) ?? asArray(detail.orderItems);
  if (!itemRows) throw structureUnrecognized('the order detail has no order_items array');
  const items: InsightItem[] = [];
  for (const row of itemRows) {
    const item = readItem(row);
    if (item) items.push(item);
  }

  const shipmentRows = asArray(detail.shipments) ?? [];
  const shipments: InsightShipment[] = [];
  shipmentRows.forEach((row, index) => {
    const shipment = readShipment(row, index);
    if (shipment) shipments.push(shipment);
  });

  return {
    order: { ...order, status, statusFa, detailFetchedAt: fetchedAt },
    items,
    shipments,
  };
}
