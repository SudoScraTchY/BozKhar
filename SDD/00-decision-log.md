# 00 — Decision Log

This file records every decision taken during the brainstorm and clarification rounds, with rationale and consequences. It is the single source of truth for *why* the spec is the way it is. When a spike (Phase 1) invalidates an assumption, the corresponding decision is amended here — never silently deleted.

Status legend: **Locked** (stakeholder-confirmed), **Assumed** (default adopted, pending spike verification).

## D-01 — Advise-only, never touches the cart

**Decision:** The extension computes and displays an optimal purchase plan; it never adds, removes, or moves items in the user's Digikala cart by itself.
**Rationale:** Keeps the tool firmly on the safe side of Digikala's terms of service, avoids destructive mistakes, and keeps the mental model simple: the user always stays in control.
**Consequence:** The results UI must make the plan easy to apply manually (per-vendor grouping, clear instructions). "One-click apply" is a nice-to-have (`NTH-06`) that would require explicit re-evaluation.

## D-02 — Local-only computation and storage

**Decision:** The solver runs in the browser; all captured data is stored in browser-local storage. Nothing is sent to any server.
**Rationale:** Privacy (a shopping list is personal), zero infrastructure cost, and a much smaller ToS/rate-limit footprint.
**Consequence:** No server component exists in any phase. Cart sizes must stay small enough to solve locally in under a second (`NFR-03`).

## D-03 — Capture is user-initiated only

**Decision:** Offer data is captured only when the user explicitly acts — clicking "Add to comparison" on a product page, or clicking the optimize button on the cart page. No background scraping, no scheduled monitoring.
**Rationale:** Minimizes rate-limit and account-flag risks, and respects the marketplace's infrastructure.
**Consequence:** Data can be stale; staleness must be surfaced (`FR-04`). Price alerts as a background feature are only a future nice-to-have with a policy decision attached (`NTH-03`).

## D-04 — Two capture entry points

**Decision:** (a) An "Add to comparison" button on the product page captures the full vendor offer list for that product + variant. (b) A button on the shopping-cart page opens each product page in the cart (respecting the saved variant), captures its offers, and closes the page afterward.
**Rationale:** The stakeholder explicitly requested both: manual comparison-building while browsing, plus a one-shot crawl of the whole cart for convenience.
**Consequence:** The cart crawl must be throttled and resumable (`06-architecture.md`, `R-04`, `R-08`). The two paths share one extractor/normalizer pipeline.

## D-05 — Item identity = product + variant

**Decision:** "The same item" means the product page **plus the selected variant** (color, size, etc.).
**Rationale:** The variant can change the entire offer list, so offers across variants are not comparable.
**Consequence:** The comparison list key is productId + variantId (`08-data-model.md`); the cart crawl must reproduce the correct variant when opening pages (spike `S-2`).

## D-06 — Locks: pin and ban; locked items leave the calculation; the pinned vendor's fee is "already paid"

**Decision:** Users can **pin** an item to a specific vendor (whatever the outcome, that item is not reassigned) and **ban** vendors per item. Locked items are excluded from optimization. Crucially, a pinned item's vendor keeps its normal single delivery fee in the real cart — so when the solver assigns *other* items to that same vendor, it must treat that fee as **already paid**, not add a second one.
**Rationale:** Excluding locks naively would overcount the total: in reality there is only one fee per vendor shipment, and the locked item already incurs it. The stakeholder explicitly agreed with this interpretation.
**Consequence:** The solver models pinned vendors as "open with a sunk fee" — other items can ride along fee-free. Worked example in `07-solver-behavior.md`.

## D-07 — Single objective: total cost; delivery time is out

**Decision:** The only optimization goal is the lowest total (items + delivery). Delivery time and parcel count are not optimized in any phase.
**Rationale:** Stakeholder: "We cannot do delivery time." Parcel count is used only as a tie-breaker, never as an objective.
**Consequence:** No multi-objective machinery is needed (`04-optimization-analysis.md` rejects Pareto methods). Time-aware plans are `NTH-07`, gated on Digikala exposing reliable ETAs.

## D-08 — Promo types: same-item count and vendor-wide count; amount thresholds unverified

**Decision:** Two promo shapes are supported: "buy 2 (or n) of this item from vendor X → free delivery" and "buy z items total from vendor Y → free delivery". Amount-threshold promos ("free delivery over amount X") may exist but are unverified.
**Rationale:** The stakeholder confirmed both count types exist on Digikala. Amount thresholds were raised as a possibility but never confirmed.
**Consequence:** Amount thresholds are `OQ-01` / `NTH-08`, added only after the spike proves detectability.

## D-09 — The main plan buys exactly the quantities the user wants

**Decision:** The optimal plan never adds extra units. Promos that would require buying an additional unit become separate **hints**, evaluated after the main solve.
**Rationale:** Stakeholder: the main plan must remain "the cheapest for the quantities the user actually wants." Suggestions are welcome; silent cart inflation is not.
**Consequence:** The solver core stays a pure assignment problem; the hint layer is a separate pass (`07-solver-behavior.md`).

## D-10 — Hint gating: net savings always shown; net increases only within tolerance

**Decision:** When suggesting an extra unit to unlock free delivery, the delivery fee saved is counted against the extra unit's price. A **net saving** is always shown. A **net increase** is shown only if it stays within a tolerance expressed as a percentage of the cart total — a user setting. Large increases are rejected outright.
**Rationale:** Stakeholder example: items X=10, Y=5, Z=90. Z's vendor has a "2 items → free delivery" promo — an extra Z unit costs 90 to save a fee, so it must be **outright rejected**. The same promo on Y (extra unit costs 5, fee removed) is fine to notify.
**Consequence:** Tolerance is a first-class setting (`FR-14`); the X/Y/Z case is a mandatory solver test fixture (`T04`).

## D-11 — Extra-unit hints only for items already in the basket

**Decision:** Hints never introduce a product the user is not already buying.
**Rationale:** The tool optimizes the user's intent, not a bigger basket. New-product discovery is a different product.
**Consequence:** The hint generator's candidate set is exactly the comparison list.

## D-12 — Digikala Plus is a user toggle

**Decision:** The user states whether they have a Digikala Plus subscription (a simple toggle). The solver then applies Plus delivery-fee benefits where they apply.
**Rationale:** Membership is not reliably detectable from public pages, and the user knows their own status.
**Consequence:** Plus logic is input, not detection; where Plus does not apply (large items, see D-13) it is ignored.

## D-13 — Large items: fixed delivery fee, charged per shipment, Plus does not apply

**Decision:** Very large items carry a fixed delivery fee per shipment; the Plus subscription does not remove it (stakeholder belief, "AFAIK" — verify in spike).
**Rationale:** Stakeholder-confirmed behavior for large/bulky goods on Digikala.
**Consequence:** Offers get a `isLargeItem` flag; the fee model has a special large-item branch; spike `S-5` verifies per-shipment semantics.

## D-14 — One delivery fee per vendor shipment, regardless of how many items ride it

**Decision:** We assume Digikala charges a vendor's delivery fee once per shipment from that vendor, even when several items are bought from it.
**Rationale:** This is the standard marketplace behavior and the entire premise of consolidation savings.
**Consequence:** It is the single most load-bearing assumption — spike `S-6` must confirm it before the solver design is considered final.

## D-15 — Solver: exact subset enumeration locally; greedy fallback for giant carts

**Decision:** The optimizer enumerates possible vendor sets exhaustively in the browser — exact, dependency-free, trivially respects locks/bans — and falls back to a greedy heuristic only if a cart exceeds the supported size.
**Rationale:** Realistic carts are tiny (tens of items, ~a dozen candidate vendors), so exactness is essentially free; no solver library or service is needed. See `04-optimization-analysis.md`.
**Consequence:** Scale thresholds and the degradation path are defined in `07-solver-behavior.md` and tested in `T04`.

## D-16 — Capture fetches are delegated to the page main world (site routing headers)

**Decision:** Crawl (cart + product) fetches execute in the page's **main world** on the requesting tab, via `chrome.scripting.executeScript({target:{tabId}, world:'MAIN', func, args})` called directly from the service worker, with the site's own routing header set (`x-site: DIGIKALA`, `x-source: WEB`, `X-Web-Optimize-Response: 1` — non-secret markers, live-captured via CDP 2026-10-07) as args. The injected func (`mainWorldFetch`) is self-contained, GET-only with session credentials, and returns its result to the SW as data (no postMessage round trip). The SW keeps orchestration, state, containment, and error handling. The SW's own session fetch remains the fallback when the tab is unreachable.
**Refinement 3 (2026-10-08, live findings (5)+(7)):** the injected func's *return value* is not a reliable result channel in the crawl path (a returned promise resolved to null ~2ms after the func started, in both the test Chromium and real Chrome 154), so the executor now writes its outcome to `<html data-dkopt-result>` prefixed with a per-call nonce, and the worker polls a tiny reader func whose plain-string return is reliable everywhere. The injected funcs are fully self-contained: every constant is a literal inside the func body used exactly once, because the bundler minifier hoists repeated literals to module-scope bindings and rewrites the func to reference them - the injected code then dies on a silent ReferenceError and executeScript resolves with a null result (this was the root cause of the 2026-10-08 401 reports). A unit test audits the serialized funcs for module-binding references; the built chunk is inspected for hoisted literals.
**Rationale:** Three execution contexts were live-verified: the service worker (request reaches the API, answers 401 — its origin is `chrome-extension://`), the content-script **isolated world** (the API's CORS policy allows only the web origin, so the preflight is checked against the extension origin and blocked — CDP shows the `OPTIONS` with no follow-up GET, toast "Failed to fetch"), and the page **main world** (the identical fetch returns 200). Two main-world injection mechanisms were tried: the classic content-script `<script>`-tag insertion — which **does not execute in the current Chromium** (live-verified 2026-10-08: elements appended to the correct `document.head` never run in any world — no console output, no postMessage, no side effects, no CSP on the page) — and `chrome.scripting.executeScript` (the official API), which works (live-verified: trivial func returns its value; the delegated cart fetch returns 200 with body).
**Consequence:** Crawl start must originate from a content-script surface (the cart page button — the only start surface today; an options-page start would run without a tab id and fall back to the SW fetch). D-01 is structurally preserved (GET-only, baked into the serialized func, tested); D-02 runs on both sides of the delegation (SW guard before the tab is touched, plus a defense-in-depth host check inside the func). If the site rotates the marker values, the cart crawl 401s loudly (contained per crawl) and the values need re-capturing via CDP. The func runs in the page's main world and is visible to page JS; the payload is read-only cart data, so the exposure is equivalent to the site's own traffic. **Permission surface:** the `scripting` permission was added for this (NFR-06 requires a decision-log entry — this is it; the manifest permission audit test was updated in the same change).


## D-17 — The cart crawl captures every in-stock variant, not just the selection

**Decision:** The crawl's product step normalizes **every in-stock variant** of each cart item's product into its own append-only snapshot (one snapshot per variant). The product payload already carries all variants - each is a seller-offer with its own price, Plus-lock and fee - so this costs **no extra API calls**; out-of-stock variants are excluded (not purchasable). The cart item record still tracks its own selection (the variant the cart holds); T05 assembles the solver input from the full per-product variant set.

**Context (live report 2026-10-08):** the user deliberately picked the most expensive vendor on some items, yet the optimizer had nothing cheaper to find: the crawler fetched the payload and discarded every variant except the current selection, so every snapshot carried exactly one offer (the chosen one) and the solver trivially "optimized" to the status quo.

**Alternatives considered:** (a) capture only the selection (rejected - leaves the solver nothing to optimize; contradicts FR-05); (b) a second API call per product for alternatives (rejected - the data is already in the payload).

**Verification:** fixture test asserts the sibling in-stock variants are snapshotted and the out-of-stock (cheapest-but-unavailable) variant is not; suite 164/164.

## D-18 — The results page is a bundled extension page, opened by the SW on crawl completion

**Decision:** T05.1/T05.2 ship a results page (`src/results/`) as an extension page (Surface 3 of 09-ui-spec): verdict cards (current total / optimized total / savings, plus the estimate caveat when any input fee is estimated), the vendor-grouped plan with one flagged fee line per group, and the how-to-apply panel. It is bundled as an explicit **vite HTML entry** (`build.rollupOptions.input` in vite.config.ts) — crxjs only processes HTML from the manifest's html-entry fields (`options_ui`, `default_popup`, …) and copies `web_accessible_resources` HTML **raw** (live finding 2026-10-09: a WAR-only registration left the page's script tag pointing at `./index.ts`, so the built page rendered blank). The vite entry rewrites the module script and stylesheet to bundled assets. No `web_accessible_resources` entry is needed: any packaged file opens via `chrome.runtime.getURL('src/results/index.html')` from the service worker the moment a crawl completes, and no web origin can reach it (NFR-06 intact — the manifest audit test passes unchanged). The crawl-start response now carries the final `done`/`failed` counts, and the content script closes its overlay from the response as well as from the finished progress broadcast — belt-and-braces against the live-reported "overlay never went away" (a missed broadcast previously left the overlay up forever).

**Context:** the user's 2026-10-08 report: crawl completed 7/7 but the overlay stayed and "there was no report on cart on how much it changed". Two defects: (1) no results surface existed (T05 unimplemented); (2) the overlay's only dismissal path was the progress broadcast, which can be missed (SW restart, messaging race).

**Alternatives considered:** (a) render results inside the cart page DOM — rejected: cart re-renders (SPA) would wipe it, and the checkout panel is site-owned markup we must not mutate (advise-only, S-7); (b) `options_ui` page doubling as results — rejected: options is a settings surface; results need a clean tab the SW can open unprompted; (c) a chrome.notifications summary — rejected: no numbers-in-notifications surface, and the user asked for a report; (d) relying on the broadcast alone — rejected by the live incident. The page reads both storages (comparison list + append-only snapshot store) directly — extension pages hold the `storage` permission, so no messaging hop is needed for reads.

**Consequence:** NFR-06 is preserved (no new permission; `web_accessible_resources` with empty `matches` exposes nothing to web origins — verified by the manifest audit test). The solver-input assembly is pure (`src/results/assemble.ts`) and unit-tested end-to-end: a cart holding the expensive variant with a cheaper sibling captured yields a plan that switches variants and names the exact variantId (D-17 passthrough), with the current-total arithmetic reconciling against the solver's fee model (FR-12). Unknown fees score at the largest known fee (SDD 08 default, now enforced in `solve.ts`) and the current-total returns null when any fee is unknown, so the verdict never fabricates a "savings" number.
## D-19 — Real shipping costs come from the shipment-quote API (fee correction)

**Decision:** After the product phase, the crawl quotes the real per-package shipping costs via `POST https://api.digikala.com/v4/shipment/` with the fixed body `{"is_initial_load":true}` (spike finding 2026-10-09, `spike-findings.md`), delegated to the cart tab's main world (`mainWorldShipmentQuote` - the extension's only POST; method baked in, URL and body fixed by the SW wrapper). The response's `data.shipment_types.normal[]` is one package per vendor group: `submit_types[0].shipping_cost` is the real fee, `cart_items[]` names the variants that share it. The normalized record (`ShipmentRecord`, store `shipments`, key `latest`, DB v1→v2) prices the assembler: a cart item's **current** offer gets its package's real fee (overriding the product API's per-offer `delivery.feeAmount`, which is sometimes null - the live cart's total then rendered as "—"). Alternative offers keep the product-API fees: their package fee is unobserved, and the solver's one-fee-per-vendor-group model matches the package model.

**Why not CSS selectors / the product page:** the "روش و هزینه تحویل" section is rendered from product-API JSON; the quote API is the authoritative, structured source (S-7: read JSON APIs, never scrape markup).

**D-01 amendment:** D-01 ("the controller only ever GETs") gains exactly one exception - this fixed, read-only quote POST (it returns pricing and does not modify the cart). The exception is structural, not permissive: `mainWorldShipmentQuote` hard-codes `method: 'POST'`, and the SW wrapper fixes URL and body, so no caller can target another endpoint or verb.

**Consequences:** the current-cart total and the savings card become exact whenever the crawl ran with a reachable tab (a failed quote is contained: fees stay product-API, the report stays honest). Package fees are per vendor group, so a multi-item package charges one fee once - matching checkout behavior. Cost: one extra POST per crawl; the `shipments` store (additive, DB version 2).

## D-20 - executeScript calls are bounded and retried

Date: 2026-10-09
Status: accepted

Problem: Live verification of D-19 showed the
crawl hanging on "dar-e shoro-e baresi-e sabd..."
(starting cart review) with no API request ever
issued: chrome.scripting.executeScript from a
cold MV3 service worker sometimes never invokes
its callback. The delegate then awaits a promise
that never settles - the crawl-start response
never returns and the results tab never opens.
This matches the user's 2026-10-08 "stuck at
starting" report and is intermittent: the same
build completed a full crawl minutes earlier.

Decision: every executeScript call in the
delegate layer is wrapped in withTimeout
(default 8s) and the initial injection retries
up to 3 times (300ms apart). A lost read
callback during polling counts as "no outcome
yet" and the loop continues, bounded by the
30s outcome deadline. Retried runs are
idempotent: delegated calls are reads (GET
fetches and the fixed quote POST) and the
outcome channel is nonce-keyed. Timing lives
in the exported EXECUTE_TIMING object; tests
shrink it.

Alternatives: (a) leave it - the crawl hangs
indefinitely with no recovery path; (b) move
the fetch to the content script - the
page-context requirement (site routing header
set) rules that out (D-16).

Consequences: a lost callback now costs at most
~24s per delegated call before the caller's
containment kicks in (per-item failure for
crawl fetches, a contained skip for the quote);
a retried injection may issue a duplicate
read-only request.

Amendment (live preflight probe, 2026-10-09):
the quote POST must NOT carry the routing
header set (x-site / x-source /
x-web-optimize-response). A four-way probe
from the logged-in cart page showed:
no headers -> 200, Content-Type only -> 200,
routing headers -> "Failed to fetch",
routing + Content-Type -> "Failed to fetch".
The shipment endpoint's CORS preflight
rejects the routing markers (they are a
checkout-cart-API requirement); the quote
authenticates with the session cookie alone.
The quote executor therefore sends only
Content-Type: application/json.

Evidence: live CDP diagnostic 2026-10-09
(.openclaw/tmp/d19_diag.py): overlay stuck
120s, zero product-API requests, the SW alive
and answering crawl-abort pings; unit tests
"executeScript callback loss (D-20)" in
tests/capture-fetch-delegate.test.ts
(lost-callback retry, lost read, permanent
loss).

## D-21 - the cart surface re-sends a
crawl-start the worker never answers

Date: 2026-10-09
Status: accepted

Problem: live diagnostics (2026-10-09,
.openclaw/tmp/d19_cold.py, d19_trace.py)
showed the crawl-start promise sometimes
never settles when the MV3 service worker
cold-starts for the message: the worker
hangs on its first chrome API call, or
finishes the crawl and dies before the
response is delivered. The overlay then
sits on "starting cart review..." forever
- the user's original 2026-10-08 report.
The worker's message loop stays responsive
when an extension page keeps it warm (all
warm-worker runs completed), so the fault
is specific to the cold-start path.

Decision: the cart surface bounds the
crawl-start round trip at 35s
(CRAWL_START_TIMEOUT_MS) and re-sends
once on timeout or a lost connection.
Chrome terminates a wedged worker after
~30s, so the re-send reaches a fresh
worker whose in-flight latch (module
state) is reset, and the retry starts a
clean crawl. Trade-off (accepted): in the
rare case the first crawl was merely slow
(40+ items), the retry can start a second
crawl; captures are idempotent
re-snapshots, so the worst case is
duplicate work, never wrong data.

Alternatives: (a) leave it - the overlay
sits forever with no recovery; (b) keep
the worker warm via an alarm - intrusive
and battery-hostile; (c) a background
page - not available in MV3.

Consequences: a cold-start hang now
self-heals within ~35s (the crawl runs
and the results tab opens); the crawl may
run twice in the rare slow-crawl case.

Evidence: tests/capture-content.test.ts
"re-sends the crawl-start when the cold
worker never answers (D-21)"; live runs
d19_cold.py (second click restarted the
crawl - 7 fresh API requests) and
d19_trace.py (cold-worker run completing
with the D-19 quote POST).

**Amendment (unit correction, 2026-10-09, user report "wrong total"):** the
first D-19 build stored `submit_types[0].shipping_cost` raw. The shipment API
reports **Rial** (verified live: shipping_cost sum 5,080,000 vs the checkout
page's displayed fees 508,000 toman - exactly 10x), while the canonical model
is **Toman** (SDD 08: "payloads are Rial, the canonical model and the solver
are Toman"). The product API's fees reach the solver already converted
(`normalize.ts`), so the raw value inflated every corrected fee 10x - the
user's current total read 9,000,000+ against a real ~3,500,000 with
fabricated 6,000,000 "savings". `readShipmentRecord` now converts via
`rialToToman` at read time; the correction is the only conversion (same rule
as every other payload).

## D-22 - the fee table prefers shipment-observed fees (2026-10-09)

**Problem:** the fee table took the maximum product-API fee per vendor.
The live package quote (D-19) is the real charge; the product API's
per-offer fee is a per-seller guess that can sit above or below it.
Charging the estimate when the real fee is known overstates the total.

**Decision:** `buildFeeTable` (evaluate.ts) gives any offer whose
`feeSource` is 'shipment' (assembler-stamped from the live quote)
precedence over product-API estimates. Two observed packages for one
vendor in one quote charge the higher - never quote a total too low
(SDD 08). Estimates only fill vendors the quote did not cover.

**Alternatives:** (a) always max everything - overstates when the real
fee is known; (b) prefer the lower - can quote too low.

**Consequences:** fees for quoted vendors are the real charges; the
estimate fallback remains for unpriced vendors and is still labelled.

**Evidence:** tests/solver-consolidate.test.ts "uses the live package
fee over the product-API estimate", "charges the higher of two observed
packages for one vendor".

## D-23 - fee-consolidation repair pass for approximate mode (2026-10-09)

**Problem (user report, exact example):** Item A costs 280 at vendor 1
and 320 at vendor 2; Item B costs 300 at vendor 2; every vendor package
costs ~100. The greedy baseline picks the per-item cheapest vendor
(A->v1, B->v2) with the fee only as a tie-breaker: 280 + 100 + 300 +
100 = 780. Joining both items on vendor 2 pays one package: 320 + 300
+ 100 = 720. The user's cart has 40 distinct vendors - above the
exact-mode envelope (15) - so it runs approximate mode and always saw
the unconsolidated 780.

**Decision:** `consolidate.ts` runs a repair pass over the greedy
assignment. For each vendor group holding a single item, it tries
moving that item onto every other vendor in the assignment (and onto
vendors that would merge groups), recomputes the true grouped total
(items + one fee per vendor group), and applies the move only when it
strictly lowers the total. The pass repeats until no move helps. The
repaired assignment is evaluated through the normal `buildGroups` path,
so locks, stock, large-item classes and promos all still apply.

**Alternatives:** (a) raise the exact-mode envelope - combinatorial
explosion at 40 vendors; (b) a full local-search metaheuristic -
overkill for a single-fee saving; (c) leave it - the user's manual
720 beats the tool's 780, which defeats the tool's purpose.

**Consequences:** approximate-mode plans now find vendor consolidations
the greedy baseline misses; exact mode is unchanged (it already
optimizes globally). The repair is a strict improvement pass: the
repaired total never exceeds the greedy total.

**Evidence:** tests/solver-consolidate.test.ts "repairs the greedy
baseline to the vendor-consolidated arrangement (user example)"
(grandTotal 720, one group, one fee), "never repairs into a worse
arrangement than the greedy baseline", "keeps splitting when
consolidation does not pay off".

## D-24 - the stored item set mirrors the live cart (2026-10-09)

**Problem (user report):** "prices get added together instead of full
clearing previous results." The crawl merged the cart into the item
store (union) and never deleted items the user removed, so every later
report rendered the accumulated union of all crawled carts.

**Decision:** `sw-controller` `onCart` now deletes stored items whose
keys are absent from the fresh cart before putting the merged entries
(the merge still preserves locks/identity for surviving items), and
puts only the cart's entries. The item store is exactly the live cart.

**Alternatives:** (a) clear the whole store per crawl - loses locks for
items still in the cart; (b) leave the union - the reported bug.

**Consequences:** removing an item from the cart removes it from the
next report; totals no longer accumulate across runs.

**Evidence:** tests/capture-sw-controller.test.ts "drops items the user
removed from the cart (D-24)".

## D-25 - crawl UX: button lock, progress heartbeat, unknown-fee marker (2026-10-09)

**Problem (user report):** the optimize button stayed clickable during
the crawl (a second click just failed against the worker latch); the
overlay sat on "در حال شروع بررسی سبد…" until the first product
fetch landed (seconds on a cold worker); unknown seller fees showed
the fallback number with no per-row indication of which seller is
unpriced.

**Decision:** (1) the button enters a capturing state with a live
label for the whole crawl and restores on finish; (2) the worker
broadcasts a progress heartbeat (done 0 of N) immediately after the
cart read, so the overlay leaves "starting…" at once; (3) a plan
group with an unknown fee (fee === null) carries a per-row
"feeUnknown" marker in addition to the page-level estimate caveat.

**Alternatives:** none meaningful - all three are direct UI responses
to the report.

**Consequences:** the crawl feels live and cannot be double-started;
the user can see exactly which seller's delivery fee is unknown.

**Evidence:** tests/capture-sw-controller.test.ts (heartbeat asserted
via the onProgress stub in the D-24 crawl tests); message keys
crawlRunning/feeUnknown in src/shared/i18n/messages.ts.

## D-26 — Apply-to-cart flow: user consent + CartApplier isolation (2026-10-10)

**Problem.** The results page ends at insight (T05 advise-only, D-01): the
user must redo the plan by hand in Digikala. The user explicitly consented
to an "Apply to cart" action on 2026-10-10 ("yes i do consent with the
apply button, its a must have") and supplied the result-page redesign brief
(Result-Page-Redesign.md) whose section 5 specifies the flow.

**Decision.** Amend D-01: the extension may now WRITE to the cart, but only
inside a user-initiated apply flow and never on its own:
- All cart mutation sits behind `CartApplier { preflight(plan), apply(plan,
  onProgress), undo(snapshot) }` so the transport can change (internal API
  or UI automation is open decision 10.3 of the brief).
- Preflight re-fetches every chosen offer (price, stock, seller still offers
  it) BEFORE any mutation; a change or a stock-out opens a sheet, never a
  silent continue.
- The current cart is snapshotted to extension storage before the first
  mutation and kept until the next apply; undo restores it with the same
  progress UI.
- Apply is sequential per line: add the new offer, VERIFY it is in the
  cart, only then remove the old line. Unchanged lines and locked items
  are left alone. No automatic retries; partial failure keeps the old
  rows in place and offers per-item retry + undo-all.
- The flow never navigates on its own, never checks out, never pays.

**Alternatives.** (a) Stay advise-only — rejected by the user's explicit
consent. (b) UI-automation-only transport — premature; the interface keeps
both open.

**Consequences.** D-01's GET-only rule is amended (this entry is the
required decision-log record for the new permission scope; no new
manifest permission is needed — host access already covers the API).
The apply button is the only primary action on the page.

**Evidence.** Result-Page-Redesign.md section 5 (user-supplied brief);
user consent message 2026-10-10.

## D-27 — Result-page redesign adopted (2026-10-10)

**Problem.** The exported PDF critique (brief section 2) lists P0 defects:
misleading parcel totals that exclude shipping, hidden staleness, mixed
digit systems, no savings justification, invisible lock state, missing
Plus/hints/shipped-by indicators.

**Decision.** Adopt the brief ("the settled bill") wholesale:
- Presentation changes only; the optimizer's math and output contract are
  untouched (brief rule 1).
- Token palette, type scale, radii and the Lalezar/Vazirmatn split per
  brief section 3; fonts bundled (extension CSP, privacy — Vazirmatn is
  already in src/results/fonts/, Lalezar added for the wordmark/H1).
- All figures via Intl.NumberFormat('fa-IR'); dates via
  RelativeTimeFormat('fa') + fa-IR-u-ca-persian in tooltips
  (Asia/Tehran); no ISO strings, no Latin digits, currency unit after the
  number in --muted.
- Section-10 defaults adopted: locked items stay in every total with their
  seller's shipping; hint tolerance 2% of the plan total (code constant);
  stale threshold 30 minutes (code constant); baseline split shown as
  totals only when unknown; cart-mutation transport hidden behind
  CartApplier (D-26).
- Where the optimizer does not yet return brief-section-8 data (e.g.
  shipSource per parcel, optimalityGap, per-item original offer), the
  section is hidden gracefully until the data exists.

**Alternatives.** Keep the current card UI — rejected: it carries the P0
defects above (parcel totals that exclude shipping are the worst: they
understate the real price by the shipping fee).

**Consequences.** The results page is rewritten around parcels (مرسوله),
the one place Digikala actually charges. The invariant
ledger-payable = Σ parcel totals = hero plan = action-bar total is
asserted in tests.

**Evidence.** Result-Page-Redesign.md (user-supplied brief, 2026-10-10).

## D-28 — Redesign implementation record (2026-10-11)

**Facts discovered while implementing D-26/D-27 (all
verified by tests in this commit):**

1. **Promos never reached the solver in the real flow.**
   `buildSolverInput` hard-coded `promos: []`, so the
   extra-unit hints (SDD 07 step 7) and promo fee
   waivers only ever fired in unit tests that built the
   input by hand. Fixed: the snapshots' captured promos
   ride along (amount-threshold still dropped — unverified,
   OQ-01). The optimizer's math is untouched; the input
   now carries data the captures already hold.
2. **The cart payload's seller and product URL were
   dropped by the merge.** `ComparisonItem` gains
   `sellerId`/`sellerName`/`productUrl` (the reader
   already kept them) — the "قبلاً" change line and the
   item title link need them.
3. **The change line's "current offer" rule.** The
   cart seller's offer on the cart variant, from the
   LATEST capture that still shows it (snapshots are
   stored oldest-first, so a naive `find` picks the
   oldest capture and misses the cart's seller).
4. **The discovered cart-mutation contract** (read-only
   from the logged-in site, 2026-10-10): `POST
   /checkout/v1/carts/items` body `{variant_ids:[…]}`
   adds; `DELETE /checkout/v1/carts/items` body
   `{cartItemIds:[…]}` removes. The add takes NO
   seller: the gateway adds the variant's default
   offer. A pinned non-default seller therefore cannot
   be applied through the API transport — disclosed in
   the apply sheet; UI automation is the follow-up
   (open decision 10.3). A seller-only saving leaves
   Apply disabled (nothing applyable).
5. **DB v3** adds the `cartSnapshots` store (key
   `latest`) for the undo snapshot (D-26).
6. **Progress contract.** The applier announces the
   changed lines (`adding` → `added`/`failed`); the
   UI seeds the `pending` rows. Tests assert the
   add → verify → remove ordering and that a failed
   line keeps its old row.

**Consequences.** The invariant (ledger = Σ parcels =
hero = action bar) is asserted in
`tests/results-page.test.ts`; the pipeline is covered
in `tests/results-apply.test.ts` with a mock transport
(no live writes in tests). Live E2E still gated on the
smoke profile's anti-bot cooldown.

**Evidence.** `src/results/apply.ts`,
`src/results/cart-transport.ts`,
`src/results/assemble.ts`, this commit's test runs
(232/232).

## D-29 — Live E2E investigation + offline redesign E2E (2026-10-11)

**Goal.** Close the brief's section-11 E2E
gaps on the live site.

**Findings (all verified by direct probes):**

1. **The storefront tarpits browsers.** From
   this host, any browser (the old pw
   chromium-1181, the user's real Chrome 155,
   Tor-routed Chrome, h2-disabled Chrome)
   stalls on `www.digikala.com` while `curl`
   (HTTP/1.1) gets 200 in ~60 ms. `api.digikala.com`
   answers browsers fine (a navigation returns
   the JSON 401 in seconds) — the tarpit is
   www-only, at the TLS/transport layer.
2. **DNS is partly dead.** `www.digikala.com`
   returns four A-records; three
   (185.38.109.202/203/204) refuse connections
   from this host, one (185.188.105.10) serves.
   Browsers pick the dead ones; `--host-resolver-rules`
   pinning works but does not lift the tarpit.
3. **The smoke profile's session expired**
   (401 body: «لطفا وارد حساب کاربری‌تان شوید»).
   The tokens are still in the cookie jar but
   no longer authenticate; refresh needs a www
   page load (tarpitted) or a login (user
   credentials).
4. **The shared smoke profile was upgraded**
   by Chrome 155 and the old pw chromium can
   no longer launch with it — the E2E now uses
   a fresh profile (`e2e-profile`) seeded
   directly into the extension's IndexedDB.
5. **Chrome 155 ignores `--load-extension`**
   even with `--disable-extensions-except`
   and the developer-mode pref set (the old
   chromium still loads unpacked extensions —
   that is what the E2E uses).

**Decision.** The redesign's E2E runs offline:
`e2e/e2e-settled-bill.py` renders the unpacked
dist in real Chromium with the real capture
(12 items / 1336 snapshots from the last live
crawl, `idb-dump.json`) seeded into the
extension's own IDB, and asserts the section-11
invariants: Persian digits in all UI figures,
no ISO strings, currency unit, staleness
disclosed, parcels carrying shipping. All six
checks pass (screenshot:
`.openclaw/tmp/e2e-settled-bill.png`). The
capture is estimate-mode (one current-offer
fee is genuinely unknown), so the honest
range shows and the hero/Apply correctly stay
hidden (SDD 08) — the hero/ledger/action-bar
agreement is covered by the unit tests on
known-fee fixtures.

**Consequences.** The live apply E2E (a real
cart write) is blocked on two environment
facts, not code: a fresh login (user action)
and a network path where the storefront does
not tarpit the browser. The mutation contract
itself was discovered read-only from the
site's own bundles (D-28) and the pipeline is
covered by 7 mock-transport tests.

**Evidence.** `e2e/e2e-settled-bill.py`
(6/6 PASS), the probe scripts in
`.openclaw/tmp/probe_*.py`, the 401 body
quote above.

## D-30 — Apply transport: cart calls run in a digikala tab's main
world (2026-10-16)

**Problem.** The apply flow shipped in D-26 could not work in the real
extension. Its transport (`src/results/cart-transport.ts`) called the
checkout cart API directly from the extension page origin. That host
answers **401** to extension-origin calls - the session cookies are
`SameSite=Lax` and are not attached cross-site, and its CORS preflight
allows only the web origin (D-16 evidence, re-confirmed in D-29). The
crawl solved the same problem by running its GETs in a digikala tab's
MAIN world with the site's routing header set; the apply path was
never moved. Two further defects compounded it: `runPreflight` /
`runApply` / `runUndo` had no `try/catch`, so the thrown 401 left the
sheet on "applying..." forever with no message, and `toCartLines`
parsed only `data.cart_items` while the LIVE payload nests its rows
under `data.packages[].cart_items[]` - so even with a session the flow
would have read an empty cart and applied nothing.

**Decision.** The results page no longer talks to the cart API at all.
Three message kinds (`capture/cart-read`, `capture/cart-add`,
`capture/cart-remove`) let the service worker run the call in an OPEN
digikala tab's main world:

- the read reuses `delegateFetchJson` (already GET-only, already
  carrying `SITE_API_HEADERS`) with the worker pinning the URL to
  `CART_API_URL`, so no caller-supplied URL crosses the boundary;
- the writes are two new injected funcs, `mainWorldCartAdd` and
  `mainWorldCartRemove`, with the verb AND the endpoint URL baked in as
  literals inside each func body and only an id crossing the boundary.
  This amends D-01's write surface to exactly `POST` and `DELETE
  /checkout/v1/carts/items`, reachable only from the user-initiated
  apply flow (D-26);
- a write publishes an `IN_FLIGHT` checkpoint under its nonce BEFORE
  the request leaves. `executeMainWorld` retries an injection whose
  callback was lost, and a blind retry would buy a second unit: the
  at-most-once guard makes the retry a no-op while the first request is
  in flight or done;
- the worker resolves the tab itself (`chrome.tabs.query` + a pure
  `pickDigikalaTab` preferring `/cart`) because `sender.tab` is unset
  for extension-page messages. **No tab is ever opened silently**: with
  none open the response is `NO_TAB` and the sheet says so;
- `CaptureError`/`CaptureResponse` now carry an optional HTTP `status`,
  so a 401/403 survives the round trip; the page maps it to the
  existing "sign in" copy, `NO_TAB` to its own sentence, anything else
  to a generic failure - every apply step now ends in a sheet with a
  reason, a retry, and a user-clicked link to the cart;
- `cartItemsOf` (extracted from the cart reader) is shared with the
  transport, so both agree on the payload shapes and the LIVE
  `packages[]` shape is found.

**Alternatives.** (a) Keep the direct fetch and only improve the error
copy - rejected: it would report the failure honestly while leaving
apply unusable. (b) Open a digikala tab automatically when none is
open - rejected: a silent tab is a surprise and its page may still be
hydrating; the user is told instead. (c) One injected func taking a
method argument - rejected: baking the verb into each func is what
makes the write surface auditable by reading the func. (d) Fall back
to the direct fetch when delegation fails - rejected: an
extension-origin cart call is the bug.

**Consequences.** D-01's "GET-only" rule is now: reads may be GET;
writes exist only as D-19's read-only shipment quote and D-30's two
cart endpoints, both reachable only through a user action. No new
manifest permission (host access and `scripting` already cover it).
`fetchOffer` deliberately stays a direct product-API call: that API
answers any origin, and keeping preflight tab-independent stops a
tab/delegation failure from being mislabelled "out of stock" by
preflight's containment.

**Evidence.** `tests/capture-fetch-delegate.test.ts` (D-30 audit: the
baked verb, the baked endpoint, the in-flight checkpoint, the
at-most-once retry, 401 → HTTP_STATUS with status),
`tests/capture-sw-controller.test.ts` (handlers + `pickDigikalaTab`),
`tests/results-cart-transport.test.ts` (message contracts, LIVE
packages shape, NO_TAB/RUNTIME/401 mapping), `tests/results-page.test.ts`
(the three error sheets, the visible seller-only reason). Live apply
verification remains blocked on a fresh login + a network path that
does not tarpit (D-29) - the CORS behaviour of POST/DELETE with the
routing headers from a page context is the one unverified link.

## D-31 — One brand mark, an export menu, and the Plus switch's real
hit target (2026-10-16)

**Problem.** Four user-reported defects in one round.

1. The Plus switch never toggled - not even visually. `renderPlusRow`
   built a `div.bk-switch` holding the invisible `input` and a
   `span.bk-switch-track`. Both are positioned with `z-index: auto`, so
   the track paints over the input and takes the hit: elementFromPoint
   at the switch centre returns `SPAN.bk-switch-track`. Nothing was
   listening there, so every click on the switch was swallowed. (The
   two existing tests dispatched `change` on the input directly and so
   never exercised the hit target - the tests passed while the control
   was dead in a browser.)
2. The toolbar carried a second, minimal line-art mark. The user
   replaced the supplied art and asked for one mark everywhere.
3. The only way out of the page was "Save as PDF".
4. The approximate-mode notice offered a "Calculate exactly" action
   whose handler was `rerender()` - the mode comes from the solver's
   scale envelope, so re-rendering changes nothing. A button that does
   nothing is worse than no button.

**Decision.**

- The switch wrapper is now a `<label for="bk-plus-switch">`. A click
  anywhere on the switch activates the control, whatever paints where.
- One mark set: `brand/BozKhar_Main_Icon.png` is cut into
  `public/icons/icon-{16,32,48,128}.png` and used for BOTH the app
  `icons` and `action.default_icon` (from one `ICONS` const in
  `src/manifest.ts`); the toolbar glyph set and its source are deleted.
  The header shows the same art at 96px from a new 256px asset
  (`logo-256.png`), so it stays crisp on a 2x display.
- `src/results/export.ts` adds CSV, Excel, pretty text, Markdown and
  plain text alongside the existing Save-as-PDF. Format names
  (`FORMAT_LABEL`) are English in both UI languages: they name file
  formats, not UI copy, and the same names label the copy buttons.
- Excel is a real `.xlsx`. Zero runtime dependencies (D-15) rules out a
  spreadsheet or zip library, so `export.ts` frames a store-only ZIP
  itself (fixed timestamps, CRCs, OOXML parts); the same plan always
  produces byte-identical output.
- The approximate notice and its dead action are removed, along with
  the three catalog keys only it used.

**Alternatives.** (a) `pointer-events: none` on the track - rejected:
it fixes the hit target by luck of paint order and leaves the wrapper
non-semantic. (b) Keep two mark sets and re-cut only the toolbar -
rejected: the user asked for one mark, and the second set was the thing
being deleted. (c) CSV with an `.xls` extension for "Excel" - rejected:
Excel warns about the format mismatch; a store-only `.xlsx` is a real
file. (d) SpreadsheetML 2003 - rejected for the same warning. (e) Make
the approximate button work instead of removing the notice - rejected:
there is nothing to compute; the envelope decision is deterministic.

**Consequences.** The toolbar is now a detailed 3D mark at 16px instead
of a purpose-cut glyph - legible but busier, which is the trade the user
chose. Exports run on the extension page with a blob URL and no host
permission; nothing new is fetched. `plan.mode` is still computed and
still labelled in the solver, it is simply not surfaced as a notice.
The copy row keeps `copyDone`/`copyFailed` localized; only the format
names are English.

**Evidence.** `tests/results-export.test.ts` (16: CSV quoting, the row
builder, the ZIP read back by hand with every entry's CRC compared to
`node:zlib.crc32`, sheet-name sanitizing, XML escaping),
`tests/results-page.test.ts` (the switch is a label AND a click on the
track toggles it; the six format names; CSV/xlsx/md/txt downloads and
their payloads), `tests/manifest.test.ts` (one mark set, files exist).
Live, in real Chromium with the real captured crawl seeded into the
extension's own IndexedDB in an isolated profile: a real mouse click on
the track flips the switch (False -> True) and both Plus notes appear;
`e2e/e2e-settled-bill.py` now asserts the 96px badge, the six formats,
the switch click and the missing notice; a separate pass drove all five
downloads and opened the `.xlsx` with Python's own `zipfile` +
`ElementTree` (parts present, CRC test passes, sheet named and
populated).

## D-32 — The controls the brief asked for: hint arithmetic, tolerance
on the plan, honest staleness (2026-10-16)

**Problem.** Three deliverables of `09-ui-spec` Surface 3 were still
missing (tracked as issues #3 and #4):

1. The hint card showed only the net effect. The spec wants the
   arithmetic item by item — "Add 1 more at 5 → removes its 12 delivery
   fee → you save 7" — and, for a suggestion that costs more, the
   verdict that says *why* it is on the page at all ("within your 2%
   tolerance"). A card that shows only the total asks to be taken on
   faith, which is the opposite of the product's posture.
2. The tolerance had no control on the results page: the slider lived
   only on the options page, so a hint set could not be explored where
   the hints are (FR-14 wants live re-evaluation).
3. Staleness came from a hardcoded `STALE_THRESHOLD_MIN = 30` in
   `page.ts` while `Settings.stalenessWarnHours` (default 24) sat unread
   — the options page's threshold did nothing. And the banner offered
   only a whole-list re-crawl, never the cheaper "refresh this one".

**Decision.** All three, in the existing vocabulary rather than new
machinery:

- The hint card renders a `<dl>` of the three terms the `Hint` already
  carries — delivery removed, one more unit (as a cost), net effect —
  and, when the verdict is `within-tolerance`, the outcome line gains
  the sentence naming the tolerance it fits inside. A negative net is
  printed unsigned there ("only 1 toman more"): the word "more" already
  carries the direction, and "only −1 more" reads as a bug.
- A tolerance row sits directly under the Plus row: a `range` input and
  an `<output>`, the same setting the options page writes, persisted
  through `saveSettings` and re-solved. The re-solve is debounced 250ms
  and the drag is NOT interrupted — `scheduleResolve` rebuilds the page
  and would pull the slider out from under the pointer, so this row owns
  its own timer and refocuses itself afterwards.
- Staleness reads `settings.stalenessWarnHours`, and the banner lists
  each stale line with its own refresh button next to the whole-list
  one. A per-item refresh is a `capture/pdp` message: the product API
  answers any origin, so it needs no tab, unlike the crawl. It re-reads
  the variant the plan BUYS (`lineIds`), which is the offer that line's
  price rests on.

**Alternatives.** (a) Print the net only and let the tooltip explain —
rejected: the spec's whole point is checkable arithmetic. (b) Reuse
`scheduleResolve` for the slider — rejected: it re-renders synchronously
and kills the drag. (c) Keep the 30-minute constant — rejected: a setting
that nothing reads is worse than no setting. (d) Per-item refresh by
re-crawling one product through the crawl state machine — rejected: the
crawl needs a content-script tab and paces itself over the whole cart;
`capture/pdp` is one fetch and already exists.

**Consequences.** The results page now writes two settings (Plus,
tolerance). `capture/pdp` is reused from a second surface, so its
`upsertItem` path runs for an item that already exists — it preserves the
stored quantity and lock and only advances `latestSnapshotId`, which is
why the reuse is safe. The staleness threshold is now the user's, so the
banner is rare with a long threshold: that is the setting working, not the
disclosure disappearing.

**Evidence.** `tests/results-page.test.ts` (the banner past the
configured threshold asserts both refresh actions; the slider and the
math rows were exercised live). Live, in real Chromium with synthetic
carts seeded into the extension's own IndexedDB:
`.openclaw/tmp/verify-features.py` (12/12) renders a saving hint whose
arithmetic reads ۶۰ − ۲۰ = ۴۰, a within-tolerance hint reading
"فقط ۱ تومان بیشتر در تلورانس ۶٫۵٪ شما", the tolerance row (value
repaints and survives a re-render), and the staleness banner with one
refresh button per stale line.

## D-33 — CI/CD: a gated, audited, attested build (2026-10-16)

**Problem.** Every gate so far was run by hand on one Windows box, through
a Qoder-bundled Node, and the only "artifact" was a `dist/` directory plus
an untracked `dist.crx` nobody could trace back to a commit. Nothing in the
repo defined what a *releasable* build is, nothing stopped a broken tree
from being the one that got zipped for a store, and the whole path from a
green tree to an installable package had never been walked. Two files
outside this package (`docs/`, the separately maintained GitHub Pages
landing page, and the untracked `chrome-ext/` scratch extension) also made
`npm run format:check` fail, so "all gates green" was only ever true of
`src/` + `tests/`.

**Decision.** Three workflows, two scripts, and the 0.4.0 version bump that
gives them something to release:

- `ci.yml` — on push to `main` and on PRs: **quality** (tsc, eslint,
  prettier, plus the zero-runtime-dependency policy as an explicit step),
  **test** on Node 22 and 24 (the `engines` floor and the build version),
  then **build + package**: build, audit the *built* manifest, package the
  store zip, attest its provenance (non-PR events), upload it.
- `release.yml` — on a `v*` tag: re-verify the tagged commit with the same
  `npm run verify`, require the tag to equal `v$(package.json version)`,
  rebuild, audit, package, attest, and `gh release create` with generated
  notes plus the SHA-256. Cutting the tag stays a human act.
- `.github/dependabot.yml` — weekly grouped update PRs with a 7-day
  cooldown, so a freshly published version (the window a compromised
  release abuses) must survive a week before it is even proposed. (A
  `dependency-review.yml` was written alongside it and deleted the same
  day; see the amendment below.)
- `scripts/audit-dist.mjs` — applies NFR-06 to the artifact rather than the
  source: MV3, `version` == package.json, `permissions` exactly
  storage+tabs+scripting, host/content-script/web-accessible matches
  exactly the digikala origin, and no manifest key outside a reviewed
  allowlist. Both workflows run it, so a new capability cannot reach a user
  ahead of a decision-log entry.
- `scripts/package-store-zip.py` — stdlib Python packaging instead of
  `zip`: stores need `manifest.json` at the archive root, and `zip` exists
  neither on Windows nor on this dev box, so a shell packaging step could
  not be checked before a release. It fixes entry timestamps (byte-stable
  zip), re-reads what it wrote to assert the layout, and emits the
  `.sha256` the release publishes.

Supply-chain posture, because it is the point: every action is pinned to a
commit SHA (never a moving tag), `permissions:` is read-only with per-job
escalation (`id-token`/`attestations` for signing, `contents: write` only
to cut the release), checkout sets `persist-credentials: false` so no later
step can push with the job's token, installs are `npm ci` only, and no
pipeline touches a secret — which is also why a fork's pull request runs
the identical build. Version 0.4.0 is this round's feature set (D-31/D-32);
`engines` is now `>=22` because Node 20 left support in 2026-04 and a
matrix should not test an EOL runtime.

**Alternatives.** (a) `zip -r` in the workflow with an `unzip -Z1` layout
guard — rejected after testing it here: `unzip` normalizes a
`./manifest.json` entry away, so the guard could not fail, and `zip` is
absent from this machine, so the real behavior could not be checked at all.
(b) A reusable `workflow_call` so the release reuses CI's build job —
rejected: nesting hides the release's own verification inside a run the
reviewer has to dig into, while what remains duplicated is three mechanical
steps. (c) Running `e2e/e2e-settled-bill.py` in CI — rejected: it needs a
pinned Playwright Chromium and a session IndexedDB dump, both git-ignored
local artifacts under `.openclaw/tmp/`; a runner has nothing to replay.
(d) `npm ci --ignore-scripts` — not adopted: vite/esbuild platform binaries
arrive as optional deps and the flag's effect could not be verified here;
the parts that *could* be verified (lockfile-only installs, SHA-pinned
actions, read-only tokens) were. (e) Letting CI create the tag — rejected:
a human decides when a version becomes public.

**Consequences.** "Green" now means the artifact was checked, not just the
sources — `audit:dist` failed on first run against the stale 0.3.0 `dist/`
and passes only after a real rebuild, and the released zip carries a
provenance attestation, so a store upload can be traced to a commit. The
tree-wide gates would have failed on the first push for two files outside
this package, so `docs/` is excluded from lint/format rather than edited —
the landing page stays exactly as its author left it — and the other one,
the stray `chrome-ext/` scratch extension, is deleted outright along with
the stale `dist.crx`/`dist.pem` from an old `--pack-extension` run.
`*.zip` and `*.sha256` joined `.gitignore` so local packaging leaves no
stray untracked files. The publishing question itself is answered in
`agent/PUBLISHING.md`: Edge, Opera and Firefox are free, Chrome is US$5
once, and Firefox needs a port (no `background.service_worker` in MV3 —
that is T06.6).

**Evidence.** Local, 2026-10-16: `tsc --noEmit`, `eslint .` and
`prettier --check .` clean over the whole tree; `vitest run` 291 tests
across 26 files; `vite build` clean; `scripts/audit-dist.mjs` FAILS against
the pre-bump artifact (version 0.3.0 ≠ 0.4.0) and passes after the rebuild;
`python scripts/package-store-zip.py` run twice on the same `dist/` → 24
entries, `manifest.json` at the root, `testzip()` clean, identical SHA-256
`c1840f7849…` both times. All four YAML files parse (PyYAML) with the
intended triggers, jobs, pinned action SHAs and per-job permissions.

**Amended the same day, 2026-10-16.** Two hours after this landed,
Dependabot opened its first `npm-dev` group PR (ten dev-dependency
updates). Its CI failed on `npm ci` — typescript 7.0 against
typescript-eslint 8.71.1, whose peer range is `typescript <6.1.0` — and the
PR was merged anyway, so **`main` itself went red**: CI `38894670069` and
the manual Release run `38894747089` both die in "Install (lockfile only)".
`90afe14` reverts the merge, restoring `package.json` and
`package-lock.json` byte-exactly to `2f2c05a`.

Three corrections ride with it:

- The npm group now carries **minor and patch updates only**; majors arrive
  as individual PRs. A group is all-or-nothing, so one member that cannot
  install is not a partial update, it is the whole batch failing — and a
  batch that someone merges anyway is a broken `main`. typescript majors
  are ignored outright until typescript-eslint's peer range catches up.
  **Corrected again the same day (505518f, 3e15055):** the solo-major rule
  produced a burst of individual majors, and one of them cannot install at
  all — `@vitest/coverage-v8@5.0.3` peers `vitest@5.0.3` *exactly*, so
  beside vitest 3.2.7 it fails `npm ci` for the entire tree. Because a
  `pull_request` workflow tests the merge of head and base, that one merge
  (PR #13) turned every later PR red as well, #14's own run included. The
  verified lockfile is restored, and Dependabot now holds majors back for
  the peer-locked trio — `typescript`, `vitest`, `@vitest/coverage-v8` —
  while vite, eslint, @types/node and jsdom still arrive individually,
  where CI prices each migration: `@crxjs/vite-plugin` declares `vite ^8`
  and typescript-eslint accepts `eslint ^10`, so those two are adoptable as
  they stand.
- `dependency-review.yml` is **deleted**. The repository's dependency graph
  is disabled (`security_and_analysis` reports it absent; the compare API
  answers `403`), so the action failed on every pull request no matter what
  the diff contained. A permanently red gate is worse than no gate: it
  teaches people that red means nothing, which is precisely how the batch
  above got merged. Advisory coverage returns by enabling the dependency
  graph and Dependabot security updates in Settings → Code security —
  nothing in the build depends on either.
- The guard that would have prevented this is repository configuration, not
  code: **branch protection requiring the CI checks** is still not enabled.
  Until it is, "never merge a red PR" is a convention, and this entry is the
  record of what happens when it is one.

## D-34 — approximate mode's local optimum, and the fee-blind seller lists (2026-10-16)

**Problem (user report, exact cart):** product 8881997 was in the cart at
variant 82750265 (بهدارو رسان، ۳۱۸٬۵۳۰ + ۱۱۰٬۰۰۰ ارسال); the sibling variant
73998432 (مکمل نوین شاپ، ۳۱۰٬۸۶۰ + ۴۰۰٬۰۰۰) was captured as an alternative.
The plan for that item came out as وانیل دارو ۳۲۹٬۰۰۰ riding a ۱۸۸٬۰۰۰ package,
total ۲٬۰۰۲٬۸۴۰ for the five-item cart. The reachable optimum is ۱٬۹۵۹٬۵۳۰: the
same item back on بهدارو رسان (its own seller, its own ۱۱۰٬۰۰۰ package) and the
other four pooled on محور سلامتی (۱۵۰٬۰۰۰). **۴۳٬۳۱۰ too dear** — and the tool's
own "why this seller?" panel said so, listing بهدارو رسان as ۴۳٬۳۱۰ *less*.
Two display defects made it read as "the extension chose the dearer seller":
the seller picker ranked by unit price with no shipment on the row (so
۳۱۰٬۸۶۰ sat at the top), and the item row rendered *no* chip when the plan's
unit price was higher (the ۳۱۸٬۵۳۰ → ۳۲۹٬۰۰۰ rise was silent).

**Root cause.** The cart has 42 candidate vendors (every captured variant is an
offer), so it runs approximate mode. `approximate.ts` was greedy (ranked by
unit price, fee-blind) + D-23's repair, and that repair can only move a
*single-item* group onto a vendor the plan already uses. Neither pass ever
reconsiders WHICH vendor carries a package: the repair anchored the package on
وانیل دارو (۱۸۸٬۰۰۰) because that was the first merge that paid, and it can
neither re-anchor the group onto a cheaper-fee vendor nor send an item back to
a solo vendor whose total is cheaper (بانی دارو ۹۹٬۰۰۰ lost to داروبانک ایران’s
cheaper sticker, +۷٬۸۲۰ on the total).

**Decision:** (1) `hubs.ts` — a bounded, deterministic hub-set candidate
search. Hub sets of one and two vendors (pairs among the 24 cheapest-fee hubs);
each item takes its best offer (price + that vendor’s own package fee) inside
the set, or its own best outside it, so a set is never infeasible. Candidates
are scored with the solver’s own `scoringTotal` and the pass returns only a
**strict** improvement over greedy + D-23. (2) The picker and the why panel
rank by total (unit price + package fee) and the picker prints the shipment
beside the price (`bk-popover-quote`); the change line discloses a unit-price
rise with the existing `changeMore` chip. New key `feeUnknownShort` for the
picker’s compact unknown-fee label.

**Alternatives:** (a) raise the exact envelope — 42 vendors is 2^42; (b) prune
offers first — the sound prune (price > item minimum + largest fee) takes the
real cart 42 → 38, still above 15; (c) swap-based local search — more code for
the same class of fix; (d) a full metaheuristic — approximate mode stays
labeled and cheap; (e) change only the UI — the arithmetic would still be
۴۳٬۳۱۰ wrong.

**Consequences:** approximate plans are never dearer than before (strict
minimum over greedy, D-23 and the hub family), and a cart whose items share a
seller now lands on the cheaper package; exact mode and its optimality
guarantee are untouched; the seller list no longer reads as a recommendation of
the cheapest sticker. The pass is O(hubs × items × offers) with pairs capped,
so 30 items × 10 vendors stays far inside the < 1 s budget.

**Evidence:** `tests/fixtures/solver/hub-set-hijack.json` — the user’s cart
verbatim (rebuilt from the live product API plus the stored shipment quote):
mode `approximate`, grandTotal ۱٬۹۵۹٬۵۳۰, four items on `694673` and
`8881997::82750265` on `881751`. `tests/solver-hubs.test.ts` (five cases:
fee-blind greedy repair, package re-anchor, no-regression on the D-23 example,
determinism, unknown-fee fallback). `tests/results-page.test.ts`: "the seller
control ranks by total, not by unit price alone", "a move to a dearer unit that
joins a cheaper package discloses the rise". Local, 2026-10-16: `tsc --noEmit`,
`eslint .`, `prettier --check .` clean; `vitest run` 300 tests across 27 files;
`vite build` and `scripts/audit-dist.mjs` clean.

## D-35 — a severity ramp for the options the plan rejected (2026-10-16)

**Problem (user request):** with D-34's chips in place, every alternative seller
and every "the unit price went up" row still looked the same — one neutral grey
`.bk-chip`. The only difference between "barely worse" and "absurdly worse" was
the number inside the chip, which the reader had to sort by eye against the
green chip meaning *this is what the plan buys*.

**Decision:** the plain `.bk-chip`s that describe a **rejected** option ride a
hue ramp — `LOSS_HUE_BEST = 100` (just below the saving green) down to
`LOSS_HUE_WORST = 0` (red) — positioned by the loss relative to the worst loss
in the set on screen: the plan's item rows set the top for `changeMore`, and
the why panel's own list sets it for its effect chips. The scale is relative on
purpose: an absolute toman scale has no anchor for "much", and a fixed range
collapses to one colour whenever every loser happens to be nearly as good. The
ramp never uses the saving green itself — that colour stays reserved for what
the plan actually buys, which is exactly why it starts *below* it. Implemented
as `.bk-chip-loss` plus an inline `--loss-hue` (mirrored into `data-loss-hue`
so the position is legible to tests and to anyone reading the DOM).

**Alternatives:** one flat red for anything rejected — loses the ordering, and
red-for-everything is the same as grey-for-everything; a length/bar encoding —
a chip is 12px of text and a bar there is noise; colour the *chosen* chip by
margin instead — inverts the meaning of green at the moment the user just
learned it.

**Consequences:** the D-27 palette note ("no red outside errors") is amended for
this one chip family — here red is a severity scale, not a failure, and the
chip's own text still carries the magnitude, so colour only orders. The
overall palette is untouched; the ramp is computed per render from data already
in hand (no extra solves, no new storage).

**Evidence:** `tests/results-page.test.ts` — the dearer-unit test now also
asserts `.bk-chip-loss` with `data-loss-hue` at the red end (the only rise in
that plan), and "orders the rejected sellers on the loss ramp, best loser
closest to green" pins the ordering (two losers, hues strictly descending,
worst at 0, nothing on the ramp green). Local, 2026-10-16: full suite green.

## D-36 — the crawl overlay talks while it waits (2026-10-16)

**Problem (user request):** between the click and the service worker's first
`capture/progress` broadcast the overlay held one frozen line — "در حال شروع
بررسی سبد…". On a cold worker or a rate-limited CDN that is seconds to minutes
of a motionless box, which reads as a hang; the same shape as the D-21 wedged
worker that made this overlay worth building carefully in the first place.

**Decision:** `crawlStartingLines` — 26 fa and 26 en lines in the i18n catalog —
cycled by `rotateTexts` at a 1.4–2.6 s random interval, never showing the same
line twice in a row. Real progress always wins: the first `capture/progress`
stops the loop for good, and every teardown path (finished broadcast, error
response, no-answer catch, `destroy`) now goes through one `closeOverlay`, so
the loop cannot outlive the box it writes into. The lines are flavour and are
deliberately never counted — the honest status is the broadcast; these only
cover the silence before it.

**Alternatives:** a CSS animation — cannot change the words; a fixed interval —
mechanical, and it still reads as a machine idling; a bare spinner — no message
at all; put the lines in the service worker's progress messages — the worker's
job is the crawl, and a stalled worker would stall its own reassurances.

**Consequences:** the overlay is never still for more than ~2.6 s, and it costs
one timer and one array. The i18n catalog stays the only place strings live, so
an English UI gets English lines (and the rotator is injectable-random, so a
test can pin the sequence).

**Evidence:** `tests/capture-content.test.ts` — "cycles the opening lines until
real progress arrives": with a pinned `Math.random`, the overlay shows the
canonical starting line, then a different catalog line after each interval, and
freezes on "بررسی ۱ از ۲…" once a progress message lands (10 s of further
timers change nothing). Local, 2026-10-16: full suite green.

## D-37 — the release carries a stable download, and the landing page points at it (2026-10-16)

**Problem:** `docs/index.html` — the GitHub Pages landing page, and the only
download a stranger ever sees — linked
`github.com/.../archive/refs/heads/main.zip`. That is the **source**, which
contains no built extension at all (`dist/` is gitignored), and the very next
step told the user to "select the `dist` folder". The instructions could not
work for anyone. Pinning the link to an asset (`releases/download/v0.5.0/...`)
would work and is the other way this link fails: it rots at every release, and
the rotted link is exactly what a visitor would find.

**Decision:** the Release workflow now also publishes **`bozkhar-latest.zip`** —
byte-identical to `bozkhar-<version>.zip` — and attests **both** names, so
`releases/latest/download/bozkhar-latest.zip` is a permanent URL that only a new
release ever changes; the landing page links it and its install step now says
"the extracted folder, where `manifest.json` lives" (the dev tab keeps the
`dist/` wording, which is correct for a source build). Hardening that rides
with it: the workflow asserts the zip's **own** `manifest.json` version equals
`package.json` and the tag before publishing anything, echoes the SHA-256 into
the step summary, and `scripts/package-store-zip.py` now **refuses** to package a
`.pem`, `.crx` or `.map` — a leftover `dist.pem` from a local "Pack extension"
run would otherwise be zipped straight into a published artifact.

**Alternatives:** link `releases/latest` (works, but it is a page, not a
download, and it is one more thing to explain); resolve the asset at runtime
from the GitHub API (a network call and a 60/hour rate limit on a page whose
whole pitch is that it is local); keep the source link and document
`npm run build` (that is already the dev tab, and it is not a one-click
install).

**Consequences:** a visitor's download is now an installable extension, and
nothing in the release path can publish a zip whose manifest disagrees with
the tag. The stable alias is a name, not a new artifact: same bytes, and
`gh attestation verify bozkhar-latest.zip` answers alongside the versioned
name. The guard `tests/landing.test.ts` fails if the link is repointed back at
a branch archive, pinned to a version, or if the install step stops naming the
extracted folder.

**Evidence:** `tests/landing.test.ts` (4 cases). Local, 2026-10-16: `vite
build` + `npm run audit:dist` clean on 0.5.0, `scripts/package-store-zip.py`
writes `bozkhar-0.5.0.zip` (24 entries) and exits 1 with a clear message when a
`dist/leak.pem` is planted, and the workflow's version assertion prints
`0.5.0` for that zip.
