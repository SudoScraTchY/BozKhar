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
 * and runs the func in the main world directly and
 * returns its value to the service worker, which also
 * removes the postMessage/request-id round trip.
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

/**
 * Runs in the page's MAIN world (injected by the
 * service worker). MUST stay self-contained: it is
 * serialized by value (func.toString()) and cannot
 * close over module scope. GET-only with the user's
 * session credentials (effective fees are
 * login-gated); the method is baked in here - no
 * caller can turn it into a write. Exported for
 * tests (executeScript serializes the func by
 * value, so exporting changes nothing at runtime).
 */
export function mainWorldFetch(url: string, headers: Record<string, string>): Promise<string> {
  // Execution probe (live diagnosis 2026-10-08):
  // written to <html data-dkopt-probe> so we can
  // tell whether this func ran at all in a given
  // Chrome, independent of the result transport.
  document.documentElement.setAttribute('data-dkopt-probe', `ran:${Date.now()}`);

  // D-02 (defense in depth): refuse anything outside
  // the closed *.digikala.com scope before fetching.
  let host = '';
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return Promise.resolve(
      JSON.stringify({
        ok: false,
        errorCode: 'OUT_OF_SCOPE',
        message: `URL outside the closed *.digikala.com scope: ${url}`,
      }),
    );
  }
  if (host !== 'digikala.com' && !host.endsWith('.digikala.com')) {
    return Promise.resolve(
      JSON.stringify({
        ok: false,
        errorCode: 'OUT_OF_SCOPE',
        message: `URL outside the closed *.digikala.com scope: ${url}`,
      }),
    );
  }
  // Time budget for a delegated fetch (the crawl
  // retries per item): a hung response must not
  // stall the crawl. Parity with the postMessage
  // round trip this replaced (same 30s bound).
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DELEGATE_TIMEOUT_MS);
  return fetch(url, {
    method: 'GET',
    credentials: 'include', // the user's session => effective fees
    headers: { Accept: 'application/json', ...headers },
    signal: controller.signal,
  })
    .then(async (res: Response): Promise<string> => {
      clearTimeout(timer);
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // non-JSON body: surfaced as null (the reader rejects it)
      }
      if (!res.ok) {
        return JSON.stringify({
          ok: false,
          errorCode: 'HTTP_STATUS',
          message: `HTTP ${res.status} from ${url}`,
          status: res.status,
        });
      }
      return JSON.stringify({ ok: true, json: body });
    })
    .catch((e: Error): string => {
      clearTimeout(timer);
      return JSON.stringify({
        ok: false,
        errorCode: 'NETWORK',
        message: `Network failure: ${e.message}`,
      });
    });
}

/** Time budget for a delegated fetch (the crawl retries per item). */
const DELEGATE_TIMEOUT_MS = 30_000;

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

  let frames: chrome.scripting.InjectionResult[];
  try {
    frames = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: mainWorldFetch,
      args: [url, SITE_API_HEADERS],
    });
  } catch {
    // The tab is gone or not reachable from the
    // extension (same class of failure as an
    // unreachable content script).
    throw networkError(`main-world execution failed for ${url}`);
  }

  // The injected func transports its result as a
  // JSON string: a plain object return did not
  // survive the trip back in some real Chrome
  // builds (works in the test Chromium; live
  // finding 2026-10-08 (4)).
  const raw = frames?.[0]?.result;
  let result: DelegateResult | undefined;
  if (typeof raw === 'string') {
    try {
      result = JSON.parse(raw) as DelegateResult;
    } catch {
      result = undefined;
    }
  }
  if (!result || typeof result !== 'object') {
    // Diagnosis: read the execution probe back so
    // the service worker console shows whether the
    // injected func ran at all, plus the raw
    // executeScript result.
    let probe: unknown = 'probe-read-failed';
    try {
      const probeFrames = await chrome.scripting.executeScript({
        target: { tabId },
        world: 'MAIN',
        func: () => document.documentElement.getAttribute('data-dkopt-probe'),
      });
      probe = probeFrames?.[0]?.result;
    } catch {
      probe = 'probe-read-threw';
    }
    console.error(
      `[dkopt] no usable result from the main world. raw frames: ${JSON.stringify(frames)}; execution probe: ${JSON.stringify(probe)}`,
    );
    throw networkError(`no result from the main world for ${url}`);
  }
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
