/**
 * Fetch delegation (live finding 2026-10-07; SDD decision log D-16).
 *
 * The checkout cart API answers HTTP 401 to same-session fetches
 * that do not carry the site's routing header set (see
 * site-headers.ts), and its CORS policy only allows the web
 * origin. Two failed executor contexts, both live-verified:
 *   - service worker: request reaches the API, answers 401;
 *   - content-script isolated world: CORS preflight is checked
 *     against the extension origin and blocked ("Failed to
 *     fetch") - the identical main-world fetch returns 200.
 *
 * So the executor runs in the page's MAIN world: the service
 * worker sends a fetch/delegate message to the content script
 * on the requesting tab, which injects a self-contained
 * script into the page. That script fetches with the page's
 * origin (the same CORS regime as the site's own calls) and
 * posts the result back via window.postMessage. The service
 * worker keeps orchestration, state, and all error handling.
 *
 * D-01: GET-only - the method is baked into the injected
 * code, never caller-controlled. D-02: the URL guard runs
 * before anything is injected.
 */
import { CaptureError, httpStatusError, networkError, structureUnrecognized } from '../errors';
import { assertDigikalaUrl } from '../readers/url';
import { SITE_API_HEADERS } from './site-headers';

/** Service worker -> content script: perform this GET in page context. */
export interface DelegateFetchRequest {
  kind: 'fetch/delegate';
  url: string;
}

/**
 * Content script -> service worker: the fetched JSON, or the
 * failure (errorCode is a CaptureError code; HTTP_STATUS
 * messages embed the status, e.g. "HTTP 401 from https://...").
 */
export type DelegateFetchResponse =
  { ok: true; json: unknown } | { ok: false; errorCode: string; message: string };

export function isDelegateFetchRequest(raw: unknown): raw is DelegateFetchRequest {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as { kind?: unknown }).kind === 'fetch/delegate' &&
    typeof (raw as { url?: unknown }).url === 'string'
  );
}

/**
 * Injected into the page's main world. MUST stay
 * self-contained: it is serialized with toString() and
 * cannot close over module scope. D-01: method is GET,
 * baked in here - no caller can turn it into a write.
 */
function mainWorldExecutor(url: string, requestId: string, headers: Record<string, string>): void {
  const report = (payload: Record<string, unknown>): void => {
    window.postMessage({ __dkoptDelegate: requestId, ...payload }, window.location.origin);
  };
  fetch(url, {
    method: 'GET',
    credentials: 'include', // the user's session => effective fees
    headers: { Accept: 'application/json', ...headers },
  })
    .then(async (res: Response) => {
      let body: unknown = null;
      try {
        body = await res.json();
      } catch {
        // non-JSON body: surfaced as null (the reader rejects it)
      }
      report({ ok: res.ok, status: res.status, json: body });
    })
    .catch((e: Error) => report({ ok: false, networkError: e.message }));
}

/** Default injection: a classic script tag executes synchronously. */
function injectIntoMainWorld(code: string): void {
  const script = document.createElement('script');
  script.textContent = code;
  (document.head ?? document.documentElement).appendChild(script);
  script.remove(); // already executed; the fetch is in flight
}

/** Time budget for a delegated fetch (the crawl retries per item). */
const DELEGATE_TIMEOUT_MS = 30_000;

/**
 * Runs a delegated GET in the page's main world and resolves
 * with the parsed JSON. Rejects with the same CaptureError
 * classes as digikalaFetchJson. D-02: guarded first.
 */
export function runDelegatedFetchInMainWorld(
  url: string,
  deps: { inject(code: string): void } = { inject: injectIntoMainWorld },
): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    // D-02: guarded before anything is injected (a throw
    // here rejects the returned promise).
    assertDigikalaUrl(url);

    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    const onMessage = (event: MessageEvent): void => {
      const data = event.data;
      if (
        typeof data !== 'object' ||
        data === null ||
        (data as { __dkoptDelegate?: unknown }).__dkoptDelegate !== requestId
      ) {
        return; // not ours (the page posts its own messages too)
      }
      window.removeEventListener('message', onMessage);
      clearTimeout(timer);
      const d = data as {
        ok?: boolean;
        status?: number;
        json?: unknown;
        networkError?: string;
      };
      if (typeof d.networkError === 'string') {
        reject(networkError(d.networkError));
        return;
      }
      if (d.ok !== true) {
        reject(httpStatusError(typeof d.status === 'number' ? d.status : 0, url));
        return;
      }
      resolve(d.json);
    };

    const timer = setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(networkError('main-world fetch did not report back in time'));
    }, DELEGATE_TIMEOUT_MS);

    window.addEventListener('message', onMessage);
    deps.inject(
      `(${mainWorldExecutor.toString()})(${JSON.stringify(url)}, ${JSON.stringify(requestId)}, ${JSON.stringify(SITE_API_HEADERS)});`,
    );
  });
}

/**
 * Content-script side: answers delegate requests from the
 * service worker by executing them in the page's main
 * world. Non-delegate messages are ignored (returns false)
 * so the channel stays free for the capture contract.
 * The inject dependency exists for tests (jsdom does not
 * execute injected scripts); production uses the default.
 */
export function installFetchDelegateListener(
  deps: { inject(code: string): void } = { inject: injectIntoMainWorld },
): void {
  chrome.runtime.onMessage.addListener(
    (raw: unknown, _sender, sendResponse: (res: DelegateFetchResponse) => void) => {
      if (!isDelegateFetchRequest(raw)) return false;
      void runDelegatedFetchInMainWorld(raw.url, deps).then(
        (json) => sendResponse({ ok: true, json }),
        (e) =>
          sendResponse({
            ok: false,
            errorCode:
              e instanceof Error && 'code' in e ? String((e as { code: unknown }).code) : 'UNKNOWN',
            message: e instanceof Error ? e.message : String(e),
          }),
      );
      return true; // async response
    },
  );
}

/**
 * Service-worker side: asks the content script on `tabId`
 * to fetch `url` in the page context and returns the
 * parsed JSON. Throws the mapped CaptureError (NETWORK
 * when the content script is unreachable, HTTP_STATUS /
 * STRUCTURE_UNRECOGNIZED as reported). D-02: guarded
 * before the message ever leaves.
 */
export async function delegateFetchJson(tabId: number, url: string): Promise<unknown> {
  assertDigikalaUrl(url);

  let res: DelegateFetchResponse;
  try {
    res = (await chrome.tabs.sendMessage(tabId, {
      kind: 'fetch/delegate',
      url,
    })) as DelegateFetchResponse;
  } catch (e) {
    throw networkError(
      `content script unreachable on tab ${tabId}: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  if (typeof res !== 'object' || res === null || !('ok' in res)) {
    throw structureUnrecognized('malformed delegate response');
  }
  if (!res.ok) {
    // The content script already mapped its failure to a
    // CaptureError code + message; rebuild the typed error
    // so containment sees the same classes as a direct fetch.
    throw new CaptureError(res.message, mapErrorCode(res.errorCode));
  }
  return res.json;
}

function mapErrorCode(code: string): CaptureError['code'] {
  return code === 'NETWORK' || code === 'HTTP_STATUS' || code === 'OUT_OF_SCOPE'
    ? code
    : 'STRUCTURE_UNRECOGNIZED';
}
