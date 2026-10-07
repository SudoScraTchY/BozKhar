/**
 * The routing header set the Digikala web client attaches to its
 * api.digikala.com calls.
 *
 * Provenance (live capture 2026-10-07, CDP Network domain on the
 * site's own requests): every checkout-scoped call the site makes
 * carries exactly these three markers. The checkout cart API
 * answers HTTP 401 to same-session fetches that omit them - a
 * page-context fetch with this exact header set was verified to
 * flip 401 -> 200 against the real logged-in session, while the
 * identical fetch without them (and from the extension's own
 * origin) 401s.
 *
 * These are non-secret app-routing markers (site channel / client
 * kind / response optimization opt-in), NOT credentials: no
 * Authorization header exists on these calls, and the values are
 * static strings observed on ordinary site traffic. If the site
 * ever rotates them, the fetch delegate logs 401s and the
 * live-shape fixtures will drift - re-capture via CDP then.
 */
export const SITE_API_HEADERS: Record<string, string> = {
  'x-site': 'DIGIKALA',
  'x-source': 'WEB',
  'x-web-optimize-response': '1',
};
