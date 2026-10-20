/**
 * Order-history aggregation.
 *
 * Every sum happens in Rial and crosses to Toman exactly once, at the
 * end - `formatMoney` rounds per call, so adding display values would
 * accumulate error. Deep metrics only appear when detail rows exist;
 * nothing is inferred from a missing detail.
 *
 * Spend semantics (D-39):
 *  - sent: paid − refund
 *  - returned: paid − refund when the refund is known; when it is not,
 *    the paid amount stands and the order is flagged
 *  - in_progress: reported separately, included only on request
 *  - cancelled: counted and valued, never spend; cancelled item quantities
 *    are subtracted from item/vendor totals and cancelled orders never enter
 *    the monthly, weekday or value buckets.
 */
import { rialToToman } from '../capture/normalize';
import { dayOfWeek, dayIndexToJalali } from './jalali';
import type { InsightOrder, InsightSnapshot, OrderStatus } from './types';

export type StatusFilter = OrderStatus | 'all';

export interface AggregateOptions {
  startDay?: number | null;
  endDay?: number | null;
  statusFilter?: StatusFilter;
  includeInProgress?: boolean;
}

export interface NamedValue {
  name: string;
  /** Toman. */
  valueToman: number;
  /** Net units attributed to this name. */
  quantity: number;
}

export interface MonthBucket {
  year: number;
  month: number;
  orders: number;
  valueToman: number;
}

export interface WeekdayBucket {
  /** JS weekday: Sunday 0 … Saturday 6. */
  weekday: number;
  orders: number;
  valueToman: number;
}

export interface ValueBucket {
  minToman: number;
  maxToman: number | null;
  orders: number;
  valueToman: number;
}

export interface Aggregate {
  orders: InsightOrder[];
  paidOrders: number;
  fulfilledOrders: number;
  sentOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  inProgressOrders: number;
  undatedOrders: number;
  dateCoverage: number;
  weekendShare: number;
  netPaidToman: number;
  refundsToman: number;
  inProgressToman: number;
  cancelledToman: number;
  averageOrderToman: number;
  medianOrderToman: number;
  p90OrderToman: number;
  largestOrderToman: number;
  averageOrdersPerMonth: number;
  shippingToman: number;
  shippingShare: number;
  discountToman: number;
  discountRate: number;
  refundRate: number;
  unknownRefundOrders: number;
  hasDeep: boolean;
  deepOrders: number;
  itemCount: number;
  itemValueToman: number;
  distinctProducts: number;
  distinctVendors: number;
  distinctBrands: number;
  distinctCategories: number;
  vendors: NamedValue[];
  brands: NamedValue[];
  categories: NamedValue[];
  topVendor: string | null;
  topVendorShare: number;
  topThreeVendorShare: number;
  topBrand: string | null;
  topBrandShare: number;
  topThreeBrandShare: number;
  repeatProducts: number;
  repeatOrders: number;
  repeatRate: number;
  reorderGapDays: number | null;
  returnRate: number;
  cancelRate: number;
  itemDiscountRate: number;
  sellerRatingCoverage: number;
  shipmentCount: number;
  shipmentCostToman: number;
  monthly: MonthBucket[];
  weekdays: WeekdayBucket[];
  valueBuckets: ValueBucket[];
}

/** Persian week display order: Saturday first, Friday last. */
export const PERSIAN_WEEK_ORDER: readonly number[] = [6, 0, 1, 2, 3, 4, 5];

const VALUE_BOUNDS_TOMAN = [0, 500_000, 1_000_000, 2_000_000, 5_000_000, 10_000_000];

function paidOf(order: InsightOrder): number {
  return order.paidRial ?? order.payableRial;
}

/** What the order actually cost, in Rial. */
function netRialOf(order: InsightOrder): number {
  const paid = paidOf(order);
  switch (order.status) {
    case 'sent':
      return Math.max(0, paid - (order.refundRial ?? 0));
    case 'returned':
      return order.refundRial !== null ? Math.max(0, paid - order.refundRial) : paid;
    case 'in_progress':
      return paid;
    case 'cancelled':
      return 0;
  }
}

/** Linear-interpolated percentile over a pre-sorted ascending array. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const position = (sorted.length - 1) * p;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const weight = position - lower;
  return (sorted[lower] as number) * (1 - weight) + (sorted[upper] as number) * weight;
}

function sumRial(
  orders: readonly InsightOrder[],
  pick: (order: InsightOrder) => number | null,
): number {
  let total = 0;
  for (const order of orders) total += pick(order) ?? 0;
  return total;
}

interface Group {
  name: string;
  valueRial: number;
  quantity: number;
}

function addGroup(
  groups: Map<string, Group>,
  key: string,
  name: string,
  valueRial: number,
  quantity: number,
): void {
  const current = groups.get(key);
  if (current) {
    current.valueRial += valueRial;
    current.quantity += quantity;
  } else {
    groups.set(key, { name, valueRial, quantity });
  }
}

function groupsToNamed(groups: Map<string, Group>): NamedValue[] {
  return [...groups.values()]
    .map((group) => ({
      name: group.name,
      valueToman: rialToToman(group.valueRial),
      quantity: group.quantity,
    }))
    .sort((a, b) => b.valueToman - a.valueToman || a.name.localeCompare(b.name));
}

function inRange(order: InsightOrder, start: number | null, end: number | null): boolean {
  if (order.createdDay === null) return start === null && end === null;
  if (start !== null && order.createdDay < start) return false;
  if (end !== null && order.createdDay > end) return false;
  return true;
}

export function aggregate(snapshot: InsightSnapshot, options: AggregateOptions = {}): Aggregate {
  const start = options.startDay ?? null;
  const end = options.endDay ?? null;
  const filter = options.statusFilter ?? 'all';
  const includeInProgress = options.includeInProgress ?? false;

  const allInRange = snapshot.orders.filter((order) => inRange(order, start, end));
  const orders =
    filter === 'all' ? allInRange : allInRange.filter((order) => order.status === filter);

  const contributing = orders.filter((order) => {
    if (order.status === 'sent' || order.status === 'returned') return true;
    if (order.status !== 'in_progress') return false;
    return filter === 'in_progress' || (filter === 'all' && includeInProgress);
  });

  const sent = orders.filter((o) => o.status === 'sent');
  const returned = orders.filter((o) => o.status === 'returned');
  const fulfilled = [...sent, ...returned];
  const cancelled = orders.filter((o) => o.status === 'cancelled');
  const running = orders.filter((o) => o.status === 'in_progress');

  const netRial = contributing.reduce((sum, order) => sum + netRialOf(order), 0);
  const shippingRial = sumRial(contributing, (o) => o.shippingRial);
  const discountRial = sumRial(contributing, (o) => o.discountRial);
  const totalCostRial = sumRial(contributing, (o) => o.totalCostRial);
  const refundsRial = sumRial(fulfilled, (o) => o.refundRial);
  const largestRial = contributing.reduce((max, order) => Math.max(max, netRialOf(order)), 0);
  const unknownRefundOrders = orders.filter(
    (o) => o.status === 'returned' && o.refundRial === null,
  ).length;

  const dateCoverage = orders.length > 0 ? datedIn(orders) : 0;
  const undatedOrders = orders.filter((o) => o.createdDay === null).length;

  const datedContributing = contributing.filter((o) => o.createdDay !== null);
  const weekendOrders = datedContributing.filter((o) => {
    const weekday = dayOfWeek(o.createdDay as number);
    return weekday === 4 || weekday === 5; // Thursday, Friday
  });
  const weekendShare =
    datedContributing.length > 0 ? weekendOrders.length / datedContributing.length : 0;

  // ---- monthly net-paid buckets (sum in Rial, convert once) ----
  const months = new Map<
    string,
    { year: number; month: number; orders: number; valueRial: number }
  >();
  for (const order of contributing) {
    if (order.createdDay === null) continue;
    const { year, month } = dayIndexToJalali(order.createdDay);
    const key = `${year}-${String(month).padStart(2, '0')}`;
    const bucket = months.get(key);
    if (bucket) {
      bucket.orders += 1;
      bucket.valueRial += netRialOf(order);
    } else {
      months.set(key, { year, month, orders: 1, valueRial: netRialOf(order) });
    }
  }
  const monthly: MonthBucket[] = [...months.values()]
    .map((bucket) => ({
      year: bucket.year,
      month: bucket.month,
      orders: bucket.orders,
      valueToman: rialToToman(bucket.valueRial),
    }))
    .sort((a, b) => a.year - b.year || a.month - b.month);

  // ---- order-value histogram ----
  const rawBuckets = VALUE_BOUNDS_TOMAN.map((min, i) => ({
    minToman: min,
    maxToman: VALUE_BOUNDS_TOMAN[i + 1] ?? null,
    orders: 0,
    valueRial: 0,
  }));
  for (const order of contributing) {
    const valueRial = netRialOf(order);
    const valueToman = rialToToman(valueRial);
    let index = 0;
    for (let i = 0; i < rawBuckets.length; i += 1) {
      const bucket = rawBuckets[i] as (typeof rawBuckets)[number];
      if (
        valueToman >= bucket.minToman &&
        (bucket.maxToman === null || valueToman < bucket.maxToman)
      ) {
        index = i;
        break;
      }
    }
    const bucket = rawBuckets[index] as (typeof rawBuckets)[number];
    bucket.orders += 1;
    bucket.valueRial += valueRial;
  }
  const valueBuckets: ValueBucket[] = rawBuckets.map((bucket) => ({
    minToman: bucket.minToman,
    maxToman: bucket.maxToman,
    orders: bucket.orders,
    valueToman: rialToToman(bucket.valueRial),
  }));

  // ---- weekday distribution ----
  const weekdayMap = new Map<number, { weekday: number; orders: number; valueRial: number }>();
  for (const weekday of PERSIAN_WEEK_ORDER) {
    weekdayMap.set(weekday, { weekday, orders: 0, valueRial: 0 });
  }
  for (const order of contributing) {
    if (order.createdDay === null) continue;
    const weekday = dayOfWeek(order.createdDay);
    const bucket = weekdayMap.get(weekday);
    if (!bucket) continue;
    bucket.orders += 1;
    bucket.valueRial += netRialOf(order);
  }
  const weekdays: WeekdayBucket[] = PERSIAN_WEEK_ORDER.map((weekday) => {
    const bucket = weekdayMap.get(weekday) as {
      weekday: number;
      orders: number;
      valueRial: number;
    };
    return {
      weekday: bucket.weekday,
      orders: bucket.orders,
      valueToman: rialToToman(bucket.valueRial),
    };
  });

  // ---- deep metrics ----
  const vendors = new Map<string, Group>();
  const brands = new Map<string, Group>();
  const categories = new Map<string, Group>();
  const productOrders = new Map<number, Set<number>>();
  const productDays = new Map<number, Set<number>>();
  let deepOrders = 0;
  let itemRows = 0;
  let grossQty = 0;
  let returnedQty = 0;
  let cancelledQty = 0;
  let itemCount = 0;
  let itemValueRial = 0;
  let ratedRows = 0;
  let itemDiscountRial = 0;
  let rrpTotalRial = 0;
  let shipmentCount = 0;
  let shipmentCostRial = 0;

  for (const order of contributing) {
    const items = snapshot.itemsByOrder[order.orderId] ?? [];
    if (items.length > 0) deepOrders += 1;

    for (const shipment of snapshot.shipmentsByOrder[order.orderId] ?? []) {
      shipmentCount += 1;
      shipmentCostRial += shipment.costRial ?? 0;
    }

    for (const item of items) {
      itemRows += 1;
      grossQty += item.quantity;
      returnedQty += item.returnedQuantity;
      cancelledQty += item.cancelledQuantity;
      if (item.sellerRating !== null) ratedRows += 1;

      if (item.rrpRial !== null && item.unitRial !== null && item.rrpRial > item.unitRial) {
        itemDiscountRial += (item.rrpRial - item.unitRial) * item.quantity;
        rrpTotalRial += item.rrpRial * item.quantity;
      }

      const quantity = Math.max(0, item.quantity - item.returnedQuantity - item.cancelledQuantity);
      itemCount += quantity;
      if (quantity === 0) continue;

      const valueRial = (item.unitRial ?? 0) * quantity;
      itemValueRial += valueRial;
      addGroup(
        vendors,
        item.sellerId !== null ? `id:${item.sellerId}` : `name:${item.sellerName ?? ''}`,
        item.sellerName ?? (item.sellerId !== null ? `#${item.sellerId}` : ''),
        valueRial,
        quantity,
      );
      addGroup(brands, item.brand ?? '', item.brand ?? '', valueRial, quantity);
      addGroup(categories, item.categories[0] ?? '', item.categories[0] ?? '', valueRial, quantity);

      const set = productOrders.get(item.productId) ?? new Set<number>();
      set.add(order.orderId);
      productOrders.set(item.productId, set);
      if (order.createdDay !== null) {
        const days = productDays.get(item.productId) ?? new Set<number>();
        days.add(order.createdDay);
        productDays.set(item.productId, days);
      }
    }
  }

  const vendorList = groupsToNamed(vendors);
  const brandList = groupsToNamed(brands);
  const categoryList = groupsToNamed(categories);
  const vendorGroups = [...vendors.values()].sort((a, b) => b.valueRial - a.valueRial);
  const brandGroups = [...brands.values()].sort((a, b) => b.valueRial - a.valueRial);
  const topVendorGroup = vendorGroups[0];
  const topBrandGroup = brandGroups[0];
  const topVendor = topVendorGroup?.name || null;
  const topBrand = topBrandGroup?.name || null;
  const topVendorShare =
    itemValueRial > 0 && topVendorGroup ? topVendorGroup.valueRial / itemValueRial : 0;
  const topBrandShare =
    itemValueRial > 0 && topBrandGroup ? topBrandGroup.valueRial / itemValueRial : 0;
  const topThreeVendorShare =
    itemValueRial > 0
      ? vendorGroups.slice(0, 3).reduce((sum, group) => sum + group.valueRial, 0) / itemValueRial
      : 0;
  const topThreeBrandShare =
    itemValueRial > 0
      ? brandGroups.slice(0, 3).reduce((sum, group) => sum + group.valueRial, 0) / itemValueRial
      : 0;

  const repeated = [...productOrders.values()].filter((set) => set.size >= 2);
  const repeatProductIds = [...productOrders.entries()]
    .filter(([, set]) => set.size >= 2)
    .map(([productId]) => productId);
  const repeatOrderIds = new Set<number>();
  for (const set of repeated) for (const id of set) repeatOrderIds.add(id);

  const gaps: number[] = [];
  for (const productId of repeatProductIds) {
    const days = [...(productDays.get(productId) ?? [])];
    if (days.length >= 2) {
      gaps.push(Math.max(...days) - Math.min(...days));
    }
  }

  const orderValues = contributing.map(netRialOf).sort((a, b) => a - b);
  const fulfilledPaidRial = sumRial(fulfilled, paidOf);

  return {
    orders,
    paidOrders: contributing.length,
    fulfilledOrders: fulfilled.length,
    sentOrders: sent.length,
    returnedOrders: returned.length,
    cancelledOrders: cancelled.length,
    inProgressOrders: running.length,
    undatedOrders,
    dateCoverage,
    weekendShare,
    netPaidToman: rialToToman(netRial),
    refundsToman: rialToToman(refundsRial),
    inProgressToman: rialToToman(sumRial(running, paidOf)),
    cancelledToman: rialToToman(sumRial(cancelled, paidOf)),
    averageOrderToman: contributing.length > 0 ? rialToToman(netRial / contributing.length) : 0,
    medianOrderToman: rialToToman(percentile(orderValues, 0.5)),
    p90OrderToman: rialToToman(percentile(orderValues, 0.9)),
    largestOrderToman: rialToToman(largestRial),
    averageOrdersPerMonth: monthly.length > 0 ? contributing.length / monthly.length : 0,
    shippingToman: rialToToman(shippingRial),
    shippingShare: netRial > 0 ? shippingRial / netRial : 0,
    discountToman: rialToToman(discountRial),
    discountRate: totalCostRial > 0 ? discountRial / totalCostRial : 0,
    refundRate: fulfilledPaidRial > 0 ? refundsRial / fulfilledPaidRial : 0,
    unknownRefundOrders,
    hasDeep: deepOrders > 0,
    deepOrders,
    itemCount,
    itemValueToman: rialToToman(itemValueRial),
    distinctProducts: productOrders.size,
    distinctVendors: vendors.size,
    distinctBrands: brands.size,
    distinctCategories: categories.size,
    vendors: vendorList,
    brands: brandList,
    categories: categoryList,
    topVendor,
    topVendorShare,
    topThreeVendorShare,
    topBrand,
    topBrandShare,
    topThreeBrandShare,
    repeatProducts: repeatProductIds.length,
    repeatOrders: repeatOrderIds.size,
    repeatRate: deepOrders > 0 ? repeatOrderIds.size / deepOrders : 0,
    reorderGapDays:
      gaps.length > 0 ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
    returnRate: grossQty > 0 ? returnedQty / grossQty : 0,
    cancelRate: grossQty > 0 ? cancelledQty / grossQty : 0,
    itemDiscountRate: rrpTotalRial > 0 ? itemDiscountRial / rrpTotalRial : 0,
    sellerRatingCoverage: itemRows > 0 ? ratedRows / itemRows : 0,
    shipmentCount,
    shipmentCostToman: rialToToman(shipmentCostRial),
    monthly,
    weekdays,
    valueBuckets,
  };
}

/** Share of dated orders inside the selected set. */
function datedIn(orders: readonly InsightOrder[]): number {
  return orders.filter((order) => order.createdDay !== null).length / orders.length;
}
