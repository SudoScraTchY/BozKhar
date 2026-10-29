# 12 — Marketplace Expansion Research: Snapp Shop

**Status:** Research only — no Snapp Shop code, permission or adapter is implemented.
**Date:** 2026-10-29
**Question:** what would it take to extend BozKhar from Digikala to Snapp Shop
(and then other multi-vendor shops) without changing the optimizer engine?

## 1. Verdict

**Read-only product/offer comparison: feasible. Cart-level optimization parity:
not yet feasible on public data, and not advisable before a terms review.**

Snapp Shop exposes a usable, unauthenticated JSON surface for search and product
details, including a per-seller offer list. That is enough to reuse the
normalized `Offer` model and show a seller/price comparison on a Snapp Shop
product page. It is *not* enough for the cart optimizer: the product payload has
no delivery-fee amount (only shipment-mode flags and ETAs), and the cart/shipping
quote endpoints are not public. The current optimizer is built around real
per-vendor delivery fees; feeding it unknown fees would keep the engine
unchanged but reduce the output to an item-price comparison, which is a
different product from the Digikala plan.

The cheapest architecture change is a hand-written marketplace adapter boundary
(one adapter per shop, not a generic scraper). The solver and the normalized
offer/snapshot model stay as they are.

## 2. Snapp Shop model and data surface

### 2.1 Marketplace model — VERIFIED (hybrid)

- Snapp Shop is a third-party marketplace with a Seller Center
  (`seller.snappshop.ir`), not a first-party-only store. A product page can
  aggregate several sellers: the PDP contains «فروشندگان این کالا» and
  `buy-cheaper-from-other-sellers`, and the product API returns a `vendor[]`
  array per variation.
- Fulfilment is mixed: `normal` consolidates goods from different sellers in a
  Snapp Shop warehouse, `asap` is express, `fbm`/`ship_by_seller` ship from the
  seller, and `heavy`/`heavy_ship_by_seller` cover large items. The product
  payload exposes which modes are enabled per offer, not their prices.
- Official seller onboarding includes a WooCommerce catalog-connect plugin;
  commission is category-based (published in seller materials) and settlement
  is periodic. No public, documented merchant API for third-party clients was
  found.

### 2.2 Public JSON surface — VERIFIED live (2026-10-29)

Base host: `https://apix.snappshop.ir` (unauthenticated with a browser user
agent; `lat`/`lng` are required query parameters).

| Purpose | Request | Observed shape |
|---|---|---|
| Search | `POST /search/v1?lat=…&lng=…` body `{"query":"…","render":4}` | `data.structure[0].items[]`: `id` (6-char), `title`, `price.price` / `price.discounted_price`, `badge` (e.g. «خرید قسطی»), `href` (`/product/snp-<numeric>`) |
| Product | `GET /products/v2/<numericId>?lat=…&lng=…` | `variants[]` → each has `variation_id` and `vendor[]`; each vendor offer has `vendor_id`, `price`, `special_price`, `stock`, availability flags, `shipment` modes, `snapp_pay_installment[]` |
| Megamenu | `GET /landing/v1/megamenu?lat=…&lng=…` | category tree |

A sampled phone (numeric id `988664173`) returned 5 sellers for one variation.
The offer fields needed for a comparison are present:

```json
{
  "vendor_product_info_id": "QE6wbL",
  "vendor_id": "DbpJMY",
  "price": 890000,
  "special_price": 712000,
  "stock": 1,
  "is_available_in_shop": false,
  "is_available_in_vendor_inventory": true,
  "shipment": {
    "normal": { "enabled": false },
    "asap": { "enabled": true, "has_next_day": false },
    "ship_by_seller": { "enabled": false },
    "heavy": { "enabled": false },
    "fbm": { "enabled": false }
  },
  "snapp_pay_installment": []
}
```

Key observations:

- **No delivery fee** appears in the product or offer payload. Only shipment
  modes and ETA hints are present. The fee is resolved later (cart/address
  dependent), so a `feeAmount: null` mapping is the only honest normalization.
- **Installment** is a payment method (Snapp Pay: four monthly installments,
  interest-free, subject to the user's credit). Search cards carry a «خرید
  قسطی» badge, and offers carry `snapp_pay_installment[]`; there is no search
  facet for installment. It is account-dependent, not a simple product filter.
- **Product identity:** the public URL is `/product/snp-<numeric>`; the search
  card's short `id` is not the same as the numeric product id. A reader must
  take the numeric id from `href` (or the PDP URL) for the detail call.
- **Location matters:** every call needs `lat`/`lng`; prices, stock and
  shipment availability can vary by geography. A hard-coded Tehran coordinate
  would be wrong for other users, so the adapter needs the page's own location
  context (or a user-selected city) and a visible caveat.
- The site is client-fetched (Next.js `__NEXT_DATA__` is not the data source),
  so a content script must wait for the hydrated PDP, or the worker must call
  the API itself with the resolved id and location.

### 2.3 Installment / قسطی

- PDP copy: «در صورت پرداخت از طریق درگاه اسنپ‌پی، می‌توانید مبلغ خرید را در
  ۴ قسط پرداخت کنید.»
- Search badge: «خرید قسطی» on many items.
- Per-offer `snapp_pay_installment` was empty in the sampled offers even when
  the item had the badge; the plan is likely resolved against the user's Snapp
  Pay account at checkout. **A Snapp Shop "قسطی" category cannot be treated as
  a reliable search filter; it is a badge/availability signal at best.**

### 2.4 Legal and operational risk

- `robots.txt` disallows `/search*`, `/api/*`, `/checkout/*`, `/profile*` and
  `/*.json$`; API responses carry `X-Robots-Tag: noindex`. `robots.txt` governs
  crawlers, not a user-triggered browser extension, but it is a clear signal
  that bulk crawling/searching is unwelcome.
- The parent Snapp terms (per public search snippets) prohibit source-code
  extraction/analysis; the Snapp Shop terms page is client-rendered and its
  automation clause could not be read. **Explicit anti-automation language for
  Snapp Shop is UNVERIFIED — review before shipping.**
- No authentication or CAPTCHA was needed for the sampled public reads, but
  login is mobile + OTP and cart/shipping endpoints are session-gated. No rate
  limits were documented; volume must stay click-only and low, like the Torob
  path (D-42), never a crawl.

## 3. What this means for BozKhar

| Capability | Snapp Shop today | Impact |
|---|---|---|
| Product search by title | Public JSON (POST) | Adapter can resolve a product |
| Per-variant seller offers | Public JSON (GET) | Reuse `Offer` normalization |
| Stock / price / seller identity | Public JSON | Reuse comparison UI and solver inputs |
| Delivery fee | Not in product payload | Solver fee stays `null`; plan is item-price only |
| Cart contents | Session-gated, undocumented | No cart crawl until reverse-engineered |
| Shipping quote | Session/address-gated, undocumented | No true grand-total plan |
| Apply plan to cart | Would mutate Snapp cart | Out of scope for an advise-only extension |
| Installment filter | Badge only, account-dependent | Not a reliable category |

The optimizer engine can remain **byte-for-byte unchanged**: it already accepts
`Offer.delivery.feeAmount = null` and labels such plans estimate-only. The
missing part is the capture adapter and an honest UI that says delivery is
unknown — not a solver change.

## 4. Proposed architecture change (hand-written adapters)

No dynamic site handling. Add one adapter per marketplace behind a small
interface; each adapter is versioned and fixture-tested like the current
Digikala readers.

```ts
export type MarketplaceId = 'digikala' | 'snappshop';

export interface MarketplaceAdapter {
  id: MarketplaceId;
  hosts: string[];
  /** Numeric id + variant id from the page URL. */
  productFromUrl(url: URL): ProductRef | null;
  /** Worker-side read; normalized before crossing any boundary. */
  fetchProduct(ref: ProductRef, fetchFn: FetchJson): Promise<NormalizedProduct>;
  /** Optional: only when a real, stable cart/shipping surface exists. */
  fetchCart?(tabId: number): Promise<NormalizedCart>;
  quoteShipment?(tabId: number, cart: NormalizedCart): Promise<ShipmentQuote>;
  /** Optional: omitted keeps the marketplace advise-only. */
  applyPlan?(tabId: number, plan: Plan): Promise<ApplyResult>;
}

interface NormalizedProduct {
  item: ComparisonItem;
  offers: Offer[];       // existing shared type
  imageUrl?: string;
  /** Flags the UI must surface, e.g. "delivery unknown". */
  caveats: Array<'delivery-unknown' | 'installment-badge-only'>;
}
```

What moves behind the boundary:

1. **Manifest** — add `https://snappshop.ir/*` to content-script matches and
   `https://apix.snappshop.ir/*` to host permissions. One new host pair, so
   NFR-06 requires a decision-log entry and an updated manifest audit test.
2. **URL/identity** — `productFromUrl` replaces the Digikala-only
   `extractProductId` in the PDP surface; Snapp numeric id comes from
   `/product/snp-<numeric>` and the short variant id from the page/API.
3. **Readers** — a `src/marketplaces/snappshop/` reader maps `variants[].vendor[]`
   to `Offer[]`:
   - `price` → `special_price ?? price` (Toman; the API is in Toman, unlike
     Digikala's Rial fields — verify in fixtures).
   - `stock > 0 && (is_available_in_shop || is_available_in_vendor_inventory)`
     → in-stock.
   - `heavy`/`heavy_ship_by_seller` enabled → `isLargeItem`.
   - `shipment.*.enabled` → nothing usable as a fee; `feeAmount: null`,
     `provenance: 'listing-api'` (a one-line shared-type addition).
   - `snapp_pay_installment` → a display-only badge on the offer; never a
     solver input.
4. **Worker routing** — a `marketplace` field on capture messages (or a
   provider lookup by sender URL). Torob stays a marketplace-independent
   price source; it already gives cross-shop comparisons without a new adapter.
5. **Content surfaces** — a Snapp PDP action row and panel; the existing
   Torob surface is already site-agnostic once the query resolver and mount
   points are parameterized. Snapp Shop is client-rendered, so mount points
   need live verification and a selector version bump.
6. **Results/UI** — replace hard-coded «دیجی‌کالا» copy in results, apply and
   insights with marketplace-aware labels; hide Apply when `applyPlan` is
   undefined. The solver output shape does not change.
7. **Privacy/ToS** — the privacy note, store listing and click-only behavior
   must name Snapp Shop and the new host; the range/compare path already sends
   only the public product title.

**What does not change:** `src/shared/solver/*`, the `Offer`/`Snapshot`/
`ShipmentPackage` entities (except the optional provenance value), the hint
engine, lock semantics, and the exact/approximate solver modes. A marketplace
that cannot supply fees simply produces `feeAmount: null` offers, which the
engine already handles.

## 5. Effort and cost estimate

All estimates are **ESTIMATED** (no Snapp adapter has been built). One senior
engineer familiar with the codebase; ranges assume the public API stays as
sampled and exclude legal review.

| Work package | Engineer-days | Confidence |
|---|---:|---|
| Extract the adapter boundary from the current Digikala-only paths (URL/identity, worker routing, manifest, tests) | 3–5 | medium |
| Snapp Shop search/product readers + fixtures (numeric id, variants, offers, stock, location, Toman/Rial verification) | 4–6 | medium |
| Snapp PDP surface + panel + Persian/English copy + jsdom tests | 2–3 | medium-high |
| Manifest/permission audit, privacy/ToS copy, live smoke, stabilization | 2–3 | medium |
| **Subtotal: read-only product/offer comparison** | **11–17** | medium |
| Cart + shipping parity (reverse-engineer session-gated cart/quote calls, fee mapping, failure containment, live tests) | +10–20 | low |
| **Subtotal: full cart-optimizer parity** | **21–37** | low |
| Ongoing maintenance for two marketplaces (API drift, fixtures, smoke) | 1–3 per month | low-medium |

**Cost:** multiply the engineer-days by your blended daily rate `R`:
`cost = days × R`. At a hypothetical €250/day (clearly an example, not a
quotation), the read-only path is roughly €2.8k–€4.3k and full parity roughly
€5.3k–€9.3k. Add 30–50% contingency for API churn, location handling and a
terms review. The adapter boundary itself (3–5 days) is the reusable part: each
additional marketplace after Snapp should cost less for product comparison, but
cart parity is a per-marketplace reverse-engineering project, not a checklist
item.

## 6. Recommended sequence

1. **Do not port the cart optimizer to Snapp Shop yet.** The missing fee and
   cart/shipping APIs are the product, not a detail; without them the optimizer
   would present item-price arithmetic as if it were the Digikala plan.
2. **If expansion is wanted now, ship the read-only product/offer comparison**
   (11–17 days). It reuses the solver's `Offer` model, keeps apply unavailable
   for Snapp, and adds an explicit "delivery unknown" caveat. It is a useful
   cross-shop check even without the optimizer.
3. **Before any cart work, answer two questions:** (a) can the logged-in cart
   and address-specific shipping quote be read through a stable, user-visible
   page/API path without violating the terms? (b) does Snapp Shop expose a
   per-vendor fee before checkout? If either answer is no, stop at read-only.
4. **Keep Torob as the cross-marketplace price layer.** It already compares
   sellers across shops, including Snapp Shop sellers, for the product the user
   is viewing; the new range button (D-48) extends that without a new host
   permission.
5. **Only then extract the adapter boundary** and add Snapp as the second
   hand-written adapter. Do not build a dynamic marketplace scraper: each shop
   gets a versioned reader, fixtures and a manifest entry.

## 7. Open questions

- **OQ-12:** What is Snapp Shop's explicit automation/scraping policy for a
  user-initiated browser extension? (Terms page is client-rendered; needs a
  human review.)
- **OQ-13:** Are cart and address-specific shipping quotes reachable from the
  page session, and do they expose a per-vendor fee before checkout? (Needs a
  consented live session capture, like the original Digikala spike S-6.)
- **OQ-14:** Which location signal should the adapter use — the page's own
  `lat/lng`, a user-selected city, or both? Hard-coding Tehran would silently
  misprice other users.
- **OQ-15:** Is Snapp Pay installment availability stable enough to badge, or
  should it remain a checkout-only concept? The sampled per-offer array was
  empty while the search badge was present.

## 8. Evidence and sources

Verified live on 2026-10-29 from this workspace:

- `GET https://apix.snappshop.ir/products/v2/988664173?lat=35.77331&lng=51.418591`
  → 5 sellers, `special_price`, stock, shipment modes, `snapp_pay_installment`.
- `POST https://apix.snappshop.ir/search/v1?lat=35.77331&lng=51.418591`
  body `{"query":"گوشی موبایل سامسونگ","render":4}` → `structure[0].items[]`
  with discounted prices and «خرید قسطی» badges.
- `https://snappshop.ir/product/snp-1869138658` → «فروشندگان این کالا»,
  `buy-cheaper-from-other-sellers`, and the four-installment Snapp Pay copy.
- `https://snappshop.ir/robots.txt` → `/search*`, `/api/*`, `/checkout/*`,
  `/profile*` disallowed.

Secondary sources:

- Seller Center: <https://seller.snappshop.ir/>
- WooCommerce seller plugin: <https://wordpress.org/plugins/snappshop-sellers/>
- Third-party API client documenting the search/product/landing calls:
  <https://github.com/dot1mav/snappshop-mcp/blob/main/snappshop/api.py>
- Snapp Pay: <https://snapppay.ir/> · BNPL campaign:
  <https://snappshop.ir/campaign/bnpl>
- Seller introduction / commission: <https://snappshop.ir/seller-introduction>
- Parent terms (source-extraction clause per public snippet):
  <https://snapp.ir/terms/>
- Seller shipping/academy material:
  <https://seller.snappshop.ir/academy/update-shipping-processing-fees/>
- Sitemap: <https://snappshop.ir/sitemap.xml>

Labels: **VERIFIED** = observed live or in an official/primary page during this
research; **ESTIMATED** = engineering judgement; **UNVERIFIED** = could not be
confirmed and must be checked before building.
