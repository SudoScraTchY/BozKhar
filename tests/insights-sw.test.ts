/**
 * Insights worker: request validation, the direct → delegated → bare
 * transport ladder, and the error codes the page switches on.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { httpStatusError, networkError } from '../src/capture/errors';
import type { InsightsResponse } from '../src/insights/api';
import { isInsightsRequest } from '../src/insights/api';
import { handleInsightsRequest, type InsightsDeps } from '../src/insights/sw';

const DIR = join(__dirname, 'fixtures', 'insights');
const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(DIR, name), 'utf-8')) as unknown;

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

function deps(overrides: Partial<InsightsDeps> = {}): InsightsDeps {
  return {
    fetch: async () => response(200, {}),
    delegate: async () => {
      throw new Error('delegate not expected');
    },
    delegateBare: async () => {
      throw new Error('bare delegate not expected');
    },
    findTab: async () => undefined,
    now: () => 1_700_000_000_000,
    ...overrides,
  };
}

const okAuth = {
  ok: false,
  errorCode: 'AUTH',
  message: expect.any(String),
  status: 403,
} satisfies Partial<InsightsResponse>;

describe('handleInsightsRequest', () => {
  it('reads tabs directly and audits the fetch contract', async () => {
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const res = await handleInsightsRequest(
      deps({
        fetch: async (url, init) => {
          seen.push({ url, init });
          return response(200, fixture('tabs.json'));
        },
      }),
      { kind: 'insights/tabs' },
    );

    expect(res).toEqual({
      ok: true,
      kind: 'insights/tabs',
      data: { in_progress: 1, sent: 3, cancelled: 1, returned: 1 },
      transport: 'direct',
    });
    expect(seen[0]?.url).toContain('/v1/profile/orders/tabs/');
    expect(seen[0]?.init?.method).toBe('GET');
    expect(seen[0]?.init?.credentials).toBe('include');
  });

  it('falls back to the tab main world after a 401', async () => {
    const delegate = vi.fn(async () => fixture('list-sent-page-1.json'));
    const res = await handleInsightsRequest(
      deps({
        fetch: async () => response(401, {}),
        delegate,
        findTab: async () => 7,
      }),
      { kind: 'insights/list', status: 'sent', page: 1 },
    );

    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'insights/list') {
      expect(res.transport).toBe('delegated');
      expect(res.data.orders).toHaveLength(2);
      expect(res.data.totalPages).toBe(2);
    }
    expect(delegate).toHaveBeenCalledTimes(1);
  });

  it('retries bare only when the delegated attempt failed at the network layer', async () => {
    const bare = vi.fn(async () => fixture('list-sent-page-1.json'));
    const res = await handleInsightsRequest(
      deps({
        fetch: async () => response(401, {}),
        delegate: async () => {
          throw networkError('preflight rejected the routing headers');
        },
        delegateBare: bare,
        findTab: async () => 7,
      }),
      { kind: 'insights/list', status: 'sent', page: 1 },
    );

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.transport).toBe('delegated-bare');
    expect(bare).toHaveBeenCalledTimes(1);
  });

  it('does not retry bare after a server answer', async () => {
    const bare = vi.fn(async () => fixture('list-sent-page-1.json'));
    const res = await handleInsightsRequest(
      deps({
        fetch: async () => response(401, {}),
        delegate: async () => {
          throw httpStatusError(403, 'orders');
        },
        delegateBare: bare,
        findTab: async () => 7,
      }),
      { kind: 'insights/list', status: 'sent', page: 1 },
    );

    expect(res).toMatchObject(okAuth);
    expect(bare).not.toHaveBeenCalled();
  });

  it('returns NO_TAB when direct fails and no digikala tab is open', async () => {
    const res = await handleInsightsRequest(
      deps({
        fetch: async () => {
          throw new Error('network down');
        },
        findTab: async () => undefined,
      }),
      { kind: 'insights/tabs' },
    );
    expect(res).toEqual({
      ok: false,
      errorCode: 'NO_TAB',
      message: expect.any(String),
    });
  });

  it('honors a preferred transport without touching the direct fetch', async () => {
    const fetchSpy = vi.fn(async () => response(200, fixture('tabs.json')));
    const res = await handleInsightsRequest(
      deps({
        fetch: fetchSpy,
        delegate: async () => fixture('tabs.json'),
        findTab: async () => 3,
      }),
      { kind: 'insights/tabs', prefer: 'delegated' },
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.transport).toBe('delegated');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('maps malformed payloads to STRUCTURE_UNRECOGNIZED', async () => {
    const res = await handleInsightsRequest(
      deps({ fetch: async () => response(200, { data: {} }) }),
      { kind: 'insights/list', status: 'sent', page: 1 },
    );
    expect(res).toMatchObject({ ok: false, errorCode: 'STRUCTURE_UNRECOGNIZED' });
  });

  it('maps a direct server failure to HTTP_STATUS with its code', async () => {
    const res = await handleInsightsRequest(
      deps({
        fetch: async () => response(500, {}),
        delegate: async () => {
          throw httpStatusError(500, 'orders');
        },
        findTab: async () => 7,
      }),
      { kind: 'insights/tabs' },
    );
    expect(res).toMatchObject({ ok: false, errorCode: 'HTTP_STATUS', status: 500 });
  });

  it('rejects bad list and detail arguments before any request', async () => {
    const fetchSpy = vi.fn(async () => response(200, {}));
    const d = deps({ fetch: fetchSpy });

    expect(
      await handleInsightsRequest(d, { kind: 'insights/list', status: 'nope', page: 1 }),
    ).toMatchObject({ ok: false, errorCode: 'BAD_REQUEST' });
    expect(
      await handleInsightsRequest(d, { kind: 'insights/list', status: 'sent', page: 0 }),
    ).toMatchObject({ ok: false, errorCode: 'BAD_REQUEST' });
    expect(await handleInsightsRequest(d, { kind: 'insights/detail', orderId: 0 })).toMatchObject({
      ok: false,
      errorCode: 'BAD_REQUEST',
    });
    expect(await handleInsightsRequest(d, { kind: 'insights/detail', orderId: 1.5 })).toMatchObject(
      { ok: false, errorCode: 'BAD_REQUEST' },
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('normalizes a returned order detail with its status fallback', async () => {
    const res = await handleInsightsRequest(
      deps({ fetch: async () => response(200, fixture('detail-returned.json')) }),
      { kind: 'insights/detail', orderId: 2001, status: 'returned' },
    );
    expect(res.ok).toBe(true);
    if (res.ok && res.kind === 'insights/detail') {
      expect(res.data.order.status).toBe('returned');
      expect(res.data.order.refundRial).toBe(200000);
      expect(res.data.items[0]?.returnedQuantity).toBe(1);
      expect(res.data.order.detailFetchedAt).toBe(1_700_000_000_000);
    }
  });
});

describe('isInsightsRequest', () => {
  it('recognizes only the three insight kinds', () => {
    expect(isInsightsRequest({ kind: 'insights/tabs' })).toBe(true);
    expect(isInsightsRequest({ kind: 'insights/list', status: 'sent', page: 1 })).toBe(true);
    expect(isInsightsRequest({ kind: 'insights/detail', orderId: 1 })).toBe(true);
    expect(isInsightsRequest({ kind: 'capture/pdp' })).toBe(false);
    expect(isInsightsRequest(null)).toBe(false);
  });
});
