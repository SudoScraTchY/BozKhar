# 05 — Domain Model (How Digikala Works)

This file captures the marketplace behavior the extension depends on. Every fact carries an evidence status, because the entire Phase 1 spike (`11-spike-plan.md`) exists to upgrade **Assumed** and **Unknown** facts to **Verified**. Facts that fail verification force a decision-log amendment (`00-decision-log.md`), never a quiet workaround.

**Status legend:** ✔ Verified (stakeholder-confirmed behavior) · ◐ Assumed (sensible default, spike to confirm) · ? Unknown (spike required).

## Glossary

| Term | Meaning |
|---|---|
| **Vendor / seller** | A third-party (or first-party) shop listing offers on Digikala. "Vendor" is used throughout this SDD; the site says "seller" (فروشنده). |
| **Product** | A sellable entity with its own product page. One page, many vendors. |
| **Variant** | A selectable option of a product (color, size, capacity…). Variant choice changes the offer list — so *product + variant* is the item identity (D-05). |
| **Offer** | One vendor's terms for one item: price, stock, delivery signal, promos. The unit of capture. |
| **Delivery fee** | Charged per vendor shipment, assumed independent of item count on that shipment (D-14). |
| **Large item** | Bulky goods with a fixed delivery fee per shipment; Plus does not apply (D-13). |
| **Digikala Plus** | Paid subscription waiving delivery fees on regular offers where applicable (D-12 — user toggle, not detected). |
| **Promo (same-item count)** | "Buy 2 (or n) of this item from vendor X → delivery free." |
| **Promo (vendor-wide count)** | "Buy z items total from vendor Y → delivery free." |
| **Comparison list** | The user's basket-as-seen-by-the-extension: items + quantities + locks + latest offers. |

## Facts and assumptions

| # | Fact | Status | Spike |
|---|---|---|---|
| F-1 | A product page lists **all vendors and their prices** for the selected variant, on one page | ✔ | — |
| F-2 | Changing the variant can change the entire offer list | ✔ | — |
| F-3 | Delivery fees differ per vendor and per order composition | ✔ | — |
| F-4 | Delivery fee is **visible before checkout** (on the product page / offer list or cart preview) | ? | S-1 |
| F-5 | A vendor's delivery fee is charged **once per shipment**, however many items ride it | ◐ | S-6 |
| F-6 | Both count-promo types exist (same-item, vendor-wide) | ✔ | S-3 (detectability) |
| F-7 | Amount-threshold promos ("free over X") exist | ? | S-3 |
| F-8 | Large items: fixed fee, per shipment, Plus-exempt | ✔ (user belief "AFAIK") | S-5 |
| F-9 | Plus membership changes delivery fees on regular offers | ✔ (user toggle covers it) | S-4 (where exactly it applies) |
| F-10 | The cart page records each item's product and variant such that the right product page can be reopened with the right variant | ◐ | S-2 |
| F-11 | Offers of the same product + variant are otherwise interchangeable (warranty/rating differences ignored) | ◐ (default policy) | — (see NTH-01) |
| F-12 | Prices can change between capture and checkout | ✔ | — (staleness handling, R-06) |

## Consequences of the facts

**F-1 is why the product is buildable at all.** Every vendor and price for an item lives on one page the user is already viewing, so capture is a read of the current page — no per-vendor probing, no search. This single fact keeps the extension inside the "user-initiated, one page at a time" posture (D-03) while still seeing the whole offer surface.

**F-4 is the project's biggest unknown and gates everything else.** If fees are not visible pre-checkout, the optimizer's inputs are estimates, and the results page must say so loudly. The spike therefore treats fee visibility as a go/no-go criterion: either fees are visible (full optimizer), visible only at cart-preview stage (crawl extends one step further), or invisible (fallback mode: user-entered fee guesses, clearly labeled). The architecture deliberately keeps the fee source pluggable so these outcomes are a data-source change, not a redesign.

**F-5 plus F-6 create the optimization's structure.** Once-per-shipment fees make consolidation valuable; count promos make consolidation *sometimes free*. Both interact with the user's actual quantities, which is why quantities are first-class in the comparison list (FR-05) and why the worked examples in `07-solver-behavior.md` all involve at least two items — a one-item cart has nothing to cross-reference.

**F-10 makes or breaks the cart crawl.** The stakeholder's requested flow (open every cart item's product page, capture, close — D-04) requires reproducing the exact variant from cart data. If variant selection cannot be driven by URL or initial state, the crawl needs a fallback (select variant in-page before extraction), which the spike must time.

## Offer equivalence policy

By default, all in-stock offers for the same product + variant are treated as economically interchangeable. Warranty differences, seller ratings, and return policies are consciously ignored in the MVP — a deliberate simplification recorded here so it reads as a policy, not an oversight. The escape hatch is user-side: pin (`FR-06`) and ban (`FR-07`) locks let a user encode "I only trust this vendor" without the extension pretending to judge quality. Generalizing that into automatic filters is NTH-01, with its own promotion trigger.
