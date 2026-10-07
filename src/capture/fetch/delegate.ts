/**
 * Fetch delegation (live finding 2026-10-07; SDD decision log D-16).
 *
 * The checkout cart API answers HTTP 401 to same-session fetches that
 * do not carry the site's routing header set (see site-headers.ts).
 * A service-worker fetch cannot reproduce that header set effectively
 * (its origin is chrome-extension://, not the site's), so capture
 * fetches are DELEGATED to the content script running in the page
 * context: the content script performs the GET with the captured
 * headers, the service worker keeps orchestration, state, and all
 * error handling.
 *
 * Direction: service worker -> content script (chrome.tabs.sendMessage
 * on the tab that started the crawl). The content script is a pure
 * GET executor - it cannot express a write even if asked (D-01),
 * and both sides run the *.digikala.com scope guard (D-02).
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
 * Content script -> service worker: the fetched JSON, or the failure
 * (errorCode is a CaptureError code; HTTP_STATUS messages embed the
 * status, e.g. "HTTP 401 from https://...").
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
 * Executes a delegated GET from the page context with the site's
 * routing header set. Throws the same CaptureError classes as
 * digikalaFetchJson so the orchestrator's containment works
 * unchanged. D-01: GET-only; D-02: scope-guarded.
 */
export async function delegatedFetchJson(url: string): Promise<unknown> {
  assertDigikalaUrl(url);

  let res: Response;
  try {
    res = await fetch(url, {
      method: 'GET', // D-01: the capture pipeline never writes.
      credentials: 'include', // the user's session => effective fees
      headers: { Accept: 'application/json', ...SITE_API_HEADERS },
    });
  } catch (e) {
    throw networkError(e instanceof Error ? e.message : String(e));
  }

  if (!res.ok) throw httpStatusError(res.status, url);

  try {
    return (await res.json()) as unknown;
  } catch {
    throw structureUnrecognized(`response is not JSON: ${url}`);
  }
}

/**
 * Content-script side: answers delegate requests from the service
 * worker. Non-delegate messages are ignored (returns false) so the
 * channel stays free for the capture contract.
 */
export function installFetchDelegateListener(): void {
  chrome.runtime.onMessage.addListener(
    (raw: unknown, _sender, sendResponse: (res: DelegateFetchResponse) => void) => {
      if (!isDelegateFetchRequest(raw)) return false;
      void delegatedFetchJson(raw.url).then(
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
 * Service-worker side: asks the content script on `tabId` to fetch
 * `url` in page context and returns the parsed JSON. Throws the
 * mapped CaptureError (NETWORK when the content script is
 * unreachable, HTTP_STATUS / STRUCTURE_UNRECOGNIZED as reported).
 * D-02: guarded before the message ever leaves.
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
    // The content script already mapped its failure to a CaptureError
    // code + message; rebuild the typed error so containment sees the
    // same classes as a direct fetch.
    throw new CaptureError(res.message, mapErrorCode(res.errorCode));
  }
  return res.json;
}

function mapErrorCode(code: string): CaptureError['code'] {
  return code === 'NETWORK' || code === 'HTTP_STATUS' || code === 'OUT_OF_SCOPE'
    ? code
    : 'STRUCTURE_UNRECOGNIZED';
}
