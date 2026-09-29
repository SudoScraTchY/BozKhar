# T04 — Solver

**Goal:** The pure optimizer module: exact within the scale envelope, lock- and promo-aware, with the hint layer and every worked example from `07-solver-behavior.md` as a green fixture suite.
**Depends on:** T02 (types only — deliberately **not** T03; the solver is pure and its inputs are plain data, so it builds and tests against hand-written lists from day one).
**Spec sources:** FR-05–FR-14, D-06/D-09/D-10/D-13/D-14/D-15, `07-solver-behavior.md` (authoritative), `04-optimization-analysis.md` (method).
**Estimate:** 4–5 ideal days. **Status:** todo.

| ID | Task | Notes | Est |
|---|---|---|---|
| T04.1 | Core enumeration engine | Vendor-set enumeration with pre-filtering (stock, bans, pins); in-set cheapest-assignment scoring; fee computation with the five fee flags; tie-breaks (fewer vendors, then deterministic) | 1.5d |
| T04.2 | Lock semantics | Pin = fixed assignment + vendor fee marked already-paid (ride-along); ban = pair removal; ban-exhaustion flag; all-pinned degenerate case returns the report-only plan | 0.5d |
| T04.3 | Fee model branches | Regular / Plus-covered (D-12) / large-item fixed per shipment with Plus exemption (D-13) / promo-waived by already-satisfied thresholds (existing quantities only, D-09) / unknown-fee estimate labeling | 0.5d |
| T04.4 | Promo repair pass | Vendor-count promos: re-assignment moves toward the threshold when the fee removed exceeds the price increase of the moves; re-assignments only, never extra units | 0.5d |
| T04.5 | Hint layer | One-extra-unit evaluation per D-10/D-11: fee saved against unit cost; net saving always emitted; net increase only within `tolerancePercent` of the cart total; rejects silently; full arithmetic attached to each hint | 0.5d |
| T04.6 | Fixture suite | Every worked example mandatory: `fee-coupling` (example 1: optimal 117 vs naive 130), `xyz-gating` (example 2, all three sub-cases incl. outright rejection of Z), `lock-ride-along` (example 3: 113 beats 115 via sunk fee), plus: both promo types satisfied in-plan, Plus on/off × regular/large, quantity effects, ties, empty/degenerate cases | 1d |
| T04.7 | Property + performance tests | Properties: plan total ≤ per-item-cheapest baseline; plan total ≤ any supplied alternative assignment; determinism (byte-identical output on identical input). Performance: 30 items × 10 vendors < 1s; approximate-mode switch verified at the envelope (OQ-09: 40 items / 15 vendors) | 0.5d |

## Acceptance criteria

- All fixtures green, including the three worked examples with the exact totals stated in `07-solver-behavior.md` (117 / X-Y-Z verdicts / 113-vs-115 ride-along).
- Every emitted fee line carries exactly one flag, and displayed lines always reconcile to the displayed grand total (FR-12 invariant, asserted in tests).
- Hints: `xyz-gating` rejects the Z-case hint outright (it is absent, not merely hidden); the Y-case hint shows net −7 with its arithmetic; the tolerance sub-case flips visibility at the stated bounds.
- Property tests pass on randomized inputs (bounded sizes, seeded generator); performance target met without web workers or WASM — plain JS on one thread.
- Zero imports beyond the standard library: the module runs in Node test context with no browser globals (NFR-09).

## Definition of done

Suite green; solver package exported with a one-page API note (input list → plan + hints, pure); any behavior discovered during implementation that diverges from `07` is resolved by amending `07` **first**, then the code — the behavioral spec stays authoritative.
