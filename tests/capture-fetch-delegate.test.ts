/**
 * @vitest-environment jsdom
 *
 * Fetch delegation tests (D-16): the main-world
 * executor func and the service-worker sender.
 *
 * The executor runs in the requesting tab's page
 * MAIN world via chrome.scripting.executeScript.
 * Two reasons, both live-verified: the checkout
 * API's CORS policy only allows the web origin
 * (SW fetch 401s, isolated-world fetch is
 * blocked at the preflight, main-world fetch
 * 200s - 2026-10-07), and script-tag injection
 * from a content script does not execute in the
 * current Chromium (elements appended to the
 * correct document.head never run in any world
 * - 2026-10-08).
 *
 * The executor transports its result as a JSON
 * string: a plain object return did not survive
 * the trip back in some real Chrome builds
 * (works in the test Chromium - live finding
 * 2026-10-08 (4)). It also writes an execution
 * probe to <html data-dkopt-probe> so the SW
 * can tell whether the func ran at all.
 *
 * jsdom cannot execute chrome.scripting, so the
 * sender's tests stub chrome.scripting.executeScript
 * and the executor func is exercised directly
 * (it only needs global fetch, which jsdom
 * stubs). The injected path itself is verified
 * live in the browser (Phase B smoke).
 *
 * D-01 audit: the executor is GET-only with
 * session credentials (baked into the func).
 * D-02: the scope guard runs on both sides.
 * The site routing header set is asserted
 * verbatim (live-captured via CDP 2026-10-07).
 */
import { afterEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SITE_API_HEADERS } from '../src/capture/fetch/site-headers';
import { delegateFetchJson, mainWorldFetch } from '../src/capture/fetch/delegate';

const CART_URL = 'https://api.digikala.com/checkout/v1/carts';

/** A minimal Response stand-in for the stubbed fetch. */
function responseOf(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new Error('not json');
      return body;
    },
  } as unknown as Response;
}

/** The executor transports results as JSON strings. */
function asResult(res: string): Record<string, unknown> {
  return JSON.parse(res) as Record<string, unknown>;
}

describe('mainWorldFetch (page main-world executor)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('D-01 audit: the executor is GET-only with session credentials', () => {
    // Structural guarantee: the method and the
    // session credentials are baked into the
    // serialized func - no caller can turn a
    // crawl fetch into a write. (Quote style
    // varies with the transform, so match both.)
    const src = mainWorldFetch.toString();
    expect(src).toMatch(/method:\s*['"]GET['"]/);
    expect(src).toMatch(/credentials:\s*['"]include['"]/);
  });

  it('fetches GET with the site header set and resolves the JSON', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      responseOf(200, { data: { cart: {} } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await mainWorldFetch(CART_URL, SITE_API_HEADERS);
    expect(asResult(res)).toEqual({ ok: true, json: { data: { cart: {} } } });
    expect(fetchMock).toHaveBeenCalledWith(
      CART_URL,
      expect.objectContaining({
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json', ...SITE_API_HEADERS },
      }),
    );
    // The fetch is time-budgeted (an abort
    // signal is attached; see the hung-fetch
    // test below).
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(init?.signal).toBeTruthy();
  });

  it('maps HTTP errors to {ok:false, HTTP_STATUS}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responseOf(401)),
    );
    const res = await mainWorldFetch(CART_URL, SITE_API_HEADERS);
    expect(asResult(res)).toMatchObject({ ok: false, errorCode: 'HTTP_STATUS', status: 401 });
  });

  it('maps network failures to {ok:false, NETWORK}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    );
    const res = await mainWorldFetch(CART_URL, SITE_API_HEADERS);
    expect(asResult(res)).toMatchObject({ ok: false, errorCode: 'NETWORK' });
  });

  it('surfaces non-JSON bodies as json:null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responseOf(200, undefined)),
    );
    const res = await mainWorldFetch(CART_URL, SITE_API_HEADERS);
    expect(asResult(res)).toEqual({ ok: true, json: null });
  });

  it('bounds a hung fetch to NETWORK after the time budget', async () => {
    vi.useFakeTimers();
    try {
      // A fetch that never settles on its
      // own but rejects when the budget
      // aborts it (real fetch behavior
      // under a hung response).
      vi.stubGlobal(
        'fetch',
        vi.fn(
          (_url: string, init?: RequestInit) =>
            new Promise<Response>((_, reject) => {
              init?.signal?.addEventListener('abort', () => {
                reject(new DOMException('aborted', 'AbortError'));
              });
            }),
        ),
      );
      const pending = mainWorldFetch(CART_URL, SITE_API_HEADERS).then(asResult);
      const settled = expect(pending).resolves.toMatchObject({
        ok: false,
        errorCode: 'NETWORK',
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it('D-02: refuses non-digikala hosts before fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const res = await mainWorldFetch('https://evil.example.com/steal', SITE_API_HEADERS);
    expect(asResult(res)).toMatchObject({ ok: false, errorCode: 'OUT_OF_SCOPE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('delegateFetchJson (service-worker sender)', () => {
  afterEach(() => vi.unstubAllGlobals());

  /** Stubs chrome.scripting.executeScript to return canned results. */
  function stubExecuteScript(
    impl: (options: {
      target: { tabId: number };
      world: string;
      func: unknown;
      args: unknown[];
    }) => unknown,
  ): Mock {
    const mock = vi.fn(impl);
    vi.stubGlobal('chrome', {
      scripting: { executeScript: mock },
    });
    return mock;
  }

  it('executes the fetch in the tab main world and returns the JSON', async () => {
    const executeScript = stubExecuteScript(() => [
      {
        documentId: 'd1',
        frameId: 0,
        result: JSON.stringify({ ok: true, json: { data: { cart: {} } } }),
      },
    ]);
    const out = await delegateFetchJson(42, CART_URL);
    expect(out).toEqual({ data: { cart: {} } });
    expect(executeScript).toHaveBeenCalledTimes(1);
    // The injection targets the requesting tab's
    // MAIN world, with the site header set as
    // args (D-01: the func itself is GET-only).
    const firstCall = executeScript.mock.calls[0];
    expect(firstCall).toBeDefined();
    const options = firstCall?.[0] as {
      target: { tabId: number };
      world: string;
      func: unknown;
      args: unknown[];
    };
    expect(options.target.tabId).toBe(42);
    expect(options.world).toBe('MAIN');
    expect(options.func).toBe(mainWorldFetch);
    expect(options.args).toEqual([CART_URL, SITE_API_HEADERS]);
  });

  it('maps a main-world HTTP error to HTTP_STATUS', async () => {
    stubExecuteScript(() => [
      {
        documentId: 'd1',
        frameId: 0,
        result: JSON.stringify({
          ok: false,
          errorCode: 'HTTP_STATUS',
          message: `HTTP 401 from ${CART_URL}`,
          status: 401,
        }),
      },
    ]);
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'HTTP_STATUS',
    });
  });

  it('maps a main-world network failure to NETWORK', async () => {
    stubExecuteScript(() => [
      {
        documentId: 'd1',
        frameId: 0,
        result: JSON.stringify({
          ok: false,
          errorCode: 'NETWORK',
          message: 'Network failure: Failed to fetch',
        }),
      },
    ]);
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('maps an unreachable tab to NETWORK', async () => {
    // executeScript itself rejects (tab closed /
    // extension context invalidated).
    stubExecuteScript(() => Promise.reject(new Error('Cannot access a chrome:// URL')));
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('refuses an empty injection result as NETWORK', async () => {
    // The diagnosis path re-reads the execution
    // probe (a second executeScript); the stub
    // keeps returning an empty frame list.
    stubExecuteScript(() => []);
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('refuses a non-string injection result as NETWORK', async () => {
    // Regression guard for the 2026-10-08 (4)
    // transport change: an object result (what
    // older builds produced) must be refused,
    // not mis-parsed.
    stubExecuteScript(() => [{ documentId: 'd1', frameId: 0, result: { ok: true, json: {} } }]);
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('refuses unknown main-world error codes as STRUCTURE_UNRECOGNIZED', async () => {
    stubExecuteScript(() => [
      {
        documentId: 'd1',
        frameId: 0,
        result: JSON.stringify({ ok: false, errorCode: 'WEIRD', message: 'x' }),
      },
    ]);
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'STRUCTURE_UNRECOGNIZED',
    });
  });

  it('D-02: refuses non-digikala hosts before touching the tab', async () => {
    const executeScript = stubExecuteScript(() => [
      { documentId: 'd1', frameId: 0, result: JSON.stringify({ ok: true, json: {} }) },
    ]);
    await expect(delegateFetchJson(1, 'https://evil.example.com/steal')).rejects.toMatchObject({
      code: 'OUT_OF_SCOPE',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });
});
