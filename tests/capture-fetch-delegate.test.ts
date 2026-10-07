/**
 * Fetch delegation tests (D-16): the content-script executor and
 * the service-worker sender. D-01 audit: every delegated call is
 * GET with session credentials. D-02: the scope guard runs on
 * both sides before any byte moves. The site routing header set
 * is asserted verbatim (live-captured via CDP 2026-10-07).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SITE_API_HEADERS } from '../src/capture/fetch/site-headers';
import {
  delegatedFetchJson,
  delegateFetchJson,
  installFetchDelegateListener,
  isDelegateFetchRequest,
  type DelegateFetchResponse,
} from '../src/capture/fetch/delegate';

const CART_URL = 'https://api.digikala.com/checkout/v1/carts';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

describe('delegatedFetchJson (content-script executor)', () => {
  let calls: Array<{ url: string; init: RequestInit | undefined }>;

  beforeEach(() => {
    calls = [];
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return jsonResponse({ data: {} });
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('D-01 audit: GET with session credentials and the site header set', async () => {
    const out = await delegatedFetchJson(CART_URL);
    expect(out).toEqual({ data: {} });
    expect(calls).toHaveLength(1);
    const init = calls[0]?.init;
    expect(init?.method).toBe('GET');
    expect(init?.credentials).toBe('include');
    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers['Accept']).toBe('application/json');
    expect(headers['x-site']).toBe(SITE_API_HEADERS['x-site']);
    expect(headers['x-source']).toBe(SITE_API_HEADERS['x-source']);
    expect(headers['x-web-optimize-response']).toBe(SITE_API_HEADERS['x-web-optimize-response']);
  });

  it('maps a 401 to HTTP_STATUS (the pre-delegation failure mode)', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({ error: 'unauthorized' }, 401));
    await expect(delegatedFetchJson(CART_URL)).rejects.toMatchObject({
      code: 'HTTP_STATUS',
    });
  });

  it('maps a non-JSON response to STRUCTURE_UNRECOGNIZED', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        ({
          ok: true,
          status: 200,
          json: async () => {
            throw new Error('bad');
          },
        }) as unknown as Response,
    );
    await expect(delegatedFetchJson(CART_URL)).rejects.toMatchObject({
      code: 'STRUCTURE_UNRECOGNIZED',
    });
  });

  it('maps a network throw to NETWORK', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(delegatedFetchJson(CART_URL)).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('D-02: refuses non-digikala hosts before fetching', async () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    await expect(delegatedFetchJson('https://evil.example.com/steal')).rejects.toMatchObject({
      code: 'OUT_OF_SCOPE',
    });
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe('installFetchDelegateListener (content-script message contract)', () => {
  type Listener = (
    raw: unknown,
    sender: unknown,
    sendResponse: (res: DelegateFetchResponse) => void,
  ) => boolean;

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
    installFetchDelegateListener();
    return { handler: () => listener };
  }

  beforeEach(() => {
    vi.stubGlobal('fetch', async () => jsonResponse({ data: { ok: 1 } }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('answers fetch/delegate requests with the fetched JSON', async () => {
    const { handler } = installAndCapture();
    const l = handler();
    expect(l).toBeDefined();
    const response = await new Promise<DelegateFetchResponse>((resolve) => {
      const handled = l?.({ kind: 'fetch/delegate', url: CART_URL }, undefined, resolve);
      expect(handled).toBe(true);
    });
    expect(response).toEqual({ ok: true, json: { data: { ok: 1 } } });
  });

  it('reports execution failures as {ok:false} instead of throwing', async () => {
    vi.stubGlobal('fetch', async () => jsonResponse({}, 401));
    const { handler } = installAndCapture();
    const l = handler();
    const response = await new Promise<DelegateFetchResponse>((resolve) => {
      void l?.({ kind: 'fetch/delegate', url: CART_URL }, undefined, resolve);
    });
    expect(response?.ok).toBe(false);
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
