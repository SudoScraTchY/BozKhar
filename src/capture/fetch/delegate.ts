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
 * D-01: the executor is GET-only and session-credentialed,
 * baked into mainWorldFetch below - no caller can turn a
 * crawl fetch into a write. D-02: the closed *.digikala.com
 * scope is enforced on both sides (here before the tab is
 * touched, and inside the injected func itself).
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
 * Service-worker side: runs a delegated GET in the
 * requesting tab's main world and resolves with the
 * parsed JSON. Rejects with the same CaptureError
 * classes as digikalaFetchJson, so the crawl's
 * per-item containment is unchanged. D-02: guarded
 * here before the tab is touched.
 */
export async function delegateFetchJson(tabId: number, url: string): Promise<unknown> {
  assertDigikalaUrl(url);

  // One nonce per delegated fetch: the outcome
  // attribute persists on the page, so the reader
  // must only accept an outcome written for THIS
  // call.
  const nonce = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: mainWorldFetch,
      args: [{ url, headers: SITE_API_HEADERS, nonce }],
    });
  } catch {
    // The tab is gone or not reachable from the
    // extension (same class of failure as an
    // unreachable content script).
    throw networkError(`main-world execution failed for ${url}`);
  }

  // Poll the page DOM for the outcome. A plain
  // string return from an injected func is the
  // reliable channel (file header, finding
  // 2026-10-08 (5)).
  const deadline = Date.now() + DELEGATE_TIMEOUT_MS;
  for (;;) {
    let frames: chrome.scripting.InjectionResult[];
    try {
      frames = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: readDelegateResult,
      });
    } catch {
      throw networkError(`main-world execution failed for ${url}`);
    }
    const raw = frames?.[0]?.result;
    if (typeof raw === 'string' && raw.startsWith(`${nonce}:`)) {
      const result = JSON.parse(raw.slice(nonce.length + 1)) as DelegateResult;
      if (result.ok) {
        return result.json;
      }
      switch (result.errorCode) {
        case 'HTTP_STATUS':
          throw httpStatusError(typeof result.status === 'number' ? result.status : 0, url);
        case 'NETWORK':
          throw networkError(result.message);
        case 'OUT_OF_SCOPE':
          throw outOfScopeError(url);
        default:
          throw structureUnrecognized(
            `unknown delegate error code "${String(result.errorCode)}" for ${url}`,
          );
      }
    }
    if (Date.now() >= deadline) {
      throw networkError(`no result from the main world for ${url}`);
    }
    await sleep(DELEGATE_POLL_MS);
  }
}
