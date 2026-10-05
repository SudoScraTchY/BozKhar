/**
 * Service-worker fetch for Digikala JSON APIs (spike S-7 architecture note:
 * capture fetch lives in the service worker).
 *
 * Why here and not in the content script: a SW fetch with
 * credentials: 'include' carries the user's session against
 * api.digikala.com, and it sidesteps the content-script CORS regime
 * entirely - the host permission covers api.digikala.com from the SW.
 *
 * D-01 (advise-only): GET-only, enforced below by the caller contract and
 * asserted in tests. D-02: the URL guard refuses any non-*.digikala.com
 * target before a byte moves.
 */
import { httpStatusError, networkError, structureUnrecognized } from '../errors';
import { assertDigikalaUrl } from '../readers/url';

/** Injected raw fetch so tests can audit every call (D-01). */
export type RawFetch = (url: string, init?: RequestInit) => Promise<Response>;

/**
 * Fetches JSON from a Digikala API endpoint with the user's session.
 * Throws CaptureError subclasses: NETWORK / HTTP_STATUS /
 * STRUCTURE_UNRECOGNIZED; the orchestrator contains them per item.
 */
export async function digikalaFetchJson(
  rawUrl: string,
  deps: { fetch: RawFetch } = { fetch: globalThis.fetch },
): Promise<unknown> {
  assertDigikalaUrl(rawUrl); // OUT_OF_SCOPE for anything off *.digikala.com

  let res: Response;
  try {
    res = await deps.fetch(rawUrl, {
      method: 'GET', // D-01: the capture pipeline never writes.
      credentials: 'include', // the user's session => effective fees (spike)
      headers: { Accept: 'application/json' },
    });
  } catch (e) {
    throw networkError(e instanceof Error ? e.message : String(e));
  }

  if (!res.ok) throw httpStatusError(res.status, rawUrl);

  try {
    return (await res.json()) as unknown;
  } catch {
    throw structureUnrecognized(`response is not JSON: ${rawUrl}`);
  }
}
