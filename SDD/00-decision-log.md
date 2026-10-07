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

**Decision:** Crawl (cart + product) fetches execute in the page's **main world** on the requesting tab, with the site's own routing header set (`x-site: DIGIKALA`, `x-source: WEB`, `X-Web-Optimize-Response: 1` — non-secret markers, live-captured via CDP 2026-10-07). Concretely: the service worker sends a `fetch/delegate` message to the content script on the requesting tab, which injects a self-contained script into the page; that script fetches GET with the page's origin and posts the result back via `window.postMessage`. The service worker keeps orchestration, state, containment, and error handling; the injected executor is a pure GET executor (the method is baked into the injected code). The SW's own session fetch remains the fallback when the content script is unreachable.
**Rationale:** Two execution contexts were live-verified to fail: the service worker (request reaches the API, answers 401 — its origin is `chrome-extension://`) and the content-script **isolated world** (the API's CORS policy allows only the web origin, so the preflight is checked against the extension origin and blocked — CDP shows the `OPTIONS` with no follow-up GET, toast "Failed to fetch"). The identical main-world fetch returns 200. Injecting into the main world rides the same CORS regime as the site's own calls.
**Consequence:** Crawl start must originate from a content-script surface (the cart page button — the only start surface today; an options-page start would run without a tab id and fall back to the SW fetch). D-01 is structurally preserved (GET-only, tested); D-02 runs on both sides of the delegation. If the site rotates the marker values, the cart crawl 401s loudly (contained per crawl) and the values need re-capturing via CDP. The injected script is visible to page JS (it posts back over `window.postMessage`); the payload is read-only cart data, so the exposure is equivalent to the site's own traffic.
