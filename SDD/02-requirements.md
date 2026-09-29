# 02 — Requirements

Requirements below cover the **MVP (Phase 2)** unless marked otherwise. Each requirement carries a stable ID, a rationale traceable to `00-decision-log.md`, and testable acceptance criteria. Anything not listed here and not in `03-nice-to-haves.md` is out of scope by default.

## Functional requirements

### FR-01 — Product-page capture ("Add to comparison")
A button on the product page captures, for the currently selected variant, every vendor offer visible on that page: vendor identity, price, stock state, delivery-fee signal, and any promo attached to the vendor or offer.
**Rationale:** The product page is the only place all vendors and prices for an item are listed side by side (stakeholder-confirmed); capturing there is the primary data source (D-04).
**Acceptance:**
- Clicking the button stores one snapshot containing ≥ 1 offer for the selected variant; changing the variant and clicking again stores a separate snapshot for that variant (D-05).
- The snapshot records the capture time and the extractor version.
- A confirmation toast shows the number of offers captured; a toolbar badge shows the comparison-list size.

### FR-02 — Cart-page crawl capture ("Optimize this cart")
A button on the shopping-cart page opens each cart item's product page (with the variant the cart holds), captures its offers as in FR-01, and closes the page afterward.
**Rationale:** Stakeholder-requested one-shot alternative to manual adding (D-04); the cart page itself does not show vendor offers.
**Acceptance:**
- A cart with N items produces N snapshots (or per-item, explicit capture failures — never silent gaps).
- Navigation is sequential with a configurable delay; the user sees live progress (item i of N) and an abort control.
- If the process is interrupted (tab closed, browser restart), a re-run resumes without duplicating items.

### FR-03 — Offer normalization
Raw page data is normalized into the canonical entities of `08-data-model.md` (Offer, Promo, DeliveryInfo) before storage; nothing downstream parses DOM.
**Rationale:** One pipeline serves both capture paths; isolates site-change breakage to one module (R-02).
**Acceptance:**
- All extraction goes through the versioned selectors module; unit tests parse saved page fixtures into identical normalized output.

### FR-04 — Snapshot persistence and staleness
Snapshots persist locally and carry timestamps; the UI displays the age of the prices behind any plan, warns past a configurable threshold (default 24h), and offers one-click re-capture per item or for the whole list.
**Rationale:** Capture is user-initiated (D-03), so data ages; wrong-but-fresh-looking plans are the worst failure mode (R-06).
**Acceptance:**
- Every plan view shows "prices as of …" per item; items older than the threshold are visually flagged.
- Re-capture updates only the targeted items.

### FR-05 — Comparison-list management
The user can view the list, remove items, and set per-item quantity.
**Rationale:** Quantities feed promos and totals (D-09); the list is the solver's input.
**Acceptance:**
- Quantity changes re-solve the plan in the results view (debounced).

### FR-06 — Pin lock
The user can pin an item to a specific vendor. The plan then never reassigns that item, and that vendor's delivery fee is treated as already paid for the rest of the optimization (other items may ride along without adding a fee).
**Rationale:** D-06 — locks exclude the item from calculation while preserving the single-fee-per-shipment reality (stakeholder-agreed).
**Acceptance:**
- With item A pinned to vendor V, the solver may assign other items to V at zero *additional* fee; the plan's total shows V's fee exactly once.
- Solver fixture `lock-ride-along` (07-solver-behavior.md) passes.

### FR-07 — Ban lock
The user can ban one or more vendors per item; banned vendors never receive that item.
**Rationale:** The other half of D-06 — "never vendor Y" is a different rule from "always vendor X".
**Acceptance:**
- Banned (item, vendor) pairs are excluded from the vendor pool for that item; a fully-banned item is flagged "no available vendor" rather than silently dropped.

### FR-08 — Digikala Plus toggle
A setting declares whether the user has Plus; the fee model applies Plus benefits where valid (regular offers) and ignores them for large items.
**Rationale:** D-12/D-13 — membership is user-supplied input, not detected.
**Acceptance:**
- Toggling Plus re-solves; large-item fees are unchanged by Plus in either state.

### FR-09 — Large-item handling
Offers flagged as large items carry their fixed per-shipment fee; the plan groups them correctly and notes that Plus does not apply.
**Rationale:** D-13.
**Acceptance:**
- A plan containing a large item shows its fixed fee labeled distinctly; flag source is the offer data (detection method is a spike question, S-5).

### FR-10 — Promo detection (both count types)
The capture pipeline records promos of both shapes: same-item count ("buy 2 of this item → free delivery") and vendor-wide count ("buy z items from this vendor → free delivery").
**Rationale:** D-08 — both confirmed to exist by the stakeholder.
**Acceptance:**
- Fixtures for both promo shapes extract to Promo records with type, threshold, and effect; plans show which fee was waived by which promo.

### FR-11 — Optimal plan computation
Given the comparison list (quantities, locks, offers, promos) and settings, the solver produces the cheapest total-cost vendor assignment, exact within supported scale.
**Rationale:** The product's core promise; exactness is free at realistic scale (D-15, 04-optimization-analysis.md).
**Acceptance:**
- Output ≤ any manually constructed alternative on all fixtures, including the per-item-cheapest baseline.
- Deterministic: identical inputs produce byte-identical plans.
- Solves a 30-item × 10-vendor case in under 1 second.

### FR-12 — Plan presentation
The results view shows: per-vendor groups (items, prices, one fee line each with an explanation flag — regular / Plus-covered / promo-waived / large-item / already-paid-by-lock), item totals, delivery total, grand total, and the comparison against the current-cart cost with the savings figure.
**Rationale:** Advice is only useful if every number is auditable; flags map 1:1 to fee-model branches (07-solver-behavior.md).
**Acceptance:**
- Every fee line carries exactly one explanation flag; the sum of displayed lines equals the displayed grand total.

### FR-13 — Extra-unit hints
After the main solve, the tool evaluates promo-unlock hints: adding **one** unit of an **already-in-list** item to cross a count threshold. A hint is shown if it yields a net saving, or a net increase within the user's tolerance; large increases are rejected outright.
**Rationale:** D-09/D-10/D-11, including the stakeholder's X/Y/Z example.
**Acceptance:**
- Fixture `xyz-gating`: Z (price 90) promo hint rejected outright; Y (price 5, fee 12) hint shown as a saving.
- Hints display the extra-unit cost, the fee removed, and the net effect.
- No hint ever suggests a product outside the list.

### FR-14 — Tolerance setting
A user setting, expressed as a percentage of the cart total, bounds which net-increase hints are shown.
**Rationale:** D-10 — the stakeholder explicitly wanted tolerance as a user-controlled percentage.
**Acceptance:**
- Changing tolerance re-evaluates hints immediately without a re-crawl.

### FR-15 — Advise-only guarantee
No code path writes to the user's Digikala cart.
**Rationale:** D-01 — the foundational safety property.
**Acceptance:**
- Code review gate: no cart-mutating API calls or button-click automation anywhere in the extension; stated in the store listing.

### FR-16 — Data management
The user can export the comparison list as JSON and clear all stored data.
**Rationale:** Local-only data (D-02) still belongs to the user; export also aids debugging.
**Acceptance:**
- Export round-trips losslessly; clear removes every stored entity and resets settings to defaults on confirmation.

## Non-functional requirements

### NFR-01 — Privacy: local-only
All computation and storage stay in the browser; no telemetry, no analytics, no remote code. Verified by permission audit and a network-log test (zero non-Digikala requests).

### NFR-02 — User-initiated capture only
No scheduled or background page visits of any kind (D-03). The extension performs zero fetches outside user-triggered page navigation.

### NFR-03 — Performance
Solve: < 1s at 30 items × 10 vendors (target), hard ceiling 5s at scale thresholds. Capture: < 2s per product page after load. Results view interactive re-solve (lock/tolerance changes): < 300ms.

### NFR-04 — Platform: Chrome MV3 first
Manifest V3, service-worker architecture, no persistent background. Firefox compatibility is evaluated at T06 (OQ-05) but is not an MVP requirement.

### NFR-05 — Resilience to site changes
All DOM access funnels through a versioned selectors module (R-02); extractor failures surface as visible errors with the extractor version, never as silently wrong data.

### NFR-06 — Minimal permissions
Only: `storage`, `tabs`, and host permission for `digikala.com`. Anything beyond requires a logged decision.

### NFR-07 — Crawl etiquette
Sequential navigation, default ≥ 1.5s delay between pages, abortable, resumable; the crawl only ever visits product pages of items already in the user's cart or comparison list.

### NFR-08 — Bilingual UI: Persian (RTL, default) and English
UI ships in fa and en with correct RTL/LTR mirroring; labels are suggestion-worded ("consider buying Y from vendor X"), never auto-action-worded, honoring the advise-only tone (D-01).

### NFR-09 — Testability
The solver is a pure, dependency-free module with a fixture suite (including every worked example in 07-solver-behavior.md) and property tests; capture has fixture-based tests against saved DOM snapshots.

### NFR-10 — Accessibility
Keyboard-operable controls in the results view; table semantics for the plan; visible focus states; contrast at WCAG AA.
