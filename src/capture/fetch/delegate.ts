/**
 * Fetch delegation (D-16, amended 2026-10-08): the
 * crawl's GETs execute in the requesting tab's page
 * MAIN world via chrome.scripting.executeScript.
 *
 * Why the main world: the checkout API's CORS policy
 * allows only the web origin. Live-verified 2026-10-07:
 * the service worker's own fetch (origin
 * chrome-extension://) reaches the API but answers 401,
 * and a content-script isolated-world fetch is blocked
 * at the preflight. The identical main-world fetch
 * returns 200.
 *
 * Why executeScript: the classic workaround (a content
 * script inserting a <script> tag into the page head)
 * does not execute in the current Chromium -
 * live-verified 2026-10-08: elements appended to the
 * correct document.head never run in any world (no
 * console output, no postMessage, no side effects,
 * with no CSP on the page). The official API injects
 * and runs the func in the main world directly.
 *
 * How the result travels back (live finding
 * 2026-10-08 (5)): executeScript's RETURN VALUE is
 * not reliable across Chrome builds - a promise
 * returned by the injected func came back as null
 * in the crawl path (the func verifiably ran: its
 * DOM side effect was present), in both the test
 * Chromium and the user's real Chrome 154, while
 * direct (non-promise) string returns from injected
 * funcs work in every tested Chrome. So the injected
 * func writes its outcome to the page DOM
 * (<html data-dkopt-result>) and the service worker
 * reads it back by polling a tiny reader func whose
 * return is a plain string. The nonce (one per
 * delegated fetch) keeps a stale outcome from a
 * previous fetch from being mistaken for the
 * current one.
 *
 * Self-containment (live finding 2026-10-08 (7)):
 * executeScript serializes the func by value
 * (func.toString()) and evaluates it in the page -
 * it cannot see the extension's module scope. The
 * bundler's minifier hoists module-level constants
 * to shared bindings and rewrites the func to
 * reference them; the injected code then dies on a
 * ReferenceError before its first real statement
 * (silently - executeScript resolves with a null
 * result). Every constant the injected funcs use
 * is therefore a literal INSIDE the func body, and
 * each literal appears exactly once so the minifier
 * keeps it inline (a literal used twice gets
 * hoisted to a module binding again). The
 * self-containment test below guards the source;
 * Phase B verifies the built output end to end.
 *
 * Cost: the "scripting" permission (NFR-06 requires a
 * decision-log entry - recorded under D-16).
 *
 * D-01: the GET executor is GET-only and session-credentialed,
 * baked into mainWorldFetch below - no caller can turn a
 * crawl fetch into a write. D-19 adds the one sanctioned
 * exception: mainWorldShipmentQuote, whose method is baked
 * in as 'POST' and whose URL and body the service worker
 * fixes to the shipment-quote endpoint (a read-only quote
 * that does not modify the cart). D-30 adds the two cart
 * writes the apply flow needs (D-26): mainWorldCartAdd and
 * mainWorldCartRemove bake in both the verb and the endpoint
 * URL, take only an id, publish an IN_FLIGHT checkpoint
 * before the request leaves (a retried injection must not
 * add twice) and are reachable only through the user-
 * initiated apply flow. D-02: the closed
 * *.digikala.com scope is enforced on both sides (here
 * before the tab is touched, and inside the injected
 * func itself).
 */
import { httpStatusError, networkError, outOfScopeError, structureUnrecognized } from '../errors';
import { assertDigikalaUrl } from '../readers/url';
import { SITE_API_HEADERS } from './site-headers';

/**
 * Result contract between the service worker and the
 * injected main-world func. Errors travel as data
 * (never thrown across the injection boundary), so
 * the worker maps them to the same CaptureError
 * classes digikalaFetchJson uses.
 */
type DelegateResult =
  { ok: true; json: unknown } | { ok: false; errorCode: string; message: string; status?: number };

/** How often the worker re-reads the outcome. */
const DELEGATE_POLL_MS = 120;

/**
 * D-19: the shipment-quote endpoint and its fixed
 * request body. The extension's only POST targets
 * exactly this URL with exactly this body (a
 * read-only quote query - it returns per-package
 * delivery pricing and does not modify the cart).
 * Fixed at module level here; the SW passes them
 * as fetch args (args are serialized by value, so
 * module constants are safe to pass).
 */
export const SHIPMENT_API_URL = 'https://api.digikala.com/v4/shipment/';
export const SHIPMENT_API_BODY = '{"is_initial_load":true}';

/** Time budget for a delegated fetch (the crawl retries per item). */
const DELEGATE_TIMEOUT_MS = 30_000;

/**
 * Runs in the page's MAIN world (injected by the
 * service worker). MUST stay self-contained: it is
 * serialized by value (func.toString()) and cannot
 * close over module scope - every constant it
 * needs is a literal inside the body, each
 * appearing exactly once (see the file header,
 * finding 2026-10-08 (7)). GET-only with the
 * user's session credentials (effective fees are
 * login-gated); the method is baked in here - no
 * caller can turn it into a write. Every outcome
 * (including the synchronous scope refusals) is
 * written to <html data-dkopt-result> prefixed
 * with the per-call nonce; the return value is
 * deliberately ignored by the caller (finding
 * 2026-10-08 (5)). Exported for tests
 * (executeScript serializes the func by value, so
 * exporting changes nothing at runtime).
 */
export function mainWorldFetch(args: {
  url: string;
  headers: Record<string, string>;
  nonce: string;
}): void {
  const { url, headers, nonce } = args;

  // The single write path: the
  // attribute literal appears
  // exactly once, inside this
  // func, so the minifier cannot
  // hoist it to a module binding
  // the injected code could not
  // see (finding 2026-10-08 (7)).
  const write = (value: string): void => {
    document.documentElement.setAttribute('data-dkopt-result', value);
  };
  const finish = (outcome: DelegateResult): void => {
    write(`${nonce}:${JSON.stringify(outcome)}`);
  };

  // D-02 (defense in depth): refuse anything outside
  // the closed *.digikala.com scope before fetching.
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    finish({
      ok: false,
      errorCode: 'OUT_OF_SCOPE',
      message: `URL outside the closed *.digikala.com scope: ${url}`,
    });
    return;
  }
  if (host !== 'digikala.com' && !host.endsWith('.digikala.com')) {
    finish({
      ok: false,
      errorCode: 'OUT_OF_SCOPE',
      message: `URL outside the closed *.digikala.com scope: ${url}`,
    });
    return;
  }
  // Time budget for a delegated fetch (the crawl
  // retries per item): a hung response must not
  // stall the crawl. Parity with the postMessage
  // round trip this replaced (same 30s bound).
  // The budget is a literal here (same
  // self-containment rule as the
  // attribute name above).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  fetch(url, {
    method: 'GET',
    credentials: 'include', // the user's session => effective fees
    headers: { Accept: 'application/json', ...headers },
    signal: controller.signal,
  })
    .then(async (res: Response) => {
      clearTimeout(timer);
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // non-JSON body: surfaced as null (the reader rejects it)
      }
      if (!res.ok) {
        finish({
          ok: false,
          errorCode: 'HTTP_STATUS',
          message: `HTTP ${res.status} from ${url}`,
          status: res.status,
        });
        return;
      }
      finish({ ok: true, json: body });
    })
    .catch((e: Error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        errorCode: 'NETWORK',
        message: `Network failure: ${e.message}`,
      });
    });
}

/**
 * Reads the delegated fetch outcome from the page
 * DOM. Runs in the tab's MAIN world (injected by
 * the service worker); its return value is a plain
 * string, which is the one return shape proven to
 * survive executeScript in every tested Chrome
 * (finding 2026-10-08 (5)). Self-contained by
 * construction (the attribute literal appears
 * once); exported for the same reason as
 * mainWorldFetch.
 */
export function readDelegateResult(): string | null {
  return document.documentElement.getAttribute('data-dkopt-result');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Timing for main-world execution. Kept in a
 * mutable object so tests can shrink the
 * timeouts; production never touches it.
 */
export const EXECUTE_TIMING = {
  timeoutMs: 8_000,
  attempts: 3,
  retryDelayMs: 300,
};

/**
 * Bounds a chrome.scripting.executeScript call.
 * Live finding 2026-10-09: a cold MV3 service
 * worker sometimes never invokes the
 * executeScript callback - the crawl then hung
 * on "starting cart review..." with no request
 * ever issued (the user's 2026-10-08 stuck
 * report). The timeout turns the hang into a
 * normal rejection the caller retries or
 * contains.
 */
function withTimeout<T>(call: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(networkError(`${what} timed out after ${ms}ms`)), ms);
    call.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Runs func in the tab's MAIN world, retrying
 * when the executeScript callback never arrives.
 * A retried read is idempotent (a GET fetch or
 * the fixed quote POST), and the outcome channel
 * is keyed by the caller's nonce. The cart WRITE
 * funcs (D-30) are not idempotent, so they carry
 * their own at-most-once guard keyed by that same
 * nonce.
 */
async function executeMainWorld(
  tabId: number,
  func: (...args: never[]) => unknown,
  args: unknown[] | undefined,
  what: string,
): Promise<chrome.scripting.InjectionResult[]> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= EXECUTE_TIMING.attempts; attempt += 1) {
    try {
      return await withTimeout(
        Promise.resolve(
          chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func,
            ...(args !== undefined ? { args } : {}),
          }),
        ),
        EXECUTE_TIMING.timeoutMs,
        `${what} (attempt ${attempt})`,
      );
    } catch (error) {
      lastError = error;
      await sleep(EXECUTE_TIMING.retryDelayMs);
    }
  }
  throw networkError(`main-world execution failed for ${what}: ${String(lastError)}`);
}

/**
 * Service-worker side: runs func in the tab's MAIN world, then
 * waits for the outcome the injected func publishes. Rejects with
 * the same CaptureError classes as digikalaFetchJson, so callers'
 * containment is unchanged. D-02: callers guard the scope before
 * the tab is touched.
 *
 * The poll loop is shared by every delegated call (D-30). A write
 * publishes an `IN_FLIGHT` checkpoint before its request leaves,
 * so that value means "keep waiting", never "finished".
 */
async function awaitDelegateOutcome(tabId: number, nonce: string, what: string): Promise<unknown> {
  // Poll the page DOM for the outcome. A plain
  // string return from an injected func is the
  // reliable channel (file header, finding
  // 2026-10-08 (5)). A read whose callback is
  // lost counts as "no outcome yet": the
  // deadline bounds the loop.
  const deadline = Date.now() + DELEGATE_TIMEOUT_MS;
  for (;;) {
    let raw: string | null = null;
    try {
      const frames = await withTimeout(
        Promise.resolve(
          chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            func: readDelegateResult,
          }),
        ),
        EXECUTE_TIMING.timeoutMs,
        `readDelegateResult for ${what}`,
      );
      const value = frames?.[0]?.result;
      raw = typeof value === 'string' ? value : null;
    } catch {
      raw = null;
    }
    if (raw !== null && raw.startsWith(`${nonce}:`)) {
      const result = JSON.parse(raw.slice(nonce.length + 1)) as DelegateResult;
      if (result.ok) {
        return result.json;
      }
      if (result.errorCode !== 'IN_FLIGHT') {
        switch (result.errorCode) {
          case 'HTTP_STATUS':
            throw httpStatusError(typeof result.status === 'number' ? result.status : 0, what);
          case 'NETWORK':
            throw networkError(result.message);
          case 'OUT_OF_SCOPE':
            throw outOfScopeError(what);
          default:
            throw structureUnrecognized(
              `unknown delegate error code "${String(result.errorCode)}" for ${what}`,
            );
        }
      }
    }
    if (Date.now() >= deadline) {
      throw networkError(`no result from the main world for ${what}`);
    }
    await sleep(DELEGATE_POLL_MS);
  }
}

/**
 * Shared sender for the delegated GET executors. The site routing
 * header set is a checkout-cart-API requirement; some profile
 * endpoints reject it at the CORS preflight, which is why the
 * insights transport can retry the identical GET with no extra
 * headers (delegateFetchJsonBare).
 */
async function delegateGetWithHeaders(
  tabId: number,
  url: string,
  headers: Record<string, string>,
): Promise<unknown> {
  assertDigikalaUrl(url);

  // One nonce per delegated fetch: the outcome
  // attribute persists on the page, so the reader
  // must only accept an outcome written for THIS
  // call.
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await executeMainWorld(
      tabId,
      mainWorldFetch,
      [{ url, headers, nonce }],
      `mainWorldFetch ${url}`,
    );
  } catch {
    // The tab is gone or not reachable from the
    // extension (same class of failure as an
    // unreachable content script).
    throw networkError(`main-world execution failed for ${url}`);
  }

  return awaitDelegateOutcome(tabId, nonce, url);
}

/**
 * Service-worker side: runs a delegated GET in the
 * requesting tab's main world and resolves with the
 * parsed JSON. Rejects with the same CaptureError
 * classes as digikalaFetchJson, so the crawl's
 * per-item containment is unchanged. D-02: guarded
 * here before the tab is touched.
 */
export async function delegateFetchJson(tabId: number, url: string): Promise<unknown> {
  return delegateGetWithHeaders(tabId, url, SITE_API_HEADERS);
}

/**
 * The same delegated GET with only the `Accept` header. Order-profile
 * endpoints answer the header-less main-world request; a CORS
 * preflight rejection of the routing headers surfaces here as a
 * NETWORK failure, and the insights transport retries once with this.
 * Still GET-only, session-credentialed and inside *.digikala.com.
 */
export async function delegateFetchJsonBare(tabId: number, url: string): Promise<unknown> {
  return delegateGetWithHeaders(tabId, url, {});
}

/**
 * Page MAIN world: the cart WRITE (D-30, amending D-26's apply flow).
 *
 * Same contract as the other injected funcs: self-contained (every
 * constant a literal inside the body - see the file header,
 * finding 2026-10-08 (7)), the outcome travels over
 * <html data-dkopt-result> nonce-prefixed, and the return value is
 * ignored.
 *
 * Two guarantees beyond the GET executor:
 *  - the endpoint and the verb are literally baked in, so no caller
 *    can aim this at another path;
 *  - at-most-once: the worker retries an injection whose callback
 *    was lost, and a retried add would otherwise buy a second unit.
 *    An outcome already published under this call's nonce - or the
 *    IN_FLIGHT checkpoint this func writes before the request
 *    leaves - ends the retry without fetching again.
 */
export function mainWorldCartAdd(args: {
  variantId: string;
  headers: Record<string, string>;
  nonce: string;
}): void {
  const { variantId, headers, nonce } = args;

  const write = (value: string): void => {
    document.documentElement.setAttribute('data-dkopt-result', value);
  };
  const finish = (outcome: DelegateResult): void => {
    write(`${nonce}:${JSON.stringify(outcome)}`);
  };

  const published = document.documentElement.getAttribute('data-dkopt-result');
  if (published !== null && published.startsWith(`${nonce}:`)) return;

  const endpoint = 'https://api.digikala.com/checkout/v1/carts/items';

  // D-02 (defense in depth): the closed
  // *.digikala.com scope is re-checked here.
  let host = '';
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    finish({ ok: false, errorCode: 'OUT_OF_SCOPE', message: 'the cart endpoint is not a URL' });
    return;
  }
  if (host !== 'digikala.com' && !host.endsWith('.digikala.com')) {
    finish({
      ok: false,
      errorCode: 'OUT_OF_SCOPE',
      message: 'the cart endpoint is outside the closed scope',
    });
    return;
  }

  // Announce the write BEFORE it leaves: a retry must see it.
  finish({ ok: false, errorCode: 'IN_FLIGHT', message: 'the cart write is in flight' });

  // No blind retry inside the func: an add is not idempotent
  // (apply.ts re-reads the cart instead).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  fetch(endpoint, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ variant_ids: [variantId] }),
    signal: controller.signal,
  })
    .then(async (res: Response) => {
      clearTimeout(timer);
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // an empty body is the normal success shape
      }
      if (!res.ok) {
        finish({
          ok: false,
          errorCode: 'HTTP_STATUS',
          message: `HTTP ${res.status} from the cart API`,
          status: res.status,
        });
        return;
      }
      finish({ ok: true, json: body });
    })
    .catch((e: Error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        errorCode: 'NETWORK',
        message: `Network failure: ${e.message}`,
      });
    });
}

/**
 * Page MAIN world: the cart row removal (D-30). Same contract as
 * mainWorldCartAdd, one verb down: the endpoint and 'DELETE' are
 * baked in, the body names the row to drop, and the at-most-once
 * checkpoint keeps a lost callback from removing twice.
 */
export function mainWorldCartRemove(args: {
  cartItemId: string;
  headers: Record<string, string>;
  nonce: string;
}): void {
  const { cartItemId, headers, nonce } = args;

  const write = (value: string): void => {
    document.documentElement.setAttribute('data-dkopt-result', value);
  };
  const finish = (outcome: DelegateResult): void => {
    write(`${nonce}:${JSON.stringify(outcome)}`);
  };

  const published = document.documentElement.getAttribute('data-dkopt-result');
  if (published !== null && published.startsWith(`${nonce}:`)) return;

  const endpoint = 'https://api.digikala.com/checkout/v1/carts/items';

  let host = '';
  try {
    host = new URL(endpoint).hostname.toLowerCase();
  } catch {
    finish({ ok: false, errorCode: 'OUT_OF_SCOPE', message: 'the cart endpoint is not a URL' });
    return;
  }
  if (host !== 'digikala.com' && !host.endsWith('.digikala.com')) {
    finish({
      ok: false,
      errorCode: 'OUT_OF_SCOPE',
      message: 'the cart endpoint is outside the closed scope',
    });
    return;
  }

  finish({ ok: false, errorCode: 'IN_FLIGHT', message: 'the cart write is in flight' });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  fetch(endpoint, {
    method: 'DELETE',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ cartItemIds: [cartItemId] }),
    signal: controller.signal,
  })
    .then(async (res: Response) => {
      clearTimeout(timer);
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // an empty body is the normal success shape
      }
      if (!res.ok) {
        finish({
          ok: false,
          errorCode: 'HTTP_STATUS',
          message: `HTTP ${res.status} from the cart API`,
          status: res.status,
        });
        return;
      }
      finish({ ok: true, json: body });
    })
    .catch((e: Error) => {
      clearTimeout(timer);
      finish({
        ok: false,
        errorCode: 'NETWORK',
        message: `Network failure: ${e.message}`,
      });
    });
}

/** Service-worker side: one delegated cart add (D-30). */
export async function delegateCartAdd(tabId: number, variantId: string): Promise<unknown> {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await executeMainWorld(
      tabId,
      mainWorldCartAdd,
      [{ variantId, headers: SITE_API_HEADERS, nonce }],
      'mainWorldCartAdd',
    );
  } catch {
    throw networkError('main-world execution failed for the cart add');
  }
  return awaitDelegateOutcome(tabId, nonce, 'cart add');
}

/** Service-worker side: one delegated cart row removal (D-30). */
export async function delegateCartRemove(tabId: number, cartItemId: string): Promise<unknown> {
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await executeMainWorld(
      tabId,
      mainWorldCartRemove,
      [{ cartItemId, headers: SITE_API_HEADERS, nonce }],
      'mainWorldCartRemove',
    );
  } catch {
    throw networkError('main-world execution failed for the cart removal');
  }
  return awaitDelegateOutcome(tabId, nonce, 'cart removal');
}

/**
 * Page MAIN world: the shipment-quote query (D-19).
 *
 * The extension's ONLY POST: a fixed, read-only quote
 * request to the checkout shipment API (it returns
 * per-package delivery pricing for the current cart;
 * it does not modify the cart). The method is baked
 * in here as a literal - no caller can turn it into
 * a GET or any other verb - and the service-worker
 * wrapper (delegateShipmentQuote) fixes the URL and
 * body to the quote endpoint. Same self-containment
 * contract as mainWorldFetch: every constant is a
 * literal inside this func, each appearing exactly
 * once, so the minifier cannot hoist it to a module
 * binding the injected copy could not see.
 *
 * Header note (live preflight probe 2026-10-09):
 * the routing header set (x-site / x-source /
 * x-web-optimize-response) is REJECTED by this
 * endpoint's CORS preflight - a POST carrying it
 * fails with "Failed to fetch", while the same
 * POST with only Content-Type answers 200. The
 * quote endpoint authenticates with the session
 * cookie alone; the routing markers are a
 * checkout-cart-API requirement, not a shipment
 * one.
 */
export function mainWorldShipmentQuote(args: { url: string; nonce: string; body: string }): void {
  const { url, nonce, body } = args;

  // The single write path (same channel and
  // nonce contract as mainWorldFetch; the
  // literal appears once, inside this func).
  const write = (value: string): void => {
    document.documentElement.setAttribute('data-dkopt-result', value);
  };
  const finish = (outcome: DelegateResult): void => {
    write(`${nonce}:${JSON.stringify(outcome)}`);
  };

  // D-02 (defense in depth): refuse anything outside
  // the closed *.digikala.com scope before fetching.
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    finish({
      ok: false,
      errorCode: 'OUT_OF_SCOPE',
      message: `URL outside the closed *.digikala.com scope: ${url}`,
    });
    return;
  }
  if (host !== 'digikala.com' && !host.endsWith('.digikala.com')) {
    finish({
      ok: false,
      errorCode: 'OUT_OF_SCOPE',
      message: `URL outside the closed *.digikala.com scope: ${url}`,
    });
    return;
  }

  // The crawl bursts several API reads before the
  // quote; the shipment endpoint's preflight
  // sometimes rejects under that burst ("Failed
  // to fetch" - a CORS/preflight rejection, not
  // an HTTP error, and it fails fast). Bounded
  // retry with a backoff that can clear the
  // window; the crawl is never blocked more than
  // a few seconds by it.
  const QUOTE_ATTEMPTS = 3;
  const QUOTE_BACKOFF_MS = 2000;
  const attemptFetch = (attempt: number): void => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2_500);
    fetch(url, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    })
      .then(async (res: Response) => {
        clearTimeout(timer);
        let json: unknown = null;
        try {
          json = await res.json();
        } catch {
          // non-JSON body: surfaced as null (the reader rejects it)
        }
        if (!res.ok) {
          // A rate-limit or server hiccup on a read-only
          // quote is retryable; anything else is final.
          if (attempt < QUOTE_ATTEMPTS && (res.status === 429 || res.status >= 500)) {
            setTimeout(() => attemptFetch(attempt + 1), QUOTE_BACKOFF_MS);
            return;
          }
          finish({
            ok: false,
            errorCode: 'HTTP_STATUS',
            message: `HTTP ${res.status} from ${url}`,
            status: res.status,
          });
          return;
        }
        finish({ ok: true, json });
      })
      .catch((e: Error) => {
        clearTimeout(timer);
        if (attempt < QUOTE_ATTEMPTS) {
          setTimeout(() => attemptFetch(attempt + 1), QUOTE_BACKOFF_MS);
          return;
        }
        finish({
          ok: false,
          errorCode: 'NETWORK',
          message: `Network failure: ${e.message}`,
        });
      });
  };
  attemptFetch(1);
}

/**
 * Service-worker side: runs the fixed shipment-quote
 * POST (D-19) in the requesting tab's main world and
 * resolves with the parsed JSON. The URL and body are
 * fixed here - the injected func can only ever quote
 * this endpoint, never another, and never another verb.
 */
export async function delegateShipmentQuote(
  tabId: number,
  url: string,
  body: string,
): Promise<unknown> {
  assertDigikalaUrl(url);

  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await executeMainWorld(
      tabId,
      mainWorldShipmentQuote,
      [{ url, nonce, body }],
      `mainWorldShipmentQuote ${url}`,
    );
  } catch {
    // The tab is gone or not reachable from the
    // extension (same class of failure as an
    // unreachable content script).
    throw networkError(`main-world execution failed for ${url}`);
  }

  // Same polling channel as delegateFetchJson
  // (finding 2026-10-08 (5)): a plain string
  // return from an injected func is the reliable
  // one. A read whose callback is lost counts as
  // "no outcome yet": the deadline bounds us.
  return awaitDelegateOutcome(tabId, nonce, url);
}
