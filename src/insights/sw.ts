/**
 * Order-insights service-worker handler.
 *
 * Reads only, on demand. The transport ladder is the one live finding
 * from the spike that matters operationally: the extension-origin fetch
 * is tried first, then the request is replayed in an open Digikala tab's
 * main world (the profile APIs trust the page's origin), and finally the
 * same main-world GET is retried once without the checkout routing
 * headers, which some profile endpoints reject at the CORS preflight.
 *
 * The handler normalizes every response through the readers before it
 * leaves the worker. Raw payloads - and the address, payment, invoice
 * and image fields they carry - never cross the message boundary.
 */
import { CaptureError } from '../capture/errors';
import { digikalaFetchJson, type RawFetch } from '../capture/fetch/digikala-fetch';
import {
  isValidOrderId,
  isValidPage,
  isOrderStatus,
  orderDetailUrl,
  orderListUrl,
  ORDER_TABS_URL,
  type InsightsDetailData,
  type InsightsErrorCode,
  type InsightsListData,
  type InsightsResponse,
  type InsightsTransport,
} from './api';
import { readDetailPayload, readListPayload, readTabsPayload } from './readers';
import type { OrderStatus } from './types';

export interface InsightsDeps {
  fetch: RawFetch;
  delegate: (tabId: number, url: string) => Promise<unknown>;
  delegateBare: (tabId: number, url: string) => Promise<unknown>;
  findTab: () => Promise<number | undefined>;
  now?: () => number;
}

interface TransportSuccess {
  json: unknown;
  transport: InsightsTransport;
}

/** The preferred transport first, then the rest of the ladder. */
function transportOrder(prefer?: InsightsTransport): InsightsTransport[] {
  const base: InsightsTransport[] = ['direct', 'delegated', 'delegated-bare'];
  if (prefer === undefined) return base;
  return [prefer, ...base.filter((t) => t !== prefer)];
}

async function fetchWithLadder(
  deps: InsightsDeps,
  url: string,
  prefer?: InsightsTransport,
): Promise<TransportSuccess> {
  let lastError: unknown = null;
  let tabId: number | undefined;
  let tabChecked = false;
  let tabMissing = false;

  for (const transport of transportOrder(prefer)) {
    if (transport !== 'direct') {
      if (!tabChecked) {
        tabChecked = true;
        try {
          tabId = await deps.findTab();
        } catch {
          tabId = undefined;
        }
      }
      if (tabId === undefined) {
        tabMissing = true;
        continue;
      }
      // The bare retry exists for one failure: the routing headers
      // being rejected at the preflight (a NETWORK failure from the
      // page). A server answer - auth included - would repeat.
      if (
        transport === 'delegated-bare' &&
        lastError !== null &&
        !(lastError instanceof CaptureError && lastError.code === 'NETWORK')
      ) {
        continue;
      }

      try {
        const json =
          transport === 'delegated'
            ? await deps.delegate(tabId, url)
            : await deps.delegateBare(tabId, url);
        return { json, transport };
      } catch (error) {
        lastError = error;
        continue;
      }
    }

    try {
      const json = await digikalaFetchJson(url, { fetch: deps.fetch });
      return { json, transport: 'direct' };
    } catch (error) {
      lastError = error;
    }
  }

  // No tab means the only fallback that could succeed is unavailable;
  // the UI turns this into an explicit "Open Digikala" action.
  if (tabMissing) {
    throw new InsightsFailure('NO_TAB', 'order history needs digikala.com open in a tab');
  }
  throw lastError ?? new InsightsFailure('RUNTIME', 'no transport tried the request');
}

/** Internal signal so the catch below can preserve a chosen error code. */
class InsightsFailure extends Error {
  constructor(
    public readonly errorCode: InsightsErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'InsightsFailure';
  }
}

function failureOf(error: unknown): InsightsResponse {
  if (error instanceof InsightsFailure) {
    return { ok: false, errorCode: error.errorCode, message: error.message };
  }
  if (error instanceof CaptureError) {
    const status = error.status;
    if (error.code === 'HTTP_STATUS' && (status === 401 || status === 403)) {
      return {
        ok: false,
        errorCode: 'AUTH',
        message: error.message,
        ...(status ? { status } : {}),
      };
    }
    switch (error.code) {
      case 'NETWORK':
        return { ok: false, errorCode: 'NETWORK', message: error.message };
      case 'HTTP_STATUS':
        return {
          ok: false,
          errorCode: 'HTTP_STATUS',
          message: error.message,
          ...(status !== undefined ? { status } : {}),
        };
      case 'STRUCTURE_UNRECOGNIZED':
        return { ok: false, errorCode: 'STRUCTURE_UNRECOGNIZED', message: error.message };
      default:
        return { ok: false, errorCode: 'RUNTIME', message: error.message };
    }
  }
  return {
    ok: false,
    errorCode: 'RUNTIME',
    message: error instanceof Error ? error.message : String(error),
  };
}

function badRequest(message: string): InsightsResponse {
  return { ok: false, errorCode: 'BAD_REQUEST', message };
}

export async function handleInsightsRequest(
  deps: InsightsDeps,
  req: unknown,
): Promise<InsightsResponse> {
  const request = req as {
    kind?: unknown;
    status?: unknown;
    page?: unknown;
    orderId?: unknown;
    prefer?: unknown;
  };
  const prefer =
    request.prefer === 'direct' ||
    request.prefer === 'delegated' ||
    request.prefer === 'delegated-bare'
      ? request.prefer
      : undefined;

  try {
    if (request.kind === 'insights/tabs') {
      const { json, transport } = await fetchWithLadder(deps, ORDER_TABS_URL, prefer);
      return { ok: true, kind: 'insights/tabs', data: readTabsPayload(json), transport };
    }

    if (request.kind === 'insights/list') {
      if (!isOrderStatus(request.status)) {
        return badRequest('a valid order status is required');
      }
      if (!isValidPage(request.page)) {
        return badRequest('page must be an integer >= 1');
      }
      const status: OrderStatus = request.status;
      const { json, transport } = await fetchWithLadder(
        deps,
        orderListUrl(status, request.page),
        prefer,
      );
      const data: InsightsListData = readListPayload(json, status, request.page);
      return { ok: true, kind: 'insights/list', data, transport };
    }

    if (request.kind === 'insights/detail') {
      if (!isValidOrderId(request.orderId)) {
        return badRequest('a positive integer order id is required');
      }
      if (request.status !== undefined && !isOrderStatus(request.status)) {
        return badRequest('the order status is invalid');
      }
      const status: OrderStatus = isOrderStatus(request.status) ? request.status : 'sent';
      const { json, transport } = await fetchWithLadder(
        deps,
        orderDetailUrl(request.orderId),
        prefer,
      );
      const data: InsightsDetailData = readDetailPayload(
        json,
        { orderId: request.orderId, status },
        (deps.now ?? Date.now)(),
      );
      return { ok: true, kind: 'insights/detail', data, transport };
    }

    return badRequest('unknown insights request');
  } catch (error) {
    return failureOf(error);
  }
}
