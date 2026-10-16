/**
 * @vitest-environment jsdom
 *
 * Fetch delegation tests (D-16): the main-world
 * executor func, the DOM result channel, and the
 * service-worker sender.
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
 * The result travels over the page DOM: the
 * executor writes its outcome to
 * <html data-dkopt-result> (nonce-prefixed) and
 * the service worker polls a reader func whose
 * return is a plain string - executeScript's
 * return value for promise-returning funcs came
 * back null in the crawl path in two different
 * Chromes (live finding 2026-10-08 (5)), while
 * direct string returns work everywhere tested.
 *
 * jsdom cannot execute chrome.scripting, so the
 * sender's tests stub chrome.scripting.executeScript
 * and the executor func is exercised directly
 * (it only needs global fetch + document, which
 * jsdom provides). The injected path itself is
 * verified live in the browser (Phase B smoke).
 *
 * D-01 audit: the executor is GET-only with
 * session credentials (baked into the func).
 * D-02: the scope guard runs on both sides.
 * The site routing header set is asserted
 * verbatim (live-captured via CDP 2026-10-07).
 */
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { SITE_API_HEADERS } from '../src/capture/fetch/site-headers';
import {
  delegateCartAdd,
  delegateCartRemove,
  delegateFetchJson,
  delegateShipmentQuote,
  EXECUTE_TIMING,
  mainWorldCartAdd,
  mainWorldCartRemove,
  mainWorldFetch,
  mainWorldShipmentQuote,
  readDelegateResult,
  SHIPMENT_API_BODY,
  SHIPMENT_API_URL,
} from '../src/capture/fetch/delegate';

const CART_URL = 'https://api.digikala.com/checkout/v1/carts';
const RESULT_ATTR = 'data-dkopt-result';

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

/** Flush the executor's async outcome and read it back. */
async function outcomeFor(nonce: string): Promise<Record<string, unknown>> {
  await vi.waitFor(() => {
    const attr = document.documentElement.getAttribute(RESULT_ATTR);
    expect(attr?.startsWith(`${nonce}:`)).toBe(true);
    // Checkpoint values (CP1-CP3, live
    // diagnostics) are not JSON - wait
    // past them for the real outcome.
    JSON.parse((attr as string).slice(nonce.length + 1));
  });
  const attr = document.documentElement.getAttribute(RESULT_ATTR);
  return JSON.parse((attr as string).slice(nonce.length + 1)) as Record<string, unknown>;
}

describe('mainWorldFetch (page main-world executor)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute(RESULT_ATTR);
  });

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

  it('D-16 self-containment: the serialized funcs reference no module bindings', () => {
    // executeScript serializes the func by
    // value and evaluates it in the page,
    // which cannot see the extension's
    // module scope. The minifier hoists
    // module-level constants to shared
    // bindings and rewrites the func to
    // reference them - the injected code
    // then dies on a ReferenceError before
    // its first real statement, silently
    // (executeScript resolves with a null
    // result - finding 2026-10-08 (7)).
    // The injected funcs must therefore use
    // literals only.
    for (const fn of [
      mainWorldFetch,
      mainWorldShipmentQuote,
      mainWorldCartAdd,
      mainWorldCartRemove,
      readDelegateResult,
    ]) {
      const src = fn.toString();
      expect(src).not.toContain('RESULT_ATTR');
      expect(src).not.toContain('DELEGATE_TIMEOUT_MS');
      expect(src).not.toContain('DELEGATE_POLL_MS');
      expect(src).not.toContain('SITE_API_HEADERS');
    }
  });

  it('fetches GET with the site header set and writes the JSON outcome', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      responseOf(200, { data: { cart: {} } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    mainWorldFetch({ url: CART_URL, headers: SITE_API_HEADERS, nonce: 'n1' });
    expect(await outcomeFor('n1')).toEqual({
      ok: true,
      json: { data: { cart: {} } },
    });
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
    mainWorldFetch({ url: CART_URL, headers: SITE_API_HEADERS, nonce: 'n2' });
    expect(await outcomeFor('n2')).toMatchObject({
      ok: false,
      errorCode: 'HTTP_STATUS',
      status: 401,
    });
  });

  it('maps network failures to {ok:false, NETWORK}', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('Failed to fetch');
      }),
    );
    mainWorldFetch({ url: CART_URL, headers: SITE_API_HEADERS, nonce: 'n3' });
    expect(await outcomeFor('n3')).toMatchObject({
      ok: false,
      errorCode: 'NETWORK',
    });
  });

  it('surfaces non-JSON bodies as json:null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responseOf(200, undefined)),
    );
    mainWorldFetch({ url: CART_URL, headers: SITE_API_HEADERS, nonce: 'n4' });
    expect(await outcomeFor('n4')).toEqual({ ok: true, json: null });
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
      mainWorldFetch({ url: CART_URL, headers: SITE_API_HEADERS, nonce: 'n5' });
      await vi.advanceTimersByTimeAsync(30_000);
      expect(await outcomeFor('n5')).toMatchObject({
        ok: false,
        errorCode: 'NETWORK',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('D-02: refuses non-digikala hosts before fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mainWorldFetch({
      url: 'https://evil.example.com/steal',
      headers: SITE_API_HEADERS,
      nonce: 'n6',
    });
    // The synchronous refusal writes the
    // outcome immediately (no fetch).
    const attr = document.documentElement.getAttribute(RESULT_ATTR);
    expect(attr?.startsWith('n6:')).toBe(true);
    expect(JSON.parse((attr as string).slice('n6:'.length))).toMatchObject({
      ok: false,
      errorCode: 'OUT_OF_SCOPE',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('readDelegateResult (DOM outcome reader)', () => {
  afterEach(() => {
    document.documentElement.removeAttribute(RESULT_ATTR);
  });

  it('reads the nonce-prefixed outcome from the page DOM', () => {
    document.documentElement.setAttribute(RESULT_ATTR, 'n7:{"ok":true,"json":{}}');
    expect(readDelegateResult()).toBe('n7:{"ok":true,"json":{}}');
  });

  it('reads null while no outcome is written', () => {
    expect(readDelegateResult()).toBeNull();
  });
});

describe('delegateFetchJson (service-worker sender)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute(RESULT_ATTR);
  });

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
    // The sender also writes its live
    // diagnostics to chrome.storage.local;
    // stub it so the tests exercise the
    // real code path.
    vi.stubGlobal('chrome', {
      scripting: { executeScript: mock },
      storage: { local: { set: vi.fn() } },
    });
    return mock;
  }

  /**
   * Stubs the two-phase protocol: the first
   * call is the fetch injection (its return
   * value is ignored - mirrors the live
   * behavior where a promise return does not
   * survive), every later call is the DOM
   * reader, which answers with the captured
   * nonce and the canned outcome.
   */
  function stubDelegateFlow(outcome: Record<string, unknown> | null): Mock {
    let nonce: string | undefined;
    let calls = 0;
    return stubExecuteScript((options) => {
      calls += 1;
      if (calls === 1) {
        nonce = ((options.args as unknown[])[0] as { nonce: string }).nonce;
        return [{ documentId: 'd1', frameId: 0, result: null }];
      }
      if (outcome === null) {
        return [{ documentId: 'd1', frameId: 0, result: null }];
      }
      return [
        {
          documentId: 'd1',
          frameId: 0,
          result: `${nonce}:${JSON.stringify(outcome)}`,
        },
      ];
    });
  }

  it('executes the fetch in the tab main world and returns the JSON', async () => {
    const executeScript = stubDelegateFlow({
      ok: true,
      json: { data: { cart: {} } },
    });
    const out = await delegateFetchJson(42, CART_URL);
    expect(out).toEqual({ data: { cart: {} } });
    // The injection targets the requesting
    // tab's MAIN world, with the site header
    // set and a per-call nonce as args
    // (D-01: the func itself is GET-only).
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
    expect(options.args).toHaveLength(1);
    const injected = options.args[0] as {
      url: string;
      headers: Record<string, string>;
      nonce: string;
    };
    expect(injected.url).toBe(CART_URL);
    expect(injected.headers).toEqual(SITE_API_HEADERS);
    expect(typeof injected.nonce).toBe('string');
    // The outcome is read back by the
    // plain-string reader func.
    const readerCall = executeScript.mock.calls[1];
    expect(readerCall).toBeDefined();
    const readerOptions = readerCall?.[0] as { func: unknown };
    expect(readerOptions.func).toBe(readDelegateResult);
  });

  it('ignores a stale outcome from an earlier fetch (nonce check)', async () => {
    let nonce: string | undefined;
    let calls = 0;
    const executeScript = stubExecuteScript((options) => {
      calls += 1;
      if (calls === 1) {
        nonce = ((options.args as unknown[])[0] as { nonce: string }).nonce;
        return [{ documentId: 'd1', frameId: 0, result: null }];
      }
      // First reader answer: a stale nonce.
      // Second: the correct one.
      const payload =
        calls === 2
          ? 'stale-nonce:{"ok":true,"json":{"stale":true}}'
          : `${nonce}:${JSON.stringify({ ok: true, json: { data: { cart: {} } } })}`;
      return [{ documentId: 'd1', frameId: 0, result: payload }];
    });
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      storage: { local: { set: vi.fn() } },
    });
    const out = await delegateFetchJson(42, CART_URL);
    expect(out).toEqual({ data: { cart: {} } });
    expect(executeScript).toHaveBeenCalledTimes(3);
  });

  it('maps a main-world HTTP error to HTTP_STATUS', async () => {
    stubDelegateFlow({
      ok: false,
      errorCode: 'HTTP_STATUS',
      message: `HTTP 401 from ${CART_URL}`,
      status: 401,
    });
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'HTTP_STATUS',
    });
  });

  it('maps a main-world network failure to NETWORK', async () => {
    stubDelegateFlow({
      ok: false,
      errorCode: 'NETWORK',
      message: 'Network failure: Failed to fetch',
    });
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('maps an unreachable tab to NETWORK', async () => {
    // executeScript itself rejects (tab closed /
    // extension context invalidated).
    const mock = vi.fn(() => Promise.reject(new Error('Cannot access a chrome:// URL')));
    vi.stubGlobal('chrome', {
      scripting: { executeScript: mock },
      storage: { local: { set: vi.fn() } },
    });
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });

  it('maps a missing outcome to NETWORK after the poll deadline', async () => {
    vi.useFakeTimers();
    try {
      // The reader never sees this nonce's
      // outcome (the injected func never
      // wrote one).
      stubDelegateFlow(null);
      const pending = delegateFetchJson(1, CART_URL);
      const settled = expect(pending).rejects.toMatchObject({
        code: 'NETWORK',
      });
      await vi.advanceTimersByTimeAsync(30_000);
      await settled;
    } finally {
      vi.useRealTimers();
    }
  });

  it('refuses unknown main-world error codes as STRUCTURE_UNRECOGNIZED', async () => {
    stubDelegateFlow({ ok: false, errorCode: 'WEIRD', message: 'x' });
    await expect(delegateFetchJson(1, CART_URL)).rejects.toMatchObject({
      code: 'STRUCTURE_UNRECOGNIZED',
    });
  });

  it('D-02: refuses non-digikala hosts before touching the tab', async () => {
    const executeScript = vi.fn(() => [{ documentId: 'd1', frameId: 0, result: null }]);
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      storage: { local: { set: vi.fn() } },
    });
    await expect(delegateFetchJson(1, 'https://evil.example.com/steal')).rejects.toMatchObject({
      code: 'OUT_OF_SCOPE',
    });
    expect(executeScript).not.toHaveBeenCalled();
  });
});

describe('mainWorldShipmentQuote (D-19 page executor)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute(RESULT_ATTR);
  });

  it('D-19 audit: the executor is POST-only with session credentials', () => {
    // Structural guarantee: the method is baked in
    // as POST - the extension's only POST - and no
    // caller can change the verb or drop the
    // session credentials.
    const src = mainWorldShipmentQuote.toString();
    expect(src).toMatch(/method:\s*['"]POST['"]/);
    expect(src).toMatch(/credentials:\s*['"]include['"]/);
  });

  it('POSTs the fixed body with only the JSON content type', async () => {
    // Live preflight probe 2026-10-09: the
    // routing header set breaks this endpoint's
    // CORS preflight ("Failed to fetch"); the
    // quote authenticates with the session
    // cookie alone, so the POST carries only
    // the content type.
    const initSeen: RequestInit[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        initSeen.push(init ?? {});
        return responseOf(200, { data: { shipment_types: {} } });
      }),
    );
    const nonce = 'n-ship-1';
    mainWorldShipmentQuote({
      url: SHIPMENT_API_URL,
      nonce,
      body: SHIPMENT_API_BODY,
    });
    const outcome = await outcomeFor(nonce);
    expect(outcome.ok).toBe(true);
    expect(initSeen).toHaveLength(1);
    expect(initSeen[0]?.method).toBe('POST');
    expect(initSeen[0]?.body).toBe(SHIPMENT_API_BODY);
    expect(initSeen[0]?.headers).toEqual({
      'Content-Type': 'application/json',
    });
  });

  it('retries a burst preflight rejection (live finding 2026-10-09)', async () => {
    // The crawl bursts several API reads before
    // the quote; the shipment endpoint's preflight
    // sometimes rejects under that burst ("Failed
    // to fetch" - fast, not an HTTP error). The
    // bounded retry with a backoff recovers.
    vi.useFakeTimers();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        calls += 1;
        if (calls < 3) {
          throw new TypeError('Failed to fetch');
        }
        return responseOf(200, { data: { shipment_types: {} } });
      }),
    );
    const nonce = 'n-ship-retry';
    mainWorldShipmentQuote({
      url: SHIPMENT_API_URL,
      nonce,
      body: SHIPMENT_API_BODY,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const outcome = await outcomeFor(nonce);
    expect(outcome.ok).toBe(true);
    expect(calls).toBe(3);
    vi.useRealTimers();
  });

  it('reports NETWORK once the bounded retries are exhausted', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    });
    vi.stubGlobal('fetch', fetchMock);
    const nonce = 'n-ship-retry-exhausted';
    mainWorldShipmentQuote({
      url: SHIPMENT_API_URL,
      nonce,
      body: SHIPMENT_API_BODY,
    });
    await vi.advanceTimersByTimeAsync(10_000);
    const outcome = await outcomeFor(nonce);
    expect(outcome).toMatchObject({ ok: false, errorCode: 'NETWORK' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    vi.useRealTimers();
  });

  it('D-02: refuses non-digikala hosts without fetching', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const nonce = 'n-ship-2';
    mainWorldShipmentQuote({
      url: 'https://evil.example.com/shipment',
      nonce,
      body: SHIPMENT_API_BODY,
    });
    const outcome = await outcomeFor(nonce);
    expect(outcome).toMatchObject({ ok: false, errorCode: 'OUT_OF_SCOPE' });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('delegateShipmentQuote (service-worker sender)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute(RESULT_ATTR);
  });

  function stubShipmentFlow(outcome: Record<string, unknown> | null): Mock {
    let nonce: string | undefined;
    let calls = 0;
    const mock = vi.fn(
      (options: { target: { tabId: number }; world: string; func: unknown; args?: unknown[] }) => {
        calls += 1;
        if (calls === 1) {
          nonce = ((options.args as unknown[])?.[0] as { nonce: string }).nonce;
          return [{ documentId: 'd1', frameId: 0, result: null }];
        }
        if (outcome === null) {
          return [{ documentId: 'd1', frameId: 0, result: null }];
        }
        return [
          {
            documentId: 'd1',
            frameId: 0,
            result: `${nonce}:${JSON.stringify(outcome)}`,
          },
        ];
      },
    );
    vi.stubGlobal('chrome', {
      scripting: { executeScript: mock },
      storage: { local: { set: vi.fn() } },
    });
    return mock;
  }

  it('resolves with the quoted JSON from the tab', async () => {
    const quote = { data: { shipment_types: { normal: [] } } };
    stubShipmentFlow({ ok: true, json: quote });
    await expect(delegateShipmentQuote(7, SHIPMENT_API_URL, SHIPMENT_API_BODY)).resolves.toEqual(
      quote,
    );
  });

  it('rejects on an HTTP error outcome', async () => {
    stubShipmentFlow({ ok: false, errorCode: 'HTTP_STATUS', message: 'HTTP 401', status: 401 });
    await expect(
      delegateShipmentQuote(7, SHIPMENT_API_URL, SHIPMENT_API_BODY),
    ).rejects.toMatchObject({ code: 'HTTP_STATUS' });
  });

  it('D-02: refuses non-digikala hosts before touching the tab', async () => {
    const executeScript = vi.fn(() => [{ documentId: 'd1', frameId: 0, result: null }]);
    vi.stubGlobal('chrome', {
      scripting: { executeScript },
      storage: { local: { set: vi.fn() } },
    });
    await expect(
      delegateShipmentQuote(7, 'https://evil.example.com/v4/shipment/', '{}'),
    ).rejects.toMatchObject({ code: 'OUT_OF_SCOPE' });
    expect(executeScript).not.toHaveBeenCalled();
  });
});

describe('executeScript callback loss (D-20)', () => {
  const realTiming = { ...EXECUTE_TIMING };

  /** Stubs chrome.scripting.executeScript (mirrors
   * the sender describe's helper). */
  function stubScript(
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
      storage: { local: { set: vi.fn() } },
    });
    return mock;
  }

  beforeEach(() => {
    EXECUTE_TIMING.timeoutMs = 50;
    EXECUTE_TIMING.attempts = 3;
    EXECUTE_TIMING.retryDelayMs = 5;
  });

  afterEach(() => {
    Object.assign(EXECUTE_TIMING, realTiming);
    vi.unstubAllGlobals();
  });

  it('a lost executeScript callback retries and recovers', async () => {
    let fetchCalls = 0;
    let nonce = '';
    const outcome = { ok: true, json: { data: { recovered: true } } };
    const executeScript = stubScript((options) => {
      if (options.func === mainWorldFetch) {
        fetchCalls += 1;
        if (fetchCalls === 1) {
          // Cold-SW flake: the callback never
          // arrives, so the call never settles.
          return new Promise(() => {});
        }
        nonce = (options.args[0] as { nonce: string }).nonce;
        return [{ documentId: 'd1', frameId: 0, result: null }];
      }
      // readDelegateResult: the page holds the
      // outcome for the retried call's nonce.
      return [
        {
          documentId: 'd1',
          frameId: 0,
          result: `${nonce}:${JSON.stringify(outcome)}`,
        },
      ];
    });

    const out = await delegateFetchJson(42, CART_URL);
    expect(out).toEqual({ data: { recovered: true } });
    // The lost callback was retried, not fatal.
    expect(fetchCalls).toBe(2);
    expect(executeScript).toHaveBeenCalled();
  });

  it('a lost read callback counts as "no outcome yet"', async () => {
    let reads = 0;
    let nonce = '';
    const outcome = { ok: true, json: { data: { slow: true } } };
    stubScript((options) => {
      if (options.func === mainWorldFetch) {
        nonce = (options.args[0] as { nonce: string }).nonce;
        return [{ documentId: 'd1', frameId: 0, result: null }];
      }
      reads += 1;
      if (reads === 1) {
        // Lost read callback: no result, no
        // rejection - the loop must keep going.
        return new Promise(() => {});
      }
      return [
        {
          documentId: 'd1',
          frameId: 0,
          result: `${nonce}:${JSON.stringify(outcome)}`,
        },
      ];
    });

    const out = await delegateFetchJson(42, CART_URL);
    expect(out).toEqual({ data: { slow: true } });
    expect(reads).toBe(2);
  });

  it('a permanently lost callback rejects as a network failure', async () => {
    stubScript(() => new Promise(() => {}));
    await expect(delegateFetchJson(42, CART_URL)).rejects.toMatchObject({
      code: 'NETWORK',
    });
  });
});

/**
 * D-30: the two cart writers the apply flow runs in the tab's main
 * world. Structural guarantees first (the verb and the endpoint are
 * baked in; no caller can aim a write elsewhere), then behaviour,
 * then the at-most-once guard that keeps a retried injection from
 * adding a second unit.
 */
describe('mainWorldCartAdd / mainWorldCartRemove (D-30 page executors)', () => {
  const CART_ITEMS = 'https://api.digikala.com/checkout/v1/carts/items';

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute(RESULT_ATTR);
  });

  /** Waits past the IN_FLIGHT checkpoint for the settled outcome. */
  async function settledOutcome(nonce: string): Promise<Record<string, unknown>> {
    await vi.waitFor(() => {
      const attr = document.documentElement.getAttribute(RESULT_ATTR);
      expect(attr?.startsWith(`${nonce}:`)).toBe(true);
      const parsed = JSON.parse((attr as string).slice(nonce.length + 1)) as Record<
        string,
        unknown
      >;
      expect(parsed['errorCode']).not.toBe('IN_FLIGHT');
    });
    const attr = document.documentElement.getAttribute(RESULT_ATTR);
    return JSON.parse((attr as string).slice(nonce.length + 1)) as Record<string, unknown>;
  }

  it('D-30 audit: each writer bakes in its verb and the cart endpoint', () => {
    const add = mainWorldCartAdd.toString();
    expect(add).toMatch(/method:\s*['"]POST['"]/);
    expect(add).toContain('checkout/v1/carts/items');
    expect(add).toMatch(/credentials:\s*['"]include['"]/);

    const remove = mainWorldCartRemove.toString();
    expect(remove).toMatch(/method:\s*['"]DELETE['"]/);
    expect(remove).toContain('checkout/v1/carts/items');
    expect(remove).toMatch(/credentials:\s*['"]include['"]/);
  });

  it('adds via POST with the site header set and the variant body', async () => {
    const fetchMock = vi.fn(async () => responseOf(200, { ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    mainWorldCartAdd({ variantId: 'v2', headers: SITE_API_HEADERS, nonce: 'w1' });
    expect(await settledOutcome('w1')).toEqual({ ok: true, json: { ok: 1 } });
    expect(fetchMock).toHaveBeenCalledWith(
      CART_ITEMS,
      expect.objectContaining({
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', ...SITE_API_HEADERS },
        body: JSON.stringify({ variant_ids: ['v2'] }),
      }),
    );
  });

  it('removes via DELETE with the cart item body', async () => {
    const fetchMock = vi.fn(async () => responseOf(200));
    vi.stubGlobal('fetch', fetchMock);
    mainWorldCartRemove({ cartItemId: 'c9', headers: SITE_API_HEADERS, nonce: 'w2' });
    // An empty body is the normal DELETE success shape.
    expect(await settledOutcome('w2')).toEqual({ ok: true, json: null });
    expect(fetchMock).toHaveBeenCalledWith(
      CART_ITEMS,
      expect.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ cartItemIds: ['c9'] }),
      }),
    );
  });

  it('publishes an in-flight checkpoint before the request leaves', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );
    mainWorldCartAdd({ variantId: 'v3', headers: SITE_API_HEADERS, nonce: 'w3' });
    const attr = document.documentElement.getAttribute(RESULT_ATTR);
    expect(attr?.startsWith('w3:')).toBe(true);
    expect(JSON.parse((attr as string).slice('w3:'.length))).toMatchObject({
      errorCode: 'IN_FLIGHT',
    });
  });

  it('at-most-once: a retried injection with the same nonce does not add twice', async () => {
    const fetchMock = vi.fn(async () => responseOf(200, { ok: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const args = { variantId: 'v4', headers: SITE_API_HEADERS, nonce: 'w4' };
    mainWorldCartAdd(args);
    // The worker retries when executeScript's callback is lost; the
    // second run sees this call's nonce already published.
    mainWorldCartAdd(args);
    expect(await settledOutcome('w4')).toEqual({ ok: true, json: { ok: 1 } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('maps a 401 to HTTP_STATUS and carries the status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => responseOf(401)),
    );
    mainWorldCartAdd({ variantId: 'v5', headers: SITE_API_HEADERS, nonce: 'w5' });
    expect(await settledOutcome('w5')).toMatchObject({
      ok: false,
      errorCode: 'HTTP_STATUS',
      status: 401,
    });
  });
});

describe('delegateCartAdd / delegateCartRemove (D-30 senders)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute(RESULT_ATTR);
  });

  /** Two-phase stub: the injection call, then the DOM reader. */
  function stubWriteFlow(outcome: Record<string, unknown>): Mock {
    let nonce = '';
    let calls = 0;
    const mock = vi.fn((options: { args: unknown[] }) => {
      calls += 1;
      if (calls === 1) {
        nonce = (options.args[0] as { nonce: string }).nonce;
        return [{ documentId: 'd1', frameId: 0, result: null }];
      }
      return [{ documentId: 'd1', frameId: 0, result: `${nonce}:${JSON.stringify(outcome)}` }];
    });
    vi.stubGlobal('chrome', {
      scripting: { executeScript: mock },
      storage: { local: { set: vi.fn() } },
    });
    return mock;
  }

  it('runs the add in the tab main world, carrying only the id', async () => {
    const executeScript = stubWriteFlow({ ok: true, json: null });
    await delegateCartAdd(42, 'v7');
    const options = executeScript.mock.calls[0]?.[0] as {
      target: { tabId: number };
      world: string;
      func: unknown;
      args: unknown[];
    };
    expect(options.target.tabId).toBe(42);
    expect(options.world).toBe('MAIN');
    expect(options.func).toBe(mainWorldCartAdd);
    // Only the id crosses the boundary: the endpoint and the verb are
    // inside the func, so no caller can retarget the write.
    expect(options.args).toHaveLength(1);
    expect(options.args[0]).toMatchObject({ variantId: 'v7', headers: SITE_API_HEADERS });
  });

  it('runs the removal with the cart item id', async () => {
    const executeScript = stubWriteFlow({ ok: true, json: null });
    await delegateCartRemove(9, 'c7');
    const options = executeScript.mock.calls[0]?.[0] as { func: unknown; args: unknown[] };
    expect(options.func).toBe(mainWorldCartRemove);
    expect(options.args[0]).toMatchObject({ cartItemId: 'c7' });
  });

  it('carries the HTTP status out of the tab (signed-out detection)', async () => {
    stubWriteFlow({
      ok: false,
      errorCode: 'HTTP_STATUS',
      message: 'HTTP 403',
      status: 403,
    });
    await expect(delegateCartAdd(42, 'v8')).rejects.toMatchObject({
      code: 'HTTP_STATUS',
      status: 403,
    });
  });

  it('maps an unreachable tab to NETWORK', async () => {
    const mock = vi.fn(() => Promise.reject(new Error('no tab')));
    vi.stubGlobal('chrome', {
      scripting: { executeScript: mock },
      storage: { local: { set: vi.fn() } },
    });
    await expect(delegateCartRemove(42, 'c1')).rejects.toMatchObject({ code: 'NETWORK' });
  });
});
