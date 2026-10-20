/**
 * Page-side client for the insights worker.
 *
 * Owns the things a page should not repeat: a timeout on every message
 * (a cold MV3 worker can lose a callback), bounded retries with backoff
 * for transient failures only, a minimum gap between calls, and the
 * memory of which transport won so later requests start there.
 */
import type {
  InsightsDetailResponse,
  InsightsListResponse,
  InsightsRequest,
  InsightsResponse,
  InsightsTabsResponse,
  InsightsTransport,
} from './api';
import type { OrderStatus } from './types';

export type SendMessage = (
  req: InsightsRequest,
  cb: (res: InsightsResponse | undefined) => void,
) => void;

export interface InsightsClientOptions {
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  minGapMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Seed the preferred transport (tests / resumed session). */
  prefer?: InsightsTransport;
}

export interface InsightsClient {
  tabs(): Promise<InsightsTabsResponse>;
  list(status: OrderStatus, page: number): Promise<InsightsListResponse>;
  detail(orderId: number, status?: OrderStatus): Promise<InsightsDetailResponse>;
  readonly preferredTransport: InsightsTransport | undefined;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 600;
const DEFAULT_MIN_GAP_MS = 350;

function isTransient(res: InsightsResponse): boolean {
  if (res.ok) return false;
  if (res.errorCode === 'NETWORK') return true;
  return res.errorCode === 'HTTP_STATUS' && (res.status === 429 || (res.status ?? 0) >= 500);
}

function isRetryableFailure(res: InsightsResponse): boolean {
  return !res.ok && isTransient(res);
}

function failure(message: string): InsightsResponse {
  return { ok: false, errorCode: 'NETWORK', message };
}

export function createInsightsClient(
  send: SendMessage,
  options: InsightsClientOptions = {},
): InsightsClient {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const retries = options.retries ?? DEFAULT_RETRIES;
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  const minGapMs = options.minGapMs ?? DEFAULT_MIN_GAP_MS;
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  let prefer = options.prefer;
  let lastCallAt = Number.NEGATIVE_INFINITY;

  function once(req: InsightsRequest): Promise<InsightsResponse> {
    return new Promise((resolve) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        resolve(failure('the service worker did not answer in time'));
      }, timeoutMs);
      const finish = (res: InsightsResponse | undefined): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(res ?? failure('the service worker returned no response'));
      };
      try {
        send(req, finish);
      } catch (error) {
        finish(failure(error instanceof Error ? error.message : String(error)));
      }
    });
  }

  async function throttle(): Promise<void> {
    const wait = minGapMs - (now() - lastCallAt);
    if (Number.isFinite(lastCallAt) && wait > 0) await sleep(wait);
    lastCallAt = now();
  }

  async function request(req: InsightsRequest): Promise<InsightsResponse> {
    let last: InsightsResponse = failure('request was not sent');
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      await throttle();
      last = await once({ ...req, ...(prefer ? { prefer } : {}) });
      if (last.ok) {
        prefer = last.transport;
        return last;
      }
      if (!isRetryableFailure(last) || attempt === retries) return last;
      await sleep(retryDelayMs * 2 ** attempt);
    }
    return last;
  }

  return {
    tabs: () => request({ kind: 'insights/tabs' }) as Promise<InsightsTabsResponse>,
    list: (status, page) =>
      request({ kind: 'insights/list', status, page }) as Promise<InsightsListResponse>,
    detail: (orderId, status) =>
      request({
        kind: 'insights/detail',
        orderId,
        ...(status ? { status } : {}),
      }) as Promise<InsightsDetailResponse>,
    get preferredTransport() {
      return prefer;
    },
  };
}
