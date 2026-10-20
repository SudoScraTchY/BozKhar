/**
 * Order-insights API contract and URL builders.
 *
 * Endpoints (live-verified against the signed-in site, 2026-10-17):
 *  - GET /v1/profile/orders/tabs/               status counts
 *  - GET /v1/profile/orders/?page=N&status=…   10 rows/page
 *  - GET /v1/order/{id}/                       items, sellers, shipments
 *
 * Every request is a GET with the user's session, on the existing
 * *.digikala.com host permission. Nothing here writes.
 */
import type { OrderStatus, InsightItem, InsightOrder, InsightShipment, InsightTabs } from './types';
import { ORDER_STATUSES } from './types';

export const ORDER_TABS_URL = 'https://api.digikala.com/v1/profile/orders/tabs/';

export function orderListUrl(status: OrderStatus, page: number): string {
  const params = new URLSearchParams({ page: String(page), status });
  return `https://api.digikala.com/v1/profile/orders/?${params.toString()}`;
}

export function orderDetailUrl(orderId: number): string {
  return `https://api.digikala.com/v1/order/${orderId}/`;
}

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === 'string' && (ORDER_STATUSES as readonly string[]).includes(value);
}

/** The first list page size the API serves; used for progress math only. */
export const ORDERS_PAGE_SIZE = 10;

/** A safety bound: no account needs 100 pages of one status to summarize. */
export const MAX_PAGES_PER_STATUS = 100;

// ---------------------------------------------------------------------------
// Service-worker contract

export type InsightsTransport = 'direct' | 'delegated' | 'delegated-bare';

export type InsightsErrorCode =
  | 'AUTH'
  | 'NO_TAB'
  | 'NETWORK'
  | 'HTTP_STATUS'
  | 'BAD_REQUEST'
  | 'STRUCTURE_UNRECOGNIZED'
  | 'RUNTIME';

export type InsightsRequest =
  | { kind: 'insights/tabs'; prefer?: InsightsTransport }
  | { kind: 'insights/list'; status: OrderStatus; page: number; prefer?: InsightsTransport }
  | {
      kind: 'insights/detail';
      orderId: number;
      /** The list row's status, used when the detail omits it. */
      status?: OrderStatus;
      prefer?: InsightsTransport;
    };

export interface InsightsListData {
  orders: InsightOrder[];
  page: number;
  totalPages: number;
  totalItems: number;
}

export interface InsightsDetailData {
  order: InsightOrder;
  items: InsightItem[];
  shipments: InsightShipment[];
}

export type InsightsResponse =
  | { ok: true; kind: 'insights/tabs'; data: InsightTabs; transport: InsightsTransport }
  | { ok: true; kind: 'insights/list'; data: InsightsListData; transport: InsightsTransport }
  | {
      ok: true;
      kind: 'insights/detail';
      data: InsightsDetailData;
      transport: InsightsTransport;
    }
  | { ok: false; errorCode: InsightsErrorCode; message: string; status?: number };

const REQUEST_KINDS = ['insights/tabs', 'insights/list', 'insights/detail'] as const;

export type InsightsFailure = Extract<InsightsResponse, { ok: false }>;
export type InsightsTabsResponse =
  Extract<InsightsResponse, { ok: true; kind: 'insights/tabs' }> | InsightsFailure;
export type InsightsListResponse =
  Extract<InsightsResponse, { ok: true; kind: 'insights/list' }> | InsightsFailure;
export type InsightsDetailResponse =
  Extract<InsightsResponse, { ok: true; kind: 'insights/detail' }> | InsightsFailure;

export function isInsightsRequest(raw: unknown): raw is InsightsRequest {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'kind' in raw &&
    typeof (raw as { kind: unknown }).kind === 'string' &&
    (REQUEST_KINDS as readonly string[]).includes((raw as { kind: string }).kind)
  );
}

export function isValidPage(page: unknown): page is number {
  return typeof page === 'number' && Number.isInteger(page) && page >= 1;
}

export function isValidOrderId(id: unknown): id is number {
  return typeof id === 'number' && Number.isInteger(id) && id > 0;
}

export function isBadRequest(res: InsightsResponse): boolean {
  return !res.ok && res.errorCode === 'BAD_REQUEST';
}
