# T01 Discovery Spike — Findings (v1)

**Date:** 2026-09-30 · **Session:** AutoCoder, logged-in Chrome profile (Electron/webview, Chromium 130), desktop viewport
**Method:** live navigation on digikala.com + DevTools network capture (request/response bodies) of `api.digikala.com` XHRs. **No purchase was completed; no cart mutation was performed by the tool** (all cart contents pre-existed from the user's own shopping).

## Headline verdict: **GO** (v2 - all spike tasks closed 2026-09-30)

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
| S-5 large-item fee semantics | **CONFIRMED** — live large item (boxing bag) observed as own shipment class with own fee | confirmed |
| S-6 fee aggregation across items | **CONFIRMED** — checkout shipping page + tracking payload witnessed with quantity counterfactual | confirmed |
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

## S-6 — Fee aggregation across items → CONFIRMED (with counterfactual)

**Procedure (with stakeholder permission):** increased کپسول لیور ویت (seller وانیل دارو) from
qty 1 to qty 2 in the real cart (payable 53,524,100 → 56,964,100 = exactly one more unit at
3,440,000), clicked ثبت سفارش to the shipping page, captured evidence, then restored qty to 1
(PATCH `{"cartItemId":259701469,"quantity":1}` → payable back to 53,524,100). No payment step
was entered.

**Observed (checkout/shipping page, 8 items / 5 sellers incl. a large item):**

| Shipment (مرسوله) | Items | Fee |
|---|---|---|
| ارسال فروشنده — وانیل دارو | **3 products / 4 units** (1 item at qty 2 + 2 items at qty 1) | **168,000 once** |
| ارسال فروشنده — آریاکده طهران | 1 product | 110,000 |
| ارسال فروشنده — داروخانه مکمل کده | 1 product | 110,000 |
| ارسال فروشنده — دارو کاپ | 1 product | 110,000 |
| ارسال فروشنده — داروخانه دیاموند | 1 product | 120,000 |
| **ارسال کالاهای بزرگ و سنگین** — boxing bag | 1 product | "تعیین نشده" (set at time-slot selection) |

Page totals: قیمت کالاها 7,740,210 · **مجموع هزینه ارسال 1,174,000 → discounted 618,000** ·
مبلغ قابل پرداخت 6,314,410. Arithmetic verified: 618,000 = 168,000 + 110,000×3 + 120,000
exactly — the وانیل دارو fee appears **once** for 4 units.

**Machine confirmation:** the page's snowplow tracking event exposes the canonical structure:

```json
"shipments":[
  {"shippingCost":3590000,"shippingType":"ارسال کالاهای بزرگ و سنگین",
   "shippingProducts":[{"variant_id":73164966,"quantity":1}],"earliestTime":"2026-10-04"},
  {"shippingCost":1680000,"shippingType":"ارسال فروشنده",
   "shippingProducts":[{"variant_id":62270876,"quantity":2},
                       {"variant_id":77494194,"quantity":1}, ...]}
]
```

**Counterfactual check:** qty 1→2 changed payable by exactly one unit price (+3,440,000) and
did NOT change the seller's fee line (168,000 before and after). **D-14/F-5 upgraded: Verified,
confirmed.** Fee model per D-14 stands as designed (one fee per vendor shipment).

Note for T04: displayed fees on this page were ~50% discounted (319,000→168,000 etc.) — the
site applies a shipping promotion to logged-in users. The solver must use the *effective* fee
the shipment will actually cost, which the payload exposes; raw list fees on PDPs may differ.

## S-5 — Large-item fee semantics → CONFIRMED (partially: Plus-exemption still untested)

**Observed:** the cart contained کیسه بوکس as110 (bulky good). The checkout page splits it into
its **own shipment class** — "ارسال کالاهای بزرگ و سنگین" (large & heavy shipping), separate
from all seller shipments — with fee **"تعیین نشده"** at load, resolving to **3,590,000 Rial**
(359,000 Toman) in the payload once a time slot context exists, earliest 2026-10-04. The page's
own explanation line: orders split into multiple shipments "because they include supermarket,
**heavy**, or different-shipping-method items" — the heavy class is a first-class platform
concept.

**Consistent with D-13** (fixed per-shipment fee for large items, separate logistics). The
Plus-exemption claim (Plus does not remove the large-item fee) remains untested — no Plus
session available — so D-13 stays "confirmed for fee structure, untested for Plus interaction".
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

## Live finding 2026-10-07 — checkout API requires the site's routing header set (drives D-16)

**Observed (CDP Network domain, logged-in session):** the site's own
`api.digikala.com` calls carry a static routing marker set — `x-site: DIGIKALA`,
`x-source: WEB`, `X-Web-Optimize-Response: 1` (names only; values are public
app-routing markers, no `Authorization` header exists on these calls). The
checkout cart API (`GET /checkout/v1/carts`) answers **HTTP 401** to
same-session fetches that omit them — from the service worker, from the
extension page, and from plain page context. Replication matrix from page
context: no headers → 401; the exact captured set → **200**.

**Real cart payload shape (fixture-derived reader was wrong):** items live at
`data.packages[].cart_items[]` (not `data.cart_item[]`/`data.items[]`); the
seller (`variant.seller`) and the shipment fee line
(`variant.shipment_methods.providers[].price.value`) sit on the **variant**;
`data.cart` is a summary (items_count, payable_price, …). Reader realigned in
T03; sanitized live-shape fixture added (`tests/fixtures/capture/cart-live-shape.json`).

**Consequence:** D-16 — crawl fetches delegate to the page main world
with the captured header set; SW keeps orchestration and falls back to
its own fetch when the content script is unreachable. If the site rotates
the marker values, the cart crawl 401s (contained per crawl) — re-capture via CDP.

— Live-smoke session, 2026-10-07 (read-only; cart unmodified)

## Live finding 2026-10-08 — the isolated world is CORS-blocked; the main world is not (refines D-16)

**Observed (CDP Network domain, logged-in session, real extension build):**
the checkout API's CORS policy answers preflight only for the web origin.
A fetch from the content script's **isolated world** issues the `OPTIONS`
preflight and is then blocked — the follow-up GET never happens and
`fetch` rejects with `TypeError: Failed to fetch` (crawl toast showed
`NETWORK: Network failure: Failed to fetch`). The identical fetch from
the page's **main world** (same headers, same credentials) returns
**200**, and the site's own calls (main world) all return 200.
The SW-origin fetch reaches the API but answers 401 (its origin is
`chrome-extension://`).

**Fix (D-16 refinement):** the delegated executor is injected into the
page's main world as a self-contained script (classic `<script>` tag,
serialized with `toString()` — no module scope), which fetches GET
with the site header set and posts the result back via
`window.postMessage` (matched by a per-request id). D-01 preserved:
the method is baked into the injected code. D-02 preserved: the scope
guard runs on both sides before injection.

— Live-smoke session, 2026-10-08 (read-only; cart unmodified)

## Live finding 2026-10-08 (2) — content-script `<script>`-tag insertion does not execute (supersedes the fix above; D-16 now uses `chrome.scripting.executeScript`)

**Observed (real extension build, logged-in session):** the classic
workaround — a content script appending a `<script>` element to
`document.head` — **does not execute in the current Chromium**.
Verified empirically with a debug attribute written by the injection
function (proving it runs on the correct document: same `href`,
151 scripts, `HEAD`/`BODY` present) while the appended elements
never run in **any** world: no console output (site console shows
only its own), no `window.postMessage` (a cross-world event), no
`window` side-effect markers, and the elements vanish from the DOM
only when the test's own safety net removes them. The page has **no
CSP** (no response header, no meta tag), and inline scripts inserted
from the page's own main world (via `page.evaluate`) execute
synchronously — so the block is specific to content-script-inserted
script tags.

**Fix (D-16 refinement 2):** the SW injects the executor directly
with `chrome.scripting.executeScript({target:{tabId}, world:'MAIN',
func, args})` — the official API. Live-verified end to end: a
trivial func returns its value (marker set in the main world), and
the delegated cart fetch with the site header set returns **200
with the body**. This also removes the postMessage/request-id round
trip (the func's return value comes back to the SW directly) and the
content-script middleman (the content script is surfaces-only again).
Cost: the `scripting` permission (NFR-06 entry = D-16 in the
decision log; the manifest permission audit test updated in the same
change). D-01 preserved (GET-only, baked into the serialized func);
D-02 preserved (guard before the tab is touched + defense-in-depth
host check inside the func).

— Live-smoke session, 2026-10-08 (read-only; cart unmodified)

## Live finding 2026-10-08 (3) — the persistent test profile can run a STALE service worker

**Observed:** after rebuilding the extension, a fresh
`launch_persistent_context` on the same profile still ran
the PREVIOUS build's service worker (responses lacked
fields only the new build adds; storage writes from the
new build's SW never landed). Chrome caches extension SW
scripts in the profile (`Default/Service Worker`,
`Default/Extension Scripts`, `Default/Extension State`).
This made the executeScript refactor look broken for
~an hour: every "the delegate never runs" signal was the
old build running.

**Fix (test harness):** before each probe launch, delete
the profile's `Default/Service Worker`,
`Default/Extension Scripts`, and `Default/Extension State`
(the login session — Cookies, Local Storage, IndexedDB —
lives elsewhere and is preserved). After clearing, the new
build runs: the crawl-start response carried the new
`tabId` field and the SW's storage writes landed.

## Live finding 2026-10-08 (4) — `executeScript` object return values
can be lost in real Chrome

**Observed (user's real Chrome 154, 2026-10-08
11:06 GMT):** `chrome.scripting.executeScript`
with `world: 'MAIN'` RESOLVED, but
`frames[0].result` was not a usable object —
the sender failed with "no result from the
main world" and the crawl fell back to the
direct fetch (401). The identical code returns
proper object results in the Playwright test
Chromium (crawl completed 7/7 there).

**Fix:** the injected func now transports its
result as a JSON **string** (`JSON.stringify`
inside the func, `JSON.parse` in the SW) -
string return values are serialized more
robustly than page-realm objects. The func
also writes an execution probe to
`<html data-dkopt-probe>`; when the result is
still unusable, the SW reads the probe back
via a second `executeScript` and logs the raw
frames + probe to the service worker console,
so a failing Chrome can be diagnosed from one
console paste. New regression test: a
non-string injection result is refused as
NETWORK (never mis-parsed).

— Live-smoke session, 2026-10-08 (read-only; cart unmodified)

## Remaining evidence gaps (small)

1. **Plus A/B (S-4 residual)** — needs a Plus-enabled session; per-seller Plus service lists are already machine-readable.
2. **Plus × large-item interaction (D-13 residual)** — does Plus waive the 359,000 large-item fee? One session with Plus active would answer.
3. **Count-promo shapes (S-3 residual)** — find a product actively running "buy 2 → free delivery" and capture its payload field.

## Live finding 2026-10-08 (4) — executeScript object return values can be lost in real Chrome

The user's real Chrome 154 answered the delegated cart fetch with "no
result from the main world" while the identical object-transporting
build captured all 7 items in the test Chromium. A plain object (or a
promise of one) returned by the injected func did not survive the trip
back in the crawl path. Interim fix (committed `86d2c92`): the func
transported its result as a JSON string and wrote an execution probe to
`<html data-dkopt-probe>`; the service worker logged raw frames + the
probe on failure.

## Live finding 2026-10-08 (5) — promise returns from injected funcs are
unreliable in the crawl path; direct string returns are not

With the string transport the injected func verifiably RAN in the crawl
path (its DOM side effect was present within 2ms) yet executeScript
resolved with `result: null` ~2ms after the func started - the returned
promise was not awaited - and the fetch never fired (no request with the
extension's signature in the network capture). The same behaviour
reproduced in the test Chromium, so it is not a Chrome-154-only bug.
By contrast, a func returning a PLAIN STRING (not a promise) returned
its value correctly on every injection in every tested Chrome, including
service-worker-context injections (a probe-read func returned the
attribute value on every poll for 30s).

Fix (the DOM-result channel): the injected executor writes its outcome
to `<html data-dkopt-result>` prefixed with a per-call nonce (every
outcome path writes it, including the synchronous scope refusals), and
the worker polls a tiny reader func - whose return is a plain string -
until the nonce-prefixed outcome appears (120ms interval, 30s budget,
matching the postMessage round trip this whole path replaced). The
executor's own return value is deliberately ignored.

## Live finding 2026-10-08 (6) — a controlled experiment isolates the
injected func's source as the failure

A minimal hand-written func WITH ARGS injected from the service worker
into the main world ran perfectly (wrote `ran:hello` to the page,
returned `got:hello`), while the built `mainWorldFetch` never ran (not
even its first statement). So service-worker-context `executeScript`
with args works; the problem was the built func's own source.

## Live finding 2026-10-08 (7) — the bundler minifier silently breaks
executeScript funcs (the root cause)

`chrome.scripting.executeScript({func})` serializes the function by
value (`func.toString()`) and evaluates it in the page, which cannot
see the extension's module scope. The bundler's minifier hoists
module-level constants to shared bindings and rewrites the func to
reference them. The injected code then dies on a ReferenceError before
its first real statement - and executeScript RESOLVES with a null
result instead of rejecting, so the failure is silent and looks exactly
like "the func never ran". Inspecting the built chunk confirmed it: the
result-attribute name and the timeout budget were hoisted to
module-scope constants (`A="data-dkopt-result"`, `V=3e4`) referenced
by the injected func.

This retroactively explains the confusing 2026-10-08 matrix (the
"object transport worked at 02:40 but nothing works now"): earlier
builds referenced hoisted constants only at deferred points (e.g.
inside the abort-timer callback), so the func partially ran before
dying - the failure mode varied with where the hoisted reference sat in
the body.

Fix: every constant the injected funcs use is a literal INSIDE the func
body, and each literal appears exactly once (a literal used twice gets
hoisted to a module binding again - verified in the rebuilt chunk:
`"data-dkopt-result"` and `3e4` inline, zero references to module
bindings). A unit test asserts the serialized funcs reference no module
bindings. Note the unit tests cannot catch the hoisting itself (they run
the unminified source) - the built-output inspection and the end-to-end
crawl are the real guards.

Live verification (2026-10-08, 13:27Z): with the self-contained build
the crawl completed end to end - phase "complete", all 7 items done,
49 snapshots in IndexedDB (the 7 new ones written by delegated
main-world fetches of the live cart and product APIs).

None of these block the go decision. T03 (capture via JSON APIs) and T04 (solver) may start.

— AutoCoder, 2026-09-30 (v2: D-14 confirmed, S-5 observed, cart restored)