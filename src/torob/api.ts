/**
 * Torob comparison contract (D-42).
 *
 * The extension only talks to Torob after an explicit user click on the
 * PDP trigger, and sends nothing but the public product title. Requests are
 * credentialed-off and referrer-free; seller rows are normalized in the
 * worker so the raw payloads never cross the message boundary.
 *
 * Endpoints (live-verified 2026-10-20):
 *  - GET /v4/base-product/search/?q=…   product candidates (+ cheapest price)
 *  - GET /v4/base-product/details/?prk=… seller rows for one product
 *
 * Note: the search parameter is `q`, not `query` - `query` is accepted but
 * returns a generic feed.
 */

export const TOROB_SEARCH_URL = 'https://api.torob.com/v4/base-product/search/';
export const TOROB_DETAILS_URL = 'https://api.torob.com/v4/base-product/details/';
export const TOROB_OFFER_LIMIT = 5;

export interface TorobOffer {
  shopName: string;
  city: string | null;
  priceToman: number;
  url: string | null;
  scoreText: string | null;
  postage: string | null;
}

export interface TorobComparison {
  query: string;
  searchUrl: string;
  productName: string | null;
  productUrl: string | null;
  /** Cheapest first, at most TOROB_OFFER_LIMIT rows. */
  offers: TorobOffer[];
  /** Total sellers Torob reports for the product, not the returned slice. */
  shopCount: number;
}

/** Search categories for the all-listings price range (D-48). */
export type TorobRangeCategoryKey = 'installment' | 'any';

export interface TorobRangeListing {
  prk: string;
  name: string;
  /** The listing's own cheapest price; Torob search cards are "از ...". */
  priceToman: number;
  shopCount: number;
  url: string | null;
}

export interface TorobCategoryRange {
  category: TorobRangeCategoryKey;
  /** Cheapest listing price, Toman; null when no relevant listing matched. */
  minToman: number | null;
  /**
   * Upper boundary: the 3rd cheapest distinct listing price, falling back to
   * the 2nd and then the listing itself when fewer products exist.
   */
  upperToman: number | null;
  /** Which distinct price set the upper boundary (1 = single price). */
  upperBasis: 1 | 2 | 3;
  /** Up to three distinct cheapest prices, ascending. */
  pricesToman: number[];
  listingCount: number;
  /** Cheapest matched listings, ascending (up to three). */
  listings: TorobRangeListing[];
}

export interface TorobRangeReport {
  query: string;
  searchUrl: string;
  /** Installment first, then unfiltered. */
  categories: TorobCategoryRange[];
}

export type TorobErrorCode =
  'BAD_REQUEST' | 'NETWORK' | 'HTTP_STATUS' | 'STRUCTURE_UNRECOGNIZED' | 'RUNTIME';

export type TorobRequest =
  { kind: 'torob/compare'; query: string } | { kind: 'torob/range'; query: string };

export type TorobResponse =
  | { ok: true; kind: 'torob/compare'; comparison: TorobComparison }
  | { ok: false; errorCode: TorobErrorCode; message: string; status?: number };

export type TorobRangeResponse =
  | { ok: true; kind: 'torob/range'; range: TorobRangeReport }
  | { ok: false; errorCode: TorobErrorCode; message: string; status?: number };

export function isTorobRequest(raw: unknown): raw is TorobRequest {
  if (typeof raw !== 'object' || raw === null) return false;
  const kind = (raw as { kind?: unknown }).kind;
  return kind === 'torob/compare' || kind === 'torob/range';
}

export function torobSearchUrl(query: string): string {
  return `https://torob.com/search/?query=${encodeURIComponent(query.trim())}`;
}

export function torobSearchApiUrl(query: string): string {
  const params = new URLSearchParams({
    page: '0',
    size: '10',
    q: query.trim(),
    source: 'next_desktop',
  });
  return `${TOROB_SEARCH_URL}?${params.toString()}`;
}

export function torobDetailsApiUrl(prk: string): string {
  const params = new URLSearchParams({ prk, source: 'next_desktop' });
  return `${TOROB_DETAILS_URL}?${params.toString()}`;
}

/** First results page is enough for a range; Torob caps large sizes anyway. */
export const TOROB_RANGE_PAGE_SIZE = 24;

/**
 * Same search endpoint, one category per call. `torobpay=true` is the live
 * "خرید قسطی ترب‌پی" filter (verified 2026-10-29 by clicking the search-page
 * checkbox); the unfiltered category sends no filter parameter.
 */
export function torobRangeSearchApiUrl(query: string, category: TorobRangeCategoryKey): string {
  const params = new URLSearchParams({
    page: '0',
    size: String(TOROB_RANGE_PAGE_SIZE),
    q: query.trim(),
    source: 'next_desktop',
  });
  if (category === 'installment') params.set('torobpay', 'true');
  return `${TOROB_SEARCH_URL}?${params.toString()}`;
}

// ---------------------------------------------------------------------------
// Normalization

type JsonRecord = Record<string, unknown>;

function asRecord(value: unknown): JsonRecord | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function asArray(value: unknown): unknown[] | null {
  return Array.isArray(value) ? value : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Only http(s) Torob hosts survive; `javascript:`/data: links never do. */
function safeTorobUrl(value: unknown, base = 'https://torob.com'): string | null {
  const raw = asString(value);
  if (!raw) return null;
  try {
    const url = new URL(raw, base);
    if (url.protocol !== 'https:') return null;
    if (url.hostname !== 'torob.com' && !url.hostname.endsWith('.torob.com')) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/** Lowercase, Persian/Arabic digits and letters normalized for matching. */
function normalizeText(text: string): string {
  return text
    .replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit)))
    .replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/\u200c/g, ' ')
    .toLowerCase();
}

function tokenize(text: string): string[] {
  return normalizeText(text)
    .split(/[^a-z0-9\u0600-\u06ff]+/)
    .filter((token) => token.length > 1);
}

const STOP_WORDS = new Set([
  'گوشی',
  'موبایل',
  'مدل',
  'سیم',
  'کارت',
  'ظرفیت',
  'حافظه',
  'رم',
  'گیگابایت',
  'گیگ',
  'و',
  'با',
  'برای',
  'در',
  'از',
  'the',
  'and',
  'with',
  'gb',
  'global',
  'گلوبال',
]);

export interface TorobSearchCandidate {
  prk: string;
  name: string;
  /** Result order from Torob (relevance, ads included). */
  index: number;
  url: string | null;
  priceToman: number | null;
  /** Sellers reported in the search card; a canonical-listing tiebreaker. */
  shopCount: number;
}

/** "در ۵۴ فروشگاه" -> 54; anything unparseable is 0. */
function parseShopCount(value: unknown): number {
  const text = asString(value);
  if (!text) return 0;
  const digits = normalizeText(text).replace(/[^0-9]/g, '');
  return digits ? Number(digits) : 0;
}

function readSearchCandidates(payload: unknown): TorobSearchCandidate[] {
  const root = asRecord(payload);
  const results = asArray(root?.results) ?? [];
  const candidates: TorobSearchCandidate[] = [];
  results.forEach((raw, index) => {
    const row = asRecord(raw);
    const prk = asString(row?.random_key);
    const name = asString(row?.name1);
    if (!row || !prk || !name) return;
    candidates.push({
      prk,
      name,
      index,
      url: safeTorobUrl(row.web_client_absolute_url),
      priceToman: asNumber(row.price),
      shopCount: parseShopCount(row.shop_text),
    });
  });
  return candidates;
}

/**
 * Relevance gate shared by the single-product comparison and the all-listings
 * range. Every Latin model token (poco, x8, pro) must appear when the query
 * has them, so X7/F8 siblings cannot pass; coverage below 0.6 drops noise.
 * Duplicate prks (Torob repeats an ad row organically) are folded once.
 *
 * `relaxNumeric` is for the range view: a PDP title carries the selected
 * capacity/RAM (512, 12), but sibling variants (256/8) must still count as
 * the same product family. Model tokens keep their hard requirement.
 */
function scoreTorobCandidates(
  query: string,
  payload: unknown,
  { relaxNumeric = false } = {},
): Array<{ candidate: TorobSearchCandidate; score: number }> {
  const queryTokens = tokenize(query);
  const distinctive = queryTokens.filter((token) => !STOP_WORDS.has(token));
  const base = distinctive.length > 0 ? distinctive : queryTokens;
  const relaxed = relaxNumeric ? base.filter((token) => !/^[0-9]+$/.test(token)) : base;
  const required = relaxed.length > 0 ? relaxed : base;
  if (required.length === 0) return [];
  const modelTokens = required.filter((token) => /[a-z]/.test(token));

  const scored: Array<{ candidate: TorobSearchCandidate; score: number }> = [];
  const seen = new Set<string>();

  for (const candidate of readSearchCandidates(payload)) {
    if (seen.has(candidate.prk)) continue;
    seen.add(candidate.prk);

    const tokens = new Set(tokenize(candidate.name));
    if (!modelTokens.every((token) => tokens.has(token))) continue;

    const score = required.reduce((sum, token) => (tokens.has(token) ? sum + 1 : sum), 0);
    if (score === 0) continue;
    const coverage = score / required.length;
    if (coverage < 0.6) continue;
    scored.push({ candidate, score });
  }
  return scored;
}

/**
 * Picks the Torob product that represents the PDP. Among candidates within
 * one token of the best score, the one with the most sellers wins - that is
 * the canonical listing, not a single-seller color variant (live finding
 * 2026-10-20).
 */
export function pickTorobProduct(query: string, payload: unknown): TorobSearchCandidate | null {
  const scored = scoreTorobCandidates(query, payload);
  if (scored.length === 0) return null;
  const maxScore = Math.max(...scored.map((entry) => entry.score));
  const contenders = scored
    .filter((entry) => entry.score >= maxScore - 1)
    .sort(
      (a, b) =>
        b.candidate.shopCount - a.candidate.shopCount || a.candidate.index - b.candidate.index,
    );
  return contenders[0]?.candidate ?? null;
}

/**
 * Every relevant listing on the search page, in Torob relevance order.
 * This is the "all products" set behind the price range (D-48); it uses the
 * same gate as the canonical picker so unrelated fallback cards injected by
 * a narrow filter (observed live with `torobpay=true`) never shape the range.
 */
export function matchTorobProducts(query: string, payload: unknown): TorobSearchCandidate[] {
  const seen = new Set<string>();
  const matched: TorobSearchCandidate[] = [];
  for (const candidate of scoreTorobCandidates(query, payload, { relaxNumeric: true })
    .map((entry) => entry.candidate)
    .sort((a, b) => a.index - b.index)) {
    // A promoted card and the organic card are the same listing; a prk can
    // differ between them (live data usually repeats it, but not always).
    const key = `${normalizeText(candidate.name)}|${candidate.priceToman ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    matched.push(candidate);
  }
  return matched;
}

function readOffers(payload: unknown): { offers: TorobOffer[]; shopCount: number } {
  const info = asRecord(asRecord(payload)?.products_info);
  const rows = asArray(info?.result) ?? [];
  const seen = new Set<string>();
  const offers: TorobOffer[] = [];

  for (const raw of rows) {
    const row = asRecord(raw);
    if (!row) continue;
    if (row.availability === false) continue;

    const priceToman = asNumber(row.price);
    if (priceToman === null || priceToman <= 0) continue;

    const shopName = asString(row.shop_name) ?? asString(row.shop_name2) ?? 'Torob';
    const prk = asString(row.prk);
    // Same Torob offer (prk) or the same shop at the same price is one row;
    // a shop with two different prices may legitimately appear twice.
    const prkKey = prk ? `prk:${prk}` : null;
    const shopKey = `shop:${shopName}|${priceToman}`;
    if ((prkKey !== null && seen.has(prkKey)) || seen.has(shopKey)) continue;
    if (prkKey !== null) seen.add(prkKey);
    seen.add(shopKey);

    offers.push({
      shopName,
      city: asString(row.shop_name2),
      priceToman,
      url: safeTorobUrl(row.page_url),
      scoreText: asString(asRecord(row.score_info)?.score_text),
      postage: asString(row.postage_fee),
    });
  }

  offers.sort((a, b) => a.priceToman - b.priceToman);
  const reported = asNumber(info?.count);
  return {
    offers: offers.slice(0, TOROB_OFFER_LIMIT),
    shopCount:
      reported !== null && reported >= offers.length ? Math.round(reported) : offers.length,
  };
}

export function normalizeTorobComparison(
  query: string,
  searchPayload: unknown,
  detailsPayload: unknown,
): TorobComparison {
  const product = pickTorobProduct(query, searchPayload);
  const { offers, shopCount } = product ? readOffers(detailsPayload) : { offers: [], shopCount: 0 };
  return {
    query,
    searchUrl: torobSearchUrl(query),
    productName: product?.name ?? null,
    productUrl: product?.url ?? null,
    offers,
    shopCount,
  };
}

/**
 * Builds one category's range from Torob search cards. Each card's `price`
 * is already that listing's cheapest offer ("از ..."), so no per-product
 * detail requests are needed. Distinct prices avoid letting an ad + organic
 * duplicate of the same listing consume the upper-bound slot.
 *
 * Delivery is deliberately absent: Torob cards do not carry a reliable
 * per-seller delivered price, and shipping varies by the user's address.
 */
export function normalizeTorobCategoryRange(
  query: string,
  category: TorobRangeCategoryKey,
  payload: unknown,
): TorobCategoryRange {
  const listings: TorobRangeListing[] = matchTorobProducts(query, payload)
    .filter((candidate) => candidate.priceToman !== null && candidate.priceToman > 0)
    .map((candidate) => ({
      prk: candidate.prk,
      name: candidate.name,
      priceToman: candidate.priceToman as number,
      shopCount: candidate.shopCount,
      url: candidate.url,
    }))
    .sort((a, b) => a.priceToman - b.priceToman || a.name.localeCompare(b.name));

  const prices = [...new Set(listings.map((listing) => listing.priceToman))].sort((a, b) => a - b);
  const minToman = prices[0] ?? null;
  const upperToman = prices[2] ?? prices[1] ?? prices[0] ?? null;
  const upperBasis: 1 | 2 | 3 = prices.length >= 3 ? 3 : prices.length === 2 ? 2 : 1;

  return {
    category,
    minToman,
    upperToman,
    upperBasis,
    pricesToman: prices.slice(0, 3),
    listingCount: listings.length,
    listings: listings.slice(0, 3),
  };
}

export function normalizeTorobRange(
  query: string,
  payloads: { installment: unknown; any: unknown },
): TorobRangeReport {
  return {
    query,
    searchUrl: torobSearchUrl(query),
    categories: [
      normalizeTorobCategoryRange(query, 'installment', payloads.installment),
      normalizeTorobCategoryRange(query, 'any', payloads.any),
    ],
  };
}
