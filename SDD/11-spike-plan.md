# 11 — Spike Plan (Phase 1: Discovery)

**Timebox:** 2–3 working days. **Deliverable:** `spike-findings.md` appended to this SDD, decision-log amendments where assumptions break, and an explicit go/no-go. **Method rule:** everything below is done by hand in a normal browser session with devtools — no extension code yet. The spike's job is to answer questions, not to start building.

## Why a spike at all

Three load-bearing facts are still assumptions: fees visible pre-checkout (R-01), once-per-shipment fee semantics (D-14), and promo detectability (D-08). The math is settled and small (04-optimization-analysis.md); everything that could sink the project is a data question. A two-day spike converts those into facts before a line of extension code exists.

## Spike tasks

### S-1 — Delivery fee visibility (the go/no-go)
**Question:** Can the per-vendor delivery fee be read anywhere before checkout — offer list, product page, or cart preview?
**Method:** Inspect product pages and the cart/checkout preview for several multi-vendor products, logged in and logged out; record where fees appear, per vendor, and whether they vary with quantity.
**Evidence:** DOM snippets + screenshots of each fee location; note whether fee is per vendor, per item, or ambiguous.
**Pass:** fee readable pre-checkout in at least one stable location → full optimizer. Partial (cart-preview only) → crawl extends one step. **Fail:** nowhere → fallback mode (user-entered estimates, prominently labeled) and an explicit stakeholder decision before proceeding.

### S-2 — Variant-preserving navigation from cart
**Question:** Can a product page be opened with the cart's exact variant selected (URL parameter or initial state)?
**Method:** From a cart with variant items, inspect cart item links and product URLs; test opening with and without variant parameters; measure whether the offer list reflects the right variant on load.
**Evidence:** URL patterns per variant; a capture of the offer list immediately on load vs after manual variant selection.
**Pass:** variant reproducible without extra clicks → crawl stays simple. Partial → crawl adds an in-page variant-selection step (timed).

### S-3 — Promo shapes and detectability
**Question:** Where and how are the two promo types ("buy 2 of this item", "buy z items from vendor") represented? Do amount-threshold promos exist?
**Method:** Find live examples of both count-promo types; inspect their DOM; check consistency across products; actively look for any "free delivery over X" promo.
**Evidence:** DOM snippets + raw text of each promo type; a judgment on stable detection markers.
**Pass:** both types carry a detectable marker → FR-10 as specified. Partial → manual promo entry fallback scoped. Also answers OQ-01.

### S-4 — Where Plus applies
**Question:** On which offers does Plus change the delivery fee?
**Method:** Compare fee rendering with a Plus session vs a non-Plus session (or documented Digikala Plus terms if a second account isn't available) across regular and large-item offers.
**Evidence:** Side-by-side fee values per offer class.
**Pass:** answers OQ-10; large-item exemption confirmed or corrected (D-13).

### S-5 — Large-item fee semantics
**Question:** Is the large-item fee fixed, per shipment, Plus-exempt, and visible pre-checkout?
**Method:** Inspect a known bulky product's offers and fee displays; check behavior when quantity increases in the cart preview.
**Evidence:** Fee values at quantity 1 and 2+; screenshots.
**Pass:** confirms/corrects D-13 and OQ-04.

### S-6 — Fee aggregation across items (the consolidation premise)
**Question:** With multiple items from the same vendor in the cart, is the fee charged once?
**Method:** Build small test carts in a browser session (two items from one vendor; two items from two vendors; two units of one item) and read the cart-preview fee lines. No purchase is ever completed.
**Evidence:** Fee lines per configuration, screenshotted.
**Pass:** one fee per vendor shipment confirmed (D-14). **Fail:** per-item fees → the consolidation premise weakens and the stakeholder must re-decide scope before T02 starts.

### S-7 — Selector stability survey
**Question:** How stable and semantic are the DOM structures we'd depend on (vendor list rows, price nodes, promo badges, fee nodes)?
**Method:** Collect DOM snapshots of 5–10 diverse product pages; note ids/data-attributes vs positional classes; save the fixtures — they seed T03's fixture tests directly.
**Evidence:** The fixture corpus itself + a short stability judgment per structure.
**Pass:** enough semantic anchors exist → extractor design (06-architecture.md) is viable as planned.

## Exit criteria

The spike closes when every S-task above has evidence and a verdict, `00-decision-log.md` reflects any broken assumptions, `05-domain-model.md` fact statuses are updated (◐/? → ✔ or corrected), and one of three outcomes is written down: **Go** (premise holds, start T02), **Go with changes** (specific amendments listed), or **No-go** (which failing fact, and what the fallback product shape would be — e.g., estimate-mode advisory tool).

The tracking file for execution is `tasks/T01-discovery-spike.md`.
