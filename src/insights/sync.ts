/**
 * On-demand history sync (D-39).
 *
 * The user asks once; this walks the four status tabs page by page and
 * writes each page to the cache as it arrives, so an abort or a failure
 * never throws away what was already read. Deep analysis is a separate,
 * opt-in pass: one detail call per order, sequential because the
 * delegated transport shares a single page DOM channel, capped and
 * cancellable.
 */
import type { DbFactory } from '../shared/storage/db';
import {
  pruneOrderCache,
  saveMeta as saveMetaRecord,
  saveOrderDetail,
  saveOrdersFromList,
} from './cache';
import { MAX_PAGES_PER_STATUS } from './api';
import type { InsightsErrorCode, InsightsFailure } from './api';
import type { InsightsClient } from './client';
import type { InsightItem, InsightOrder, InsightShipment, InsightTabs, OrderStatus } from './types';

/** Statuses in the order a summary wants them: paid history first. */
const SYNC_ORDER: readonly OrderStatus[] = ['sent', 'returned', 'in_progress', 'cancelled'];

export interface SyncProgress {
  phase: 'tabs' | 'list' | 'detail';
  done: number;
  total: number;
  status?: OrderStatus;
  page?: number;
  orderId?: number;
}

export interface SyncError {
  errorCode: InsightsErrorCode;
  message: string;
  status?: number;
}

export interface SyncResult {
  ok: boolean;
  tabs: InsightTabs;
  orders: InsightOrder[];
  fetched: number;
  failed: number;
  aborted: boolean;
  truncated: boolean;
  error?: SyncError;
}

export interface DeepResult {
  fetched: number;
  failed: number;
  aborted: boolean;
  error?: SyncError;
}

export interface SyncCacheWriter {
  saveOrders(orders: readonly InsightOrder[], now: number): Promise<void>;
  saveDetail(
    order: InsightOrder,
    items: InsightItem[],
    shipments: InsightShipment[],
    now: number,
  ): Promise<void>;
  saveMeta(tabs: InsightTabs, syncedAt: number): Promise<void>;
  prune(): Promise<number>;
}

export function createSyncCache(factory: DbFactory): SyncCacheWriter {
  return {
    saveOrders: (orders, now) => saveOrdersFromList(factory, orders, now),
    saveDetail: (order, items, shipments, now) =>
      saveOrderDetail(factory, order, items, shipments, now),
    saveMeta: (tabs, syncedAt) => saveMetaRecord(factory, tabs, syncedAt),
    prune: () => pruneOrderCache(factory),
  };
}

export interface SyncOptions {
  pageDelayMs?: number;
  maxPages?: number;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
  isAborted?: () => boolean;
  onProgress?: (progress: SyncProgress) => void;
}

const EMPTY_TABS: InsightTabs = { in_progress: 0, sent: 0, cancelled: 0, returned: 0 };

function errorOf(res: InsightsFailure): SyncError {
  return {
    errorCode: res.errorCode,
    message: res.message,
    ...(res.status !== undefined ? { status: res.status } : {}),
  };
}

function countOf(tabs: InsightTabs): number {
  return tabs.in_progress + tabs.sent + tabs.cancelled + tabs.returned;
}

/** Best effort: a cache failure must not discard a page already read. */
async function attempt(fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (error) {
    console.error(
      `[dkopt] insights cache write failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

export async function syncOrders(
  client: Pick<InsightsClient, 'tabs' | 'list'>,
  cache: SyncCacheWriter,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const pageDelayMs = options.pageDelayMs ?? 450;
  const maxPages = Math.min(options.maxPages ?? MAX_PAGES_PER_STATUS, MAX_PAGES_PER_STATUS);
  const now = options.now ?? Date.now;
  const delay = options.delay ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const aborted = options.isAborted ?? (() => false);

  const tabsRes = await client.tabs();
  if (!tabsRes.ok) {
    return {
      ok: false,
      tabs: { ...EMPTY_TABS },
      orders: [],
      fetched: 0,
      failed: 0,
      aborted: false,
      truncated: false,
      error: errorOf(tabsRes),
    };
  }

  const tabs = tabsRes.data;
  const total = countOf(tabs);
  const orders: InsightOrder[] = [];
  let fetched = 0;
  let failed = 0;
  let abortedFlag = false;
  let truncated = false;
  let error: SyncError | undefined;

  options.onProgress?.({ phase: 'tabs', done: 0, total });

  outer: for (const status of SYNC_ORDER) {
    if (tabs[status] === 0) continue;
    for (let page = 1; ; page += 1) {
      if (aborted()) {
        abortedFlag = true;
        break outer;
      }
      if (page > maxPages) {
        truncated = true;
        break;
      }

      const res = await client.list(status, page);
      if (!res.ok) {
        failed += 1;
        error = errorOf(res);
        break; // this status stops here; the next one still runs
      }

      const data = res.data;
      orders.push(...data.orders);
      fetched += data.orders.length;
      await attempt(() => cache.saveOrders(data.orders, now()));

      options.onProgress?.({
        phase: 'list',
        done: Math.min(fetched, total),
        total,
        status,
        page,
      });

      if (page >= data.totalPages) break;
      await delay(pageDelayMs);
    }
  }

  const syncedAt = now();
  await attempt(() => cache.saveMeta(tabs, syncedAt));
  await attempt(() => cache.prune());

  return {
    ok: !abortedFlag && failed === 0 && !truncated,
    tabs,
    orders,
    fetched,
    failed,
    aborted: abortedFlag,
    truncated,
    ...(error ? { error } : {}),
  };
}

export interface DeepOptions {
  maxOrders?: number;
  delayMs?: number;
  now?: () => number;
  delay?: (ms: number) => Promise<void>;
  isAborted?: () => boolean;
  onProgress?: (progress: SyncProgress) => void;
}

export const MAX_DEEP_ORDERS = 300;

/**
 * Fetches details for the given orders, sequentially and cancellable.
 * One failure never stops the run; an AUTH failure does, because every
 * later request would fail the same way.
 */
export async function deepAnalyze(
  client: Pick<InsightsClient, 'detail'>,
  cache: Pick<SyncCacheWriter, 'saveDetail'>,
  orders: readonly InsightOrder[],
  options: DeepOptions = {},
): Promise<DeepResult> {
  const max = Math.min(options.maxOrders ?? MAX_DEEP_ORDERS, MAX_DEEP_ORDERS);
  const delayMs = options.delayMs ?? 400;
  const now = options.now ?? Date.now;
  const delay = options.delay ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const aborted = options.isAborted ?? (() => false);
  const targets = orders.slice(0, max);

  let fetched = 0;
  let failed = 0;
  let abortedFlag = false;
  let error: SyncError | undefined;

  for (let i = 0; i < targets.length; i += 1) {
    if (aborted()) {
      abortedFlag = true;
      break;
    }
    const order = targets[i] as InsightOrder;
    const res = await client.detail(order.orderId, order.status);
    if (res.ok) {
      fetched += 1;
      await attempt(() =>
        cache.saveDetail(res.data.order, res.data.items, res.data.shipments, now()),
      );
    } else {
      failed += 1;
      error = errorOf(res);
      if (res.errorCode === 'AUTH') break;
    }
    options.onProgress?.({
      phase: 'detail',
      done: i + 1,
      total: targets.length,
      orderId: order.orderId,
    });
    if (i < targets.length - 1) await delay(delayMs);
  }

  return {
    fetched,
    failed,
    aborted: abortedFlag,
    ...(error ? { error } : {}),
  };
}
