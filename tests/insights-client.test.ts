import { describe, expect, it, vi } from 'vitest';
import type { InsightsRequest, InsightsResponse } from '../src/insights/api';
import { createInsightsClient, type SendMessage } from '../src/insights/client';

function tabsOk(transport: 'direct' | 'delegated' | 'delegated-bare' = 'direct'): InsightsResponse {
  return {
    ok: true,
    kind: 'insights/tabs',
    data: { in_progress: 0, sent: 0, cancelled: 0, returned: 0 },
    transport,
  };
}

describe('createInsightsClient', () => {
  it('keeps a minimum gap between calls', async () => {
    let clock = 0;
    const starts: number[] = [];
    const send: SendMessage = (_req, cb) => {
      starts.push(clock);
      cb(tabsOk());
    };
    const client = createInsightsClient(send, {
      minGapMs: 100,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });

    await client.tabs();
    await client.tabs();
    await client.tabs();
    expect(starts).toEqual([0, 100, 200]);
  });

  it('retries transient failures with exponential backoff', async () => {
    let attempts = 0;
    const sleeps: number[] = [];
    const send: SendMessage = (_req, cb) => {
      attempts += 1;
      cb(attempts < 3 ? { ok: false, errorCode: 'NETWORK', message: 'down' } : tabsOk());
    };
    const client = createInsightsClient(send, {
      retries: 2,
      retryDelayMs: 50,
      minGapMs: 0,
      now: () => 0,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    });

    await expect(client.tabs()).resolves.toMatchObject({ ok: true });
    expect(attempts).toBe(3);
    expect(sleeps).toEqual([50, 100]);
  });

  it('does not retry an auth failure', async () => {
    const send = vi.fn<SendMessage>((_req, cb) =>
      cb({ ok: false, errorCode: 'AUTH', message: 'sign in', status: 401 }),
    );
    const client = createInsightsClient(send, { retries: 2, minGapMs: 0 });
    const res = await client.tabs();
    expect(res).toMatchObject({ ok: false, errorCode: 'AUTH' });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('turns a lost callback into a NETWORK failure', async () => {
    const client = createInsightsClient(() => undefined, {
      timeoutMs: 5,
      minGapMs: 0,
      retries: 0,
    });
    await expect(client.tabs()).resolves.toMatchObject({ ok: false, errorCode: 'NETWORK' });
  });

  it('remembers the winning transport for later requests', async () => {
    const requests: InsightsRequest[] = [];
    const send: SendMessage = (req, cb) => {
      requests.push(req);
      cb(tabsOk('delegated'));
    };
    const client = createInsightsClient(send, { minGapMs: 0 });
    await client.tabs();
    await client.tabs();

    expect(requests[0]).not.toHaveProperty('prefer');
    expect(requests[1]).toMatchObject({ prefer: 'delegated' });
    expect(client.preferredTransport).toBe('delegated');
  });

  it('sends status and page on list, status on detail', async () => {
    const requests: InsightsRequest[] = [];
    const send: SendMessage = (req, cb) => {
      requests.push(req);
      if (req.kind === 'insights/list') {
        cb({
          ok: true,
          kind: 'insights/list',
          data: { orders: [], page: req.page, totalPages: 1, totalItems: 0 },
          transport: 'direct',
        });
      } else if (req.kind === 'insights/detail') {
        cb({
          ok: true,
          kind: 'insights/detail',
          data: { order: null as never, items: [], shipments: [] },
          transport: 'direct',
        });
      } else {
        cb(tabsOk());
      }
    };
    const client = createInsightsClient(send, { minGapMs: 0 });
    await client.list('returned', 2);
    await client.detail(42, 'returned');

    expect(requests[0]).toEqual({ kind: 'insights/list', status: 'returned', page: 2 });
    expect(requests[1]).toEqual({
      kind: 'insights/detail',
      orderId: 42,
      status: 'returned',
      prefer: 'direct',
    });
  });
});
