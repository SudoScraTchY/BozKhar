# 03 — Nice-To-Haves (The Discussion)

Phase 1 is about **discovery, potential, and features** — which makes the Nice-To-Haves discussion a first-class part of this spec, not an appendix. The stakeholder explicitly asked for it. The point of this file is to keep the MVP honest (nothing below is Phase 2 scope) while making sure the decisions we take *now* don't foreclose the features that matter *later*. Every NTH therefore ends with a **promotion trigger** — the concrete signal that would move it into a planned phase — and several NTHs below explicitly note where they have already shaped MVP data or architecture choices.

## How to read an NTH entry

Each entry answers five questions: what it is, why it's tempting, why it isn't in the MVP, what evidence would promote it, and how big it would be once promoted (S / M / L, rough solo-dev effort). The "why not now" answers matter as much as the features themselves: they are the recorded reasons, so future-us doesn't re-litigate them without new information.

## NTH-01 — Seller quality filter (rating / warranty minimums)

**What:** Let the user exclude vendors below a minimum seller rating, or offers without a preferred warranty type, from the optimization.
**Why tempting:** It answers the question the brainstorm left open — "what counts as the same item?" Two offers for one product are not truly equal if one vendor is 4.7-rated with a 24-month warranty and the other is 3.1-rated with 6 months.
**Why not now:** The MVP's default equivalence policy is simple and defensible: all in-stock offers of the same product + variant are interchangeable. Quality filtering adds a second extraction surface (ratings per offer) and a second settings surface, before we know anyone wants it.
**Promotion trigger:** Users report receiving lower-quality service via an optimal-plan vendor, or the spike confirms seller rating is reliably present per offer row (add to spike follow-up S-7).
**Effort once promoted:** S–M. Note the architecture already benefits: ban locks (`FR-07`) are per-item; a rating filter generalizes banning to a rule.
**MVP shaping already done:** The Offer entity reserves an optional vendor-rating field so history doesn't need re-capture.

## NTH-02 — Offer price history

**What:** Show each offer's price over time ("this vendor was 8% cheaper two weeks ago"), per item and per vendor.
**Why tempting:** It converts the tool from "cheapest today" to "is today a good day", which is where real money is saved in a volatile marketplace.
**Why not now:** History needs *time*, and we take snapshots only when the user acts (D-03). Any history we accumulate is sparse and biased toward the user's own browsing.
**Promotion trigger:** Sustained usage where users re-visit the same items; enough snapshot depth that a sparkline is honest rather than misleading.
**Effort once promoted:** M.
**MVP shaping already done:** This NTH is the reason storage keeps **snapshot history**, not just the latest capture per item — the schema is history-first so this feature needs zero migration.

## NTH-03 — Price alerts / watchlist

**What:** Notify the user when a watched item's price (or the optimal-cart total) drops below a target.
**Why tempting:** The natural evolution of NTH-02.
**Why not now:** Alerts require *checking* pages when the user isn't there — i.e., background scraping — which collides head-on with D-03 and the ToS posture we deliberately chose. This is the one NTH that is a **policy decision**, not just an effort decision.
**Promotion trigger:** An explicit, documented policy call that scheduled opt-in visits at low frequency are acceptable — plus user demand. Until then it stays parked.
**Effort once promoted:** M–L.

## NTH-04 — Discount codes and campaign prices

**What:** Include coupon/campaign pricing in totals, or remind the user to check a code at checkout.
**Why tempting:** Campaign prices change the optimal split just as much as delivery fees do.
**Why not now:** The brainstorm deliberately deferred the decision (OQ-06). Code stacking rules are undocumented, vary, and can make the tool confidently wrong — worse than not trying.
**Promotion trigger:** Spike-era evidence that Digikala's campaign pricing is deterministic and visible pre-checkout (i.e., the same problem fee visibility has, answered).
**Effort once promoted:** M.

## NTH-05 — What-if scenario simulator

**What:** Side-by-side comparison of scenarios: "drop item Z", "quantity 2 of Y", "no Plus" — each with its own optimal plan.
**Why tempting:** It exposes the solver's power ("what happens if…") with almost no new machinery, and it teaches users *why* the plan is what it is.
**Why not now:** The MVP already re-solves live on lock/tolerance/quantity changes (FR-05, FR-14); a full scenario workspace is UX surface we don't need before the core proves itself.
**Promotion trigger:** MVP usage shows users repeatedly toggling locks/quantities to explore alternatives — that *is* the demand signal.
**Effort once promoted:** S–M.
**MVP shaping already done:** Solver purity (NFR-09) makes scenarios trivial: a scenario is just an input list.

## NTH-06 — One-click "apply plan"

**What:** With explicit per-action confirmation, restructure the cart toward the plan (add from the right vendors, remove from the wrong ones).
**Why tempting:** The apply-manually step is the MVP's main friction.
**Why not now:** This crosses the D-01 line — advise-only is our safety, ToS, and trust posture. Doing it responsibly needs per-step confirmation UX, rollback, and stable selectors we don't yet have.
**Promotion trigger:** Strong, repeated user demand **and** a stable extraction layer with a track record through site changes. This is the last NTH that should ever be promoted.
**Effort once promoted:** L, plus a policy review.

## NTH-07 — Delivery-time aware plans

**What:** Optimize or annotate plans with per-vendor delivery estimates.
**Why tempting:** Parcel count and speed are the natural second objective.
**Why not now:** D-07 — the stakeholder dropped it: "We cannot do delivery time." The data isn't reliably available pre-checkout, and adding an objective would drag in multi-objective machinery this problem doesn't need (04-optimization-analysis.md).
**Promotion trigger:** Only if Digikala starts exposing reliable per-vendor ETAs on offer rows. Then it enters as an *annotation* first, an *objective* much later.
**Effort once promoted:** M.

## NTH-08 — Amount-threshold promos ("free delivery over X")

**What:** Support promos that waive delivery when the vendor subtotal crosses an amount, not a count.
**Why tempting:** They are the third promo shape; if they exist, ignoring them produces wrong plans in exactly the cases where money is on the table.
**Why not now:** Existence is unverified (OQ-01) — the brainstorm raised it and never confirmed it. Building for a phantom rule complicates capture and the solver for nothing.
**Promotion trigger:** Spike S-3 finds one real instance and a detectable page marker. Then it's small.
**Effort once promoted:** S (capture) + S (solver: the fee-waiver branch gains one more condition).

## NTH-09 — Share a plan

**What:** Export a plan as text or an image ("here's why we should split the order") — handy for family/group buying decisions.
**Why not now:** Pure polish; zero risk; obvious value only after there are users who share.
**Promotion trigger:** First "how do I send this to someone" feedback.
**Effort once promoted:** S.

## NTH-10 — Cross-device sync of the comparison list

**What:** Sync the list (not history) through the browser's own profile sync.
**Why not now:** Privacy posture (D-02) means sync must ride browser-native mechanisms only — no server of ours. Also low demand until mobile-adjacent usage appears.
**Promotion trigger:** Users working across two machines.
**Effort once promoted:** M, plus a privacy review to confirm nothing but the list moves.

## NTH-11 — Pre-checkout freshness re-verify

**What:** Before showing final numbers (or on demand), silently re-capture just the plan's vendors and re-solve, presenting "verified 30 seconds ago" plans.
**Why tempting:** Staleness is the MVP's biggest correctness risk (R-06); this attacks it directly.
**Why not now:** It's automated capture — a bounded, user-triggered exception to D-03 rather than a violation, but the exception should be earned by demonstrated need, and the crawl cost (one page per plan vendor) is non-trivial.
**Promotion trigger:** Staleness complaints, or plans invalidated at checkout during the beta.
**Effort once promoted:** S–M. Strong candidate for Phase 3 promotion ahead of most other NTHs.

## NTH-12 — Smarter bundle hints

**What:** The hint layer currently evaluates one extra unit at a time; a smarter version would propose multi-unit combinations that cross thresholds optimally (a small knapsack — see 04-optimization-analysis.md).
**Why not now:** One-unit hints cover the stakeholder's X/Y/Z rule (D-10) and are easy to present honestly; multi-unit bundles are harder to explain and easier to get wrong.
**Promotion trigger:** Usage data showing users acting on one-unit hints and wanting more.
**Effort once promoted:** M.

## What this discussion changed in the MVP

Three concrete echoes of this file exist in Phase 2 scope: history-first storage (for NTH-02), an optional rating field on offers (for NTH-01), and tolerance as a generic setting rather than a hardcoded number (for NTH-05/NTH-12 tuning). Everything else stays deliberately out — and every entry above is parked with a named trigger, so nothing gets re-argued from scratch later.
