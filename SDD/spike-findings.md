# T01 Discovery Spike — Findings (v1)

**Date:** 2026-09-30 · **Session:** AutoCoder, logged-in Chrome profile (Electron/webview, Chromium 130), desktop viewport
**Method:** live navigation on digikala.com + DevTools network capture (request/response bodies) of `api.digikala.com` XHRs. **No purchase was completed; no cart mutation was performed by the tool** (all cart contents pre-existed from the user's own shopping).

## Headline verdict: **GO with changes**

All three load-bearing unknowns resolved positively, and better than the SDD hoped:
fees are machine-readable **per vendor, pre-checkout, on the product page itself** (R-01 → full
optimizer, no cart-preview extension needed), the cart API exposes **per-item shipment fee
lines** that make consolidation arithmetic directly verifiable (D-14), and **variant
reproduction by URL parameter is confirmed** (F-10/S-2), so the crawl stays simple.

| Spike task | Verdict | Evidence strength |
|---|---|---|
| S-1 fee visibility | **PASS — full optimizer** | reproduced (API + visible labels) |
| S-2 variant-preserving navigation | **PASS** | reproduced |
| S-3 promo shapes/detectability | **PARTIAL** (1 promo signal observed, per-seller consistency + amount-threshold promos still open) | observed |
| S-4 Plus applicability | **PARTIAL** (strong structural evidence; A/B account test still open) | observed |
| S-5 large-item fee semantics | **NOT TESTED** (no large item in the observable cart) | — |
| S-6 fee aggregation across items | **PASS (API evidence)** — per-item fee lines observed; single-shipment aggregation + quantity-2 behavior still to confirm | observed |
| S-7 selector stability | **PASS — upgraded: DOM selectors can be bypassed entirely** | reproduced |

## S-1 — Delivery fee visibility (the go/no-go) → PASS

**Observed (API, `GET https://api.digikala.com/product/v1/products/16622211/?variant_id=62270876`):**
every variant ("seller offer") in `data.product.variants[]` carries:

```json
"shipment_methods": {
  "providers": [{
    "title": "تحویل عادی فروشنده",
    "shipping_mode": "seller",
    "delivery_day": "today",
    "price": { "value": 1680000, "is_free": false }
  }]
}
```

Sample of seller → fee for DKP-16622211 (variant offers on one product page, logged-in, prices
in Rial):

| Seller (id) | selling_price | shipment fee | free? |
|---|---|---|---|
| وانیل دارو (988018) | 3,440,000 | 1,680,000 | no |
| داروخانه مکمل کده (678248) | 4,700,000 | 1,100,000 | no |
| محور سلامتی (694673) | 3,720,000 | 1,500,000 | no |
| فارماشاپ نوین (1664029) | 4,222,000 | 1,490,000 | no |
| بهفام دارو (755106) | 5,450,000 | 1,100,000 | no |
| افرادارو (1976609) | 5,120,000 | 1,200,000 | no |
| داروخانه دکتر یزدیان (298880) | 5,285,000 | **(providers: [] — none offered)** | — |
| مکس مکمل (706757) | 5,900,000 | **(no `price` key — FBM via Digikala)** | — |
| کیان دارو (780629) | 15,877,700 | 2,490,000 | no |
| درمانه (801083) | 9,190,000 | **(providers: [])** | — |

**Corroboration (UI):** the same product page shows, for the default seller, the literal labels
`ارسال` (shipping) + `رایگان` (free) near the buy box for this Plus-ineligible/non-plus user —
visible without login, and consistent with `free_shipping_badge` in the payload.

**Pass criterion met:** fee readable pre-checkout at a stable, machine-readable location, per
vendor. → **Full optimizer** (SDD 11 S-1 "Pass" branch). Notably the fee appears **per offer on
the product page itself**, which is better than the cart-preview fallback the SDD hoped for.

## S-2 — Variant-preserving navigation from cart → PASS

**Observed:** cart API (`GET /checkout/v1/carts`) returns for each `cart_item` a product `url.uri`
that embeds `?variant_id=<id>` (e.g. `.../dkp-10583616/...?variant_id=46428189`). Navigating that
exact URL loaded the correct product page; the product API was fetched with
`?variant_id=62270876` and returned `default_variant.id = 62270876` matching the cart's variant
`id`. Item title/price in cart (344,000 Toman, وانیل دارو) matched the PDP offer.

**Pass criterion met:** crawl can deep-link with the exact variant; no in-page variant selection
step needed.

## S-3 — Promo shapes and detectability → PARTIAL

**Observed:** PDP payload includes a `digiplus.services[]` array on some *seller offers*: e.g.
مکس مکمل, آدی فارماسی, مکمل نوین شاپ, گلدن شاپ نوین carry
`["۴ ارسال رایگان دیجیکالا","۲ ارسال هایپرمارکت","۴ ارسال رایگان سوپرمارکت","پشتیبانی اختصاصی"]`
plus `services_summary: ["ارسال رایگان"]` — i.e. a **per-seller free-shipment entitlement promo,
machine-detectable** (presence of free-shipment service titles in `digiplus.services`).
`price.is_locked_for_digiplus` also exists as a structured flag.

**Not yet observed:** the two stakeholder-confirmed count-promos ("buy 2 of this item → free
delivery", "buy z items from vendor → free delivery") as distinct payload fields; no
amount-threshold promo surfaced (OQ-01 still open).

**Verdict:** promo detectability is *plausible and structured* (per-seller service lists), but
the mapping to the SDD's two promo *types* needs one more session targeted at products known to
run them. FR-10 should plan to key off `digiplus.services` + future fields; keep the manual-entry
fallback scoped (SDD already does).

## S-4 — Where Plus applies → PARTIAL (strong structural evidence)

**Observed:** `GET /v1/user/init` returns `digiplus.is_activated: false, user_state: "non_plus"`
for this account. The offer payload carries a **full Plus service catalog per seller** (the
`digiplus.services` lists above) and `price.is_locked_for_digiplus`. `checkout/v1/carts/mini`
exposes `is_digiplus_promotion` on prices.

**Not done:** the actual A/B (same offer, Plus session vs non-Plus) — requires a second account
or toggling Plus on this one. Recommendation: run S-4 residual during the user's next Plus
window, or accept the structural evidence and revisit post-MVP.

## S-5 — Large-item fee semantics → NOT TESTED

The observable cart had only pharmacy/supplement items (no bulky good), so the large-item branch
(D-13, OQ-04) remains unverified. Needs a session with a large item added to cart (add → read
fee lines → remove).

## S-6 — Fee aggregation across items → PASS at API level (aggregation arithmetic still to confirm)

**Observed (cart API, `GET /checkout/v1/carts`, logged-in, 7 items / 5 sellers):** each
`cart_item.variant.shipment_methods.providers[0].price` is present **per item**, with
seller-consistent values — e.g. all 3 items of seller وانیل دارو (988018) show fee 1,680,000;
آریاکده طهران, داروخانه مکمل کده, دارو کاپ all show 1,100,000; داروخانه دیامond has
`providers: []` (no shipment method offered for that variant).

**Read:** the cart models shipping as **per-seller shipment lines** (the value repeats per item
of the same seller, rather than a per-item charge). This is consistent with D-14's once-per-
shipment premise, but the *payable* aggregate (does the checkout sum it once per seller?) is
what S-6 actually needs. The cart payload here does not include a shipping subtotal line, so
confirming the final arithmetic needs the checkout/shipping-preview step — **do not** proceed to
purchase; the shipping-method selection page itself (pre-payment) is the evidence target.

**Caveat recorded:** cart totals in the payload (`payable_price` 22,330,000) equal items only;
fee aggregation will be visible at the shipping step, not in this payload.

## S-7 — Selector stability survey → PASS (upgraded)

**Observed:** the product page renders from `GET api.digikala.com/product/v1/products/<id>/?variant_id=<vid>`
(400 on malformed id — the endpoint is live and strict), and the cart page from
`GET /checkout/v1/carts` + `/carts/mini`. Both return complete, structured data (sellers, prices,
fees, promos, warranty, URLs). A subset of this payload (`digiplus`, `variant_badges`,
`shipment_methods`) matches what the UI renders.

**Consequence for T03:** extraction should target these JSON responses (fetch from the page
context with the user's session, or read the loaded state), with DOM selectors only as fallback.
That *removes* most of R-02's blast radius: a DOM redesign breaks the fallback, not the primary
extractor. Selector fixtures become less load-bearing; API-shape fixtures become the new T03
test corpus.

## Decision-log consequences

- **R-01/F-4:** upgrade to Verified — fees are visible pre-checkout **on the product page, per
  vendor, machine-readable**. Fee source = `shipment_methods.providers[].price` (with `is_free`).
- **D-14/F-5:** stays Assumed-but-corroborated — per-seller fee lines exist per item in the
  cart API; single-charge-at-checkout arithmetic still to be witnessed at the shipping step.
- **F-10/S-2:** upgrade to Verified — `variant_id` URL parameter reproduces the exact variant.
- **OQ-01:** unchanged (no amount-threshold promo observed).
- **OQ-10/S-4:** structurally answered (per-seller Plus service lists); A/B still open.
- **R-02:** materially reduced — primary extractor should consume the product/cart JSON APIs
  (public, no auth header observed beyond cookies), not DOM scraping. NFR-05's "selectors
  module" becomes a "payload readers module"; amend 06-architecture accordingly at T03 kickoff.

## Remaining evidence gaps (small, bounded)

1. Checkout shipping-step fee totals (D-14 arithmetic) — needs one careful add-to-cart + shipping-page look, no purchase.
2. Large-item branch (S-5) — one large item, add → read → remove.
3. Count-promo mapping (S-3 residual) — find a product running "buy 2 → free delivery" and capture its payload shape.
4. Plus A/B (S-4 residual) — needs a Plus-enabled session.

**Recommendation:** treat findings 1–3 as one 30-minute guided session with the user's
participation (their account, their cart); finding 4 whenever Plus is active. None block T02's
completed work or the architecture; all four fit inside `spike-findings.md` as amendments when
done.

— AutoCoder, 2026-09-30
