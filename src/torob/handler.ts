/**
 * Torob comparison handler (runs in the MV3 worker so the host permission
 * applies and no page-origin request is needed).
 *
 * Only the public product title leaves the browser, only after a click.
 * Both requests omit credentials and referrers (D-42).
 */
import {
  normalizeTorobComparison,
  pickTorobProduct,
  torobDetailsApiUrl,
  torobSearchApiUrl,
  torobSearchUrl,
  type TorobComparison,
  type TorobErrorCode,
  type TorobResponse,
} from './api';

export type TorobFetch = (url: string, init?: RequestInit) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 12_000;
const MAX_QUERY_CHARS = 200;

class TorobFailure extends Error {
  constructor(
    public readonly errorCode: TorobErrorCode,
    message: string,
    public readonly status?: number,
  ) {
    super(message);
  }
}

async function fetchJson(fetchFn: TorobFetch, url: string): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchFn(url, {
      method: 'GET',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new TorobFailure('NETWORK', 'could not reach Torob');
  }

  if (!response.ok) {
    throw new TorobFailure(
      'HTTP_STATUS',
      `Torob returned HTTP ${response.status}`,
      response.status,
    );
  }

  try {
    return (await response.json()) as unknown;
  } catch {
    throw new TorobFailure('STRUCTURE_UNRECOGNIZED', 'Torob response was not JSON');
  }
}

function emptyComparison(query: string): TorobComparison {
  return {
    query,
    searchUrl: torobSearchUrl(query),
    productName: null,
    productUrl: null,
    offers: [],
    shopCount: 0,
  };
}

export async function handleTorobCompare(
  fetchFn: TorobFetch,
  rawQuery: unknown,
): Promise<TorobResponse> {
  const query = typeof rawQuery === 'string' ? rawQuery.trim().slice(0, MAX_QUERY_CHARS) : '';
  if (query.length < 2) {
    return { ok: false, errorCode: 'BAD_REQUEST', message: 'a product title is required' };
  }

  try {
    const searchPayload = await fetchJson(fetchFn, torobSearchApiUrl(query));
    const product = pickTorobProduct(query, searchPayload);
    if (!product) {
      return { ok: true, kind: 'torob/compare', comparison: emptyComparison(query) };
    }

    const detailsPayload = await fetchJson(fetchFn, torobDetailsApiUrl(product.prk));
    return {
      ok: true,
      kind: 'torob/compare',
      comparison: normalizeTorobComparison(query, searchPayload, detailsPayload),
    };
  } catch (error) {
    if (error instanceof TorobFailure) {
      return {
        ok: false,
        errorCode: error.errorCode,
        message: error.message,
        ...(error.status === undefined ? {} : { status: error.status }),
      };
    }
    return { ok: false, errorCode: 'RUNTIME', message: 'comparison failed unexpectedly' };
  }
}
