/**
 * @vitest-environment jsdom
 *
 * Fetch delegation tests (D-16): the main-world executor
 * (content-script side) and the service-worker sender.
 *
 * The executor injects a self-contained script into the
 * page's MAIN world (the checkout API's CORS policy only
 * allows the web origin - the isolated-world fetch is
 * blocked at the preflight, live-verified 2026-10-07).
 *
 * jsdom does not execute injected scripts during tests
 * (its resource queue stays paused - the document never
 * fires load), so tests assert the injected code's
 * content (GET-only, session credentials, the captured
 * header set) and drive the result round-trip by
 * dispatching the window.postMessage the injected
 * executor would send. The injected path itself is
 * verified live in the real browser (Phase B smoke).
 *
 * D-01 audit: the injected code is GET-only with session
 * credentials. D-02: the scope guard runs before injection.
 * The site routing header set is asserted verbatim
 * (live-captured via CDP 2026-10-07).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_API_HEADERS } from '../src/capture/fetch/site-headers';
import {
  delegateFetchJson,
  installFetchDelegateListener,
  isDelegateFetchRequest,
  runDelegatedFetchInMainWorld,
  type DelegateFetchResponse,
} from '../src/capture/fetch/delegate';

const CART_URL = 'https://api.digikala.com/checkout/v1/carts';

/** Pulls the injected executor's requestId out of the code string. */
function requestIdOf(code: string): string {
  const m = code.match(/"([^"]+)",\s*"([^"]+)",\s*\{/);
  if (!m) throw new Error('injected code does not match the executor call shape');
  return m[2] as string;
}

/** Simulates the window.postMessage the injected executor sends. */
function answer(requestId: string, payload: Record<string, unknown>): void {
  window.dispatchEvent(
    new MessageEvent('message', {
      data: { __dkoptDelegate: requestId, ...payload },
    }),
  );
}

describe('runDelegatedFetchInMainWorld (content-script executor)', () => {
  let injected: string[];

  beforeEach(() => {
    injected = [];
  });

  it('D-01 audit: injects a GET executor with the site header set', () => {
    vi.useFakeTimers();
    try {
      const p = runDelegatedFetchInMainWorld(CART_URL, {
        inject: (code) => injected.push(code),
      });
      expect(injected).toHaveLength(1);
      const code = injected[0] as string;
      // The URL, the request id, and the captured header set
      // are all baked into the injected code.
      expect(code).toContain(JSON.stringify(CART_URL));
      expect(code).toContain('method: "GET"');
      expect(code).toContain('credentials: "include"');
      expect(code).toContain(JSON.stringify(SITE_API_HEADERS));
      expect(code).toContain('mainWorldExecutor');
      void p.catch(() => {}); // the timeout below is the expected end
      vi.advanceTimersByTime(30_001);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves with the JSON the main world posts back', async () => {
    let id = '';
    const p = runDelegatedFetchInMainWorld(CART_URL, {
      inject: (code) => {
        id = requestIdOf(code);
      },
    });
    answer(id, { ok: true, status: 200, json: { data: { cart: {} } } });
    await expect(p).resolves.toEqual({ data: { cart: {} } });
  });

  it('ignores postMessages from other sources', async () => {
    let id = '';
    const p = runDelegatedFetchInMainWorld(CART_URL, {
      inject: (code) => {
        id = requestIdOf(code);
      },
    });
    answer('someone-elses-id', { ok: true, status: 200, json: { trap: true } });
    answer(id, { ok: true, status: 200, json: { data: {} } });
    await expect(p).resolves.toEqual({ data: {} });
  });

  it('maps a main-world HTTP error to HTTP_STATUS', async () => {
    let id = '';
    const p = runDelegatedFetchInMainWorld(CART_URL, {
      inject: (code) => {
        id = requestIdOf(code);
      },
    });
    answer(id, { ok: false, status: 401 });
    await expect(p).rejects.toMatchObject({ code: 'HTTP_STATUS' });
  });

  it('maps a main-world network failure to NETWORK', async () => {
    let id = '';
    const p = runDelegatedFetchInMainWorld(CART_URL, {
      inject: (code) => {
        id = requestIdOf(code);
      },
    });
    answer(id, { ok: false, networkError: 'Failed to fetch' });
    await expect(p).rejects.toMatchObject({ code: 'NETWORK' });
  });

  it('rejects NETWORK when the main world never reports back', async () => {
    vi.useFakeTimers();
    try {
      const p = runDelegatedFetchInMainWorld(CART_URL, {
        inject: () => {},
      });
      vi.advanceTimersByTime(30_001);
      await expect(p).rejects.toMatchObject({ code: 'NETWORK' });
    } finally {
      vi.useRealTimers();
    }
  });

  it('D-02: refuses non-digikala hosts before injecting', async () => {
    const inject = vi.fn();
    await expect(
      runDelegatedFetchInMainWorld('https://evil.example.com/steal', { inject }),
    ).rejects.toMatchObject({ code: 'OUT_OF_SCOPE' });
    expect(inject).not.toHaveBeenCalled();
  });
});

describe('installFetchDelegateListener (content-script message contract)', () => {
  type Listener = (
    raw: unknown,
    sender: unknown,
    sendResponse: (res: DelegateFetchResponse) => void,
  ) => boolean;

  let injected: string[];

  function installAndCapture(): { handler(): Listener | undefined } {
    let listener: Listener | undefined;
    vi.stubGlobal('chrome', {
      runtime: {
        onMessage: {
          addListener: (h: Listener) => {
            listener = h;
          },
        },
      },
    });
    // The capture inject lets the test read the requestId
    // the content script generated and answer as the
    // injected executor would (via window.postMessage).
    installFetchDelegateListener({
      inject: (code) => injected.push(code),
    });
    return { handler: () => listener };
  }

  beforeEach(() => {
    injected = [];
  });
  afterEach(() => vi.unstubAllGlobals());

  it('answers fetch/delegate requests from the page main world', async () => {
    const { handler } = installAndCapture();
    const l = handler();
    expect(l).toBeDefined();

    const responsePromise = new Promise<DelegateFetchResponse>((resolve) => {
      const handled = l?.({ kind: 'fetch/delegate', url: CART_URL }, undefined, resolve);
      expect(handled).toBe(true);
    });

    // Answer as the injected executor would.
    const id = requestIdOf(injected[injected.length - 1] as string);
    answer(id, { ok: true, status: 200, json: { data: { packages: [] } } });

    expect(await responsePromise).toEqual({
      ok: true,
      json: { data: { packages: [] } },
    });
  });

  it('reports execution failures as {ok:false} instead of throwing', async () => {
    const { handler } = installAndCapture();
    const l = handler();
    const responsePromise = new Promise<DelegateFetchResponse>((resolve) => {
      void l?.({ kind: 'fetch/delegate', url: CART_URL }, undefined, resolve);
    });
    const id = requestIdOf(injected[injected.length - 1] as string);
    answer(id, { ok: false, status: 401 });
    const response = await responsePromise;
    expect(response.ok).toBe(false);
    if (response && !response.ok) {
      expect(response.errorCode).toBe('HTTP_STATUS');
      expect(response.message).toContain('401');
    }
  });

  it('ignores non-delegate messages (channel stays free)', () => {
    const { handler } = installAndCapture();
    const l = handler();
    expect(l?.({ kind: 'capture/pdp', productId: '1', variantId: '2' }, undefined, () => {})).toBe(
      false,
    );
    expect(l?.('not ours', undefined, () => {})).toBe(false);
  });
});

describe('delegateFetchJson (service-worker sender)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('sends the delegate request to the tab and returns the JSON', async () => {
    const sent: Array<{ tabId: number; msg: unknown }> = [];
    vi.stubGlobal('chrome', {
      tabs: {
        sendMessage: async (tabId: number, msg: unknown) => {
          sent.push({ tabId, msg });
          return { ok: true, json: { data: { cart: {} } } };
        },
      },
    });
    const out = await delegateFetchJson(42, CART_URL);
    expect(out).toEqual({ data: { cart: {} } });
    expect(sent).toHaveLength(1);
    expect(sent[0]?.tabId).toBe(42);
    expect(sent[0]?.msg).toEqual({ kind: 'fetch/delegate', url: CART_URL });
  });

  it('re-raises a delegate failure as the mapped typed error', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        sendMessage: async () => ({
          ok: false,
          errorCode: 'HTTP_STATUS',
          message: `HTTP 401 from ${CART_URL}`,
        }),
      },
    });
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'HTTP_STATUS',
    });
  });

  it('maps an unreachable content script to NETWORK', async () => {
    vi.stubGlobal('chrome', {
      tabs: {
        sendMessage: async () => {
          throw new Error('Could not establish connection');
        },
      },
    });
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('refuses malformed responses', async () => {
    vi.stubGlobal('chrome', {
      tabs: { sendMessage: async () => 'not a response' },
    });
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'STRUCTURE_UNRECOGNIZED',
    });
  });

  it('D-02: refuses non-digikala hosts before messaging the tab', async () => {
    const sendMessage = vi.fn();
    vi.stubGlobal('chrome', { tabs: { sendMessage } });
    await expect(delegateFetchJson(1, 'https://evil.example.com/steal')).rejects.toMatchObject({
      code: 'OUT_OF_SCOPE',
    });
    expect(sendMessage).not.toHaveBeenCalled();
  });
});

describe('isDelegateFetchRequest', () => {
  it('accepts the delegate shape and rejects lookalikes', () => {
    expect(isDelegateFetchRequest({ kind: 'fetch/delegate', url: CART_URL })).toBe(true);
    expect(isDelegateFetchRequest({ kind: 'fetch/delegate' })).toBe(false);
    expect(isDelegateFetchRequest({ kind: 'fetch/delegate', url: 42 })).toBe(false);
    expect(isDelegateFetchRequest({ kind: 'capture/pdp', productId: '1', variantId: '2' })).toBe(
      false,
    );
    expect(isDelegateFetchRequest(null)).toBe(false);
  });
});
