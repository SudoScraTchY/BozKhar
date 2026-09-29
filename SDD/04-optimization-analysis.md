# 04 — Optimization Analysis (Names and Suitability — No Formulas)

The stakeholder asked for exactly this: *what mathematical problems and challenges are we talking about — names only, and whether each is suited.* This file honors that. There are deliberately no formulas anywhere in the SDD; numbers appear only inside worked examples in `07-solver-behavior.md`.

## The problem in plain words

For every item in the comparison list, pick **one** vendor. The cost of a choice is the sum of all item prices **plus one delivery fee for every vendor we ended up using at all** — unless that fee is waived by a promo the assignment already satisfies, covered by the user's Plus subscription, or already paid by a pinned item (D-06). Some items may not be reassigned (pins), some (item, vendor) pairs are forbidden (bans), large items have their own fixed fees, and everything must respect stock.

The reason this is a real problem and not a sort-by-price: **item prices and delivery fees pull in opposite directions.** Prices push the basket to spread across many vendors (each item at its own cheapest); fees push it to consolidate onto few vendors (fewer shipments, fewer fees). The optimal split sits somewhere in between and flips case by case. Promos add a third force: consolidating *units* (or item counts) onto one vendor can zero out its fee entirely. No per-item heuristic captures this; it must be cross-referenced jointly — which is the entire reason this extension exists.

## Candidate problem names, and whether they suit us

| # | Name | Family | How it maps to our situation | Verdict |
|---|---|---|---|---|
| 1 | **Fixed-Charge Transportation Problem** (FCTP) | Network / transportation optimization | Items flow from chosen vendors; per-unit price is the flow cost, and *using* a vendor adds its delivery fee as a fixed charge | **Canonical fit** — this is the textbook name for our exact shape |
| 2 | **Uncapacitated Facility Location** (UFL) | Location science | "Opening" a vendor means paying its fee; items are clients assigned to open vendors; no capacity limits | **Equivalent lens** — the best mental model for communication and code naming |
| 3 | **Binary Integer Programming** (exact) | Mathematical optimization | Yes/no decisions: which vendor per item, which vendors get used | **Suited as a formulation vehicle** — only needed if we ever adopt a solver library |
| 4 | **Subset enumeration over vendor sets** | Combinatorial search | Try every possible set of vendors; inside each set each item simply takes its cheapest allowed vendor | **Chosen MVP method** — exact at our scale, and locks/bans are trivial pre-filtering |
| 5 | **Branch & Bound** | Exact search | Systematic pruning of the enumeration tree | **Unnecessary at this scale** — nothing to prune |
| 6 | **Constraint Programming** | Declarative exact solving | Pins, bans, stock, and promo rules stated as constraints | **Optional fallback** — same scale argument; consider only if rules multiply |
| 7 | **Greedy heuristics** | Approximation | Per-item-cheapest assignment, then consolidation moves | **Baseline and giant-cart fallback** — also our sanity check |
| 8 | **Local search / repair moves** | Metaheuristics | Shift items onto a promo vendor when the fee removed outweighs the price difference | **Suited, narrowly** — used inside enumeration when vendor-count promos are in play |
| 9 | **0/1 Knapsack (threshold decisions)** | Combinatorial | "Pay for one more unit to remove a fee — worth it or not?" | **Suited as the hint layer** — deliberately *outside* the core solve (D-09/D-10) |
| 10 | **Dynamic programming** | Exact, structured subproblems | Would need a clean overlapping-subproblem structure we don't have | **Not needed** |
| 11 | **Multi-objective optimization / Pareto fronts** | Decision analysis | Trade-off surface over cost, speed, parcel count | **Not needed** — single objective by D-07 |
| 12 | **Stochastic / robust optimization** | Optimization under uncertainty | Prices drift between capture and checkout | **Deferred** — staleness is handled operationally (timestamps, re-capture, NTH-11), not probabilistically |
| 13 | **Vehicle routing / TSP** | Route optimization | Sounds related ("delivery") but has no routing structure here | **Not applicable** |

## The three that actually matter

**Fixed-Charge Transportation Problem (1) is the name to remember.** When anyone asks "what kind of problem is this?", that is the answer: a transportation assignment where each used source carries a fixed charge. It is formally NP-hard in general — and that fact is *irrelevant* here, which is the second most important sentence in this file.

**Subset enumeration (4) is the method we will actually ship.** Our instances are tiny. A realistic basket is a few dozen items and at most about fifteen distinct candidate vendors. Fifteen vendors means roughly thirty-three thousand possible vendor *sets* to try — and each trial is a cheap pass where every item takes its cheapest in-subset vendor. That is well under a second in ordinary JavaScript, on one core, in a browser tab, with no library. Pins and bans shrink the space further (pinned vendors are always "in"; banned pairs vanish before enumeration). This is why D-15 commits to exactness: at our scale, exact is free, so we never have to explain why the plan is merely *near*-optimal.

**Knapsack-style threshold thinking (9) is the hint layer, and only the hint layer.** Embedding "buy extra units to unlock promos" *inside* the optimization would tangle the core assignment problem with quantity decisions — and the stakeholder's rule is firm that the main plan buys exactly what the user wants (D-09). Evaluating one extra unit at a time, after the main solve, against a tolerance (D-10), keeps the hard problem clean and the hints honest. This is a deliberate architecture boundary, not a shortcut.

## Scale reality check and the degradation path

Exactness holds only while the vendor count stays modest: each additional candidate vendor doubles the number of sets to try. The supported envelope is set at **40 items and 15 vendors** (OQ-09) — beyond it, the solver switches to the greedy baseline (7) plus repair moves (8) and *labels the plan as approximate* rather than silently pretending. Given that a Digikala basket with more than 15 distinct relevant vendors is already unusual, the fallback is an insurance policy, not a feature.

## The real challenges are not mathematical

The optimization is, bluntly, the easy part. The risk register (`10-risks-open-questions.md`) is dominated by non-mathematical problems, and they deserve naming just as explicitly:

- **Fee visibility** — whether delivery fees are knowable before checkout at all (R-01; spike S-1). The biggest single risk in the project.
- **Fee aggregation semantics** — one fee per vendor shipment, no matter the item count (D-14; spike S-6). The whole consolidation premise rests on it.
- **Promo detectability** — whether both promo types are machine-readable from the page (D-08; spike S-3).
- **Variant identity** — pinning down "same item" as product + variant across pages and URLs (D-05; spike S-2).
- **Data staleness** — prices move between capture and checkout; an optimal plan built on stale prices is confidently wrong (R-06).
- **Crawl etiquette and ToS posture** — staying inside rate-limit and terms-of-service tolerance by being user-initiated, sequential, and throttled (D-03, NFR-07).
- **DOM volatility** — the site changes, extractors break (R-02); contained by the versioned selectors module (NFR-05).

A final framing worth keeping in the repo: this project's difficulty ranking is roughly **data acquisition > data correctness > presentation > optimization**. The spike (Phase 1) spends all its time on the first two and none on the math — by design.
