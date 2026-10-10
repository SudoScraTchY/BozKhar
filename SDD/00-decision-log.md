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
