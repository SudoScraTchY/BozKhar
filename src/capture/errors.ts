/**
 * Typed capture errors (SDD 06: per-item failure containment).
 *
 * A failing item must never abort the crawl: each error class is
 * user-surfaceable and the orchestrator catches CaptureError per item.
 */

/** Base class - catch this to contain a per-item failure. */
export class CaptureError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NETWORK'
      | 'HTTP_STATUS'
      | 'STRUCTURE_UNRECOGNIZED'
      | 'NO_OFFERS'
      | 'NO_FEE_FOUND'
      | 'OUT_OF_SCOPE',
  ) {
    super(message);
    this.name = 'CaptureError';
  }
}

export function networkError(detail: string): CaptureError {
  return new CaptureError(`Network failure: ${detail}`, 'NETWORK');
}

export function httpStatusError(status: number, url: string): CaptureError {
  return new CaptureError(`HTTP ${status} from ${url}`, 'HTTP_STATUS');
}

/** The JSON API responded but the payload does not match documented shapes. */
export function structureUnrecognized(detail: string): CaptureError {
  return new CaptureError(`Payload structure unrecognized: ${detail}`, 'STRUCTURE_UNRECOGNIZED');
}

export function noOffersError(itemLabel: string): CaptureError {
  return new CaptureError(`No offers found for ${itemLabel}`, 'NO_OFFERS');
}

/**
 * No fee information at all in the payload. Note: a *known-absent* fee
 * (providers: [] / no price key = FBM) is NOT an error - it normalizes to
 * feeAmount null with provenance page-visible. This error is for payloads
 * too malformed to even locate the fee section.
 */
export function noFeeFoundError(detail: string): CaptureError {
  return new CaptureError(`Fee section missing from payload: ${detail}`, 'NO_FEE_FOUND');
}

/** Navigation outside *.digikala.com attempted - refused (D-02/D-03, NFR-07). */
export function outOfScopeError(url: string): CaptureError {
  return new CaptureError(`URL outside the closed *.digikala.com scope: ${url}`, 'OUT_OF_SCOPE');
}
