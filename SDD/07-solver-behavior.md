# 07 — Solver Behavior

This is the behavioral spec of the optimizer — what it must do, step by step, in words. Per the SDD convention there are no formulas; the worked examples use concrete numbers (illustrative Toman) because examples are how correctness gets communicated here. Every example in this file is a mandatory test fixture in `T04`.

## Inputs and outputs

**Inputs:** the comparison list — each item with its offers (price, stock, delivery info, promos), its quantity, and its lock state (none / pinned to vendor / banned vendors) — plus settings: Plus membership and hint tolerance (percent of cart total).

**Outputs:** a **plan** — for every item, the chosen vendor and unit price; grouped by vendor with one fee line per used vendor, each carrying exactly one explanation flag (`regular` / `plus-covered` / `promo-waived` / `large-item` / `already-paid-by-lock`); item subtotal, delivery subtotal, grand total; a comparison against the current-cart cost with the savings figure — and a list of **hints**, each with its own arithmetic shown in full.

## Procedure, step by step

1. **Pre-filter.** Drop out-of-stock offers. Remove banned (item, vendor) pairs. Pin locked items to their vendors; the pinned vendors' fees are marked *already paid* — other items can join those vendors without triggering a new fee (D-06).
2. **Vendor pool.** The distinct vendors still reachable by at least one unlocked item, plus all pinned vendors.
3. **Enumerate vendor sets.** Consider every possible subset of the pool. Pinned vendors are present in every subset by definition. At realistic scale this is small (04-optimization-analysis.md); above the scale envelope, degrade to the labeled approximate mode (D-15, OQ-09).
4. **Score a set.** Within a candidate set, every unlocked item takes its cheapest available vendor in the set. Then compute fees: for each vendor actually used, one fee — unless it is a pinned vendor (fee already paid), Plus-covered (and not a large item, D-13), or waived by a promo the assignment *already* satisfies with the user's actual quantities (D-09: existing quantities only — the main plan never adds units to reach a threshold).
5. **Promo repair pass.** When vendor-wide count promos exist, a set's greedy assignment may sit just below a threshold. Attempt re-assignments — moving an unlocked item from its in-set cheapest vendor to the promo vendor — whenever the fee removed exceeds the total price increase of the moves. Re-assignments only, never extra units.
6. **Select the best plan.** Lowest grand total wins; ties break toward fewer parcels (fewer vendors), then deterministically (e.g., by vendor IDs) so output is stable.
7. **Hints pass.** Separately from the plan, for each count-promo that is *one unit away* from being satisfied for an item already in the list, evaluate adding one unit of that item: the fee it would remove counts against the extra unit's price. **Net saving → always show. Net increase → show only if it stays within the tolerance percent of the cart total. Otherwise reject outright.** (D-10, D-11.)
8. **Emit.** Plan with per-line fee flags, totals, current-cart comparison, hints with their arithmetic, and per-item price timestamps.

## Worked example 1 — why per-item cheapest is wrong (the core pitch)

Items A and B. Vendor V1: A at 100, B at 10, delivery fee 15. Vendor V2: A at 80, B at 12, delivery fee 25.

- *Per-item cheapest:* A from V2 (80) + B from V1 (10) = 90 in items, but **both** vendors used → 15 + 25 = 40 in fees → **130 total**.
- *All from V1:* 100 + 10 = 110 + one fee 15 → **125**.
- *All from V2:* 80 + 12 = 92 + one fee 25 → **117.** ← optimal.

The item-cheapest strategy pays 130; the optimal split consolidates everything onto the *pricier-for-B* vendor and saves 13. This is the smallest example that shows the fee coupling, and it must appear in onboarding copy — it is the entire product argument in four lines.

## Worked example 2 — the stakeholder's X/Y/Z hint gating

Items X = 10, Y = 5, Z = 90; delivery fee at the relevant vendor: 12.

- **Z's vendor promo:** "buy 2 of Z → free delivery." Adding a second Z costs 90 to remove a fee of 12 — the total grows by 78. **Rejected outright.** The user is never shown this hint, per the stakeholder's explicit rule (D-10).
- **Y's vendor promo:** same shape. Adding a second Y costs 5, removes 12 — a **net saving of 7 → always shown**, regardless of tolerance.
- **Y's promo with a small fee (say 3):** extra unit costs 5, removes 3 — a net increase of 2. Shown **only if** 2 falls within the tolerance percent of the cart total (e.g., with tolerance 2% and a 150 cart, the bound is 3 → shown; tolerance 1% → bound 1.5 → hidden).

## Worked example 3 — lock ride-along (D-06, the agreed subtlety)

Item A pinned to V1, so V1's delivery fee (15) is *already paid* by A. Unlocked items B and C: B at 52 on V1 / 45 on V2; C at 61 on V1 / 55 on V2; V2's fee is 15.

- *Strict-exclusion interpretation (wrong):* ignore A entirely and count V1's fee again if B or C land there — B+C on V1 would be priced 52 + 61 + 15 = 128, pushing the solver toward V2 (45 + 55 + 15 = 115) and **overcounting the real total**.
- *Agreed semantics:* V1's fee is sunk. B+C on V1 costs just 52 + 61 = **113** with no new fee; V2 costs 100 + 15 = 115. The solver correctly sends B and C to V1 despite V1's *higher item prices* — because in the real cart there is only one V1 fee and A already pays it. Total including A's own numbers: A's price + A's 15 + 113.

This example exists because it is the one place where "exclude locked items from the calculation" (the stakeholder's words) and "the real cart has only one fee" (the agreed correction) genuinely diverge. The solver implements the agreed semantics, and this fixture is the regression test for it.

## Edge cases

- **All items pinned:** the plan degenerates to a report — current assignment, totals, fee flags — and the hints pass still runs (hints never move items, so locks don't block them).
- **Item with no in-stock offers anywhere:** flagged "no available vendor," excluded from the solve, shown with its last-known offers; the plan's totals explicitly exclude it.
- **Single item, single vendor:** plan is trivial; value comes only from the Plus/large-item fee flags and any hint.
- **Ties:** fewer vendors first, then deterministic ordering (same input → byte-identical plan, FR-11).
- **Fee unknown on some offers (spike outcome F-4 negative):** affected vendor groups are labeled estimate-only; the summary shows the estimated range rather than a single confident number.
- **Cart over the scale envelope:** labeled approximate mode; the results page says *approximate* in place of *optimal*.

## Determinism and testing

The solver is a pure function; identical input yields identical output. The fixture suite in `T04` includes, at minimum: example 1, example 2 (all three sub-cases), example 3, both promo types satisfied in-plan, Plus on/off against regular and large items, ban exhaustion, the edge cases above, and a performance case (30 items × 10 vendors under 1 second). Property tests assert the plan's total never exceeds the per-item-cheapest baseline's total, and never exceeds any manually supplied alternative assignment.

## Implementation notes (T04, resolved during implementation)

These resolve ambiguities the behavioral spec left open; they are binding for regressions and asserted by the fixture suite.

- **Vendor fee is a function of the input, not the assignment.** Enumeration scores vendor *sets*, so the total must depend only on the set. Per-vendor effective fee = max of known fees across that vendor's in-stock offers (conservative, total-safe; identical to the single fee in the consistent common case, D-14). A per-member-offer "first known fee" rule was tried and rejected: it makes the total assignment-dependent and enumeration silently suboptimal (caught by seeded property test).
- **Two scoring views.** Enumeration and the promo repair pass score pinned vendors like any other vendor (`scoreOnly` view) — otherwise a pin wrongly zeroes its vendor's fee during search (the seed-1000 class of bug). The final plan then re-flags the pinned vendor's fee `already-paid-by-lock` (display view). Displayed totals and scored totals are reconciled by the property tests.
- **Fee-flag precedence** when several could apply: `promo-waived` > `plus-covered` > `already-paid-by-lock` > `regular`; large-item groups take the `large-item` flag exclusively and are never Plus-covered or promo-waived (D-13). An unknown fee may coexist with any flag.
- **Unknown-fee scoring and range:** unknown fees are charged at `unknownFeeFallback` (capture passes the largest known fee so estimates err high, never silently low). Groups with no known fee keep `fee: null` for display, set `totalIsEstimate`, and the plan exposes `estimateRange { low = grandTotal − unknownGroups × fallback, high = grandTotal }`.
- **Promo counts are in units** (not distinct items), so a vendor-count threshold exactly one unit short is reachable by the one-extra-unit hint (D-10/D-11); recorded as OQ-11.
- **Promo repair** accepts the minimal move-set reaching the threshold only when the resulting total (fee removed) is strictly lower; moves ordered by (price increase, itemKey) for determinism; pins and large items never move (D-09/D-06).
- **Tolerance bound is `floor(cartTotal × tolerancePercent / 100)`** in integer Toman — this is what pins example 2's third sub-case (150-cart: 2% → bound 3 → net −2 shown; 1% → 1.5 → hidden). Rounding would wrongly show the 1% case.
- **Net-zero hints** (`feeRemoved == extraUnitCost`) classify as `within-tolerance` (an increase of 0 is within any tolerance ≥ 0).
