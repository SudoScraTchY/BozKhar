# T04 — Solver

**Goal:** The pure optimizer module: exact within the scale envelope, lock- and promo-aware, with the hint layer and every worked example from `07-solver-behavior.md` as a green fixture suite.
**Depends on:** T02 (types only — deliberately **not** T03; the solver is pure and its inputs are plain data, so it builds and tests against hand-written lists from day one).
**Spec sources:** FR-05–FR-14, D-06/D-09/D-10/D-13/D-14/D-15, `07-solver-behavior.md` (authoritative), `04-optimization-analysis.md` (method).
**Estimate:** 4–5 ideal days. **Status:** in-progress (implemented + tested 2026-10-05; `done` requires human load-unpacked smoke + stakeholder confirmation).

**Evidence (own runs, 2026-10-05):** `npm run test` 66/66 passing across 8 files (26 baseline + 40 solver: fixtures 23, edge cases 7, properties 4, performance/envelope 6); `npm run typecheck`, `npm run lint`, `npm run format:check` all clean; zero runtime dependencies intact. Perf: 30×10 well under 1s; 40×15 envelope edge exact; beyond envelope labeled `approximate`.

| ID | Task | Notes | Est |
|---|---|---|---|
| T04.1 | Core enumeration engine | **done** — vendor-set bitmask enumeration, pre-filter, in-set cheapest, tie-breaks; input-only fee table makes totals set-dependent (see 07 implementation notes) | 1.5d |
| T04.2 | Lock semantics | **done** — pin = fixed assignment, scored normally + re-flagged `already-paid-by-lock` in display view; ban removal; exhaustion + all-pinned report-only cases in `tests/solver-edge-cases.test.ts` | 0.5d |
| T04.3 | Fee model branches | **done** — five flags with precedence; large-item exemption (D-13); unknown-fee estimate range | 0.5d |
| T04.4 | Promo repair pass | **done** — minimal move-set, strict-improvement acceptance, re-assignments only (`src/shared/solver/promote.ts`) | 0.5d |
| T04.5 | Hint layer | **done** — one-unit-short candidates, floor tolerance bound, saving/within-tolerance/absent verdicts with arithmetic (`src/shared/solver/hints.ts`) | 0.5d |
| T04.6 | Fixture suite | **done** — all three worked examples with exact SDD totals (117; Z absent/Y −7 saving/tolerance flip; 113 ride-along) plus both-promo, Plus×large, quantity, tie, unknown-fee, degenerate fixtures; FR-12 reconciliation asserted per fixture | 1d |
| T04.7 | Property + performance tests | **done** — seeded (xorshift) properties: total ≤ baseline, ≤ every supplied alternative, byte-identical determinism, hint arithmetic; perf 30×10 < 1s, envelope switch at 40/15 | 0.5d |

## Acceptance criteria

- All fixtures green, including the three worked examples with the exact totals stated in `07-solver-behavior.md` (117 / X-Y-Z verdicts / 113-vs-115 ride-along).
- Every emitted fee line carries exactly one flag, and displayed lines always reconcile to the displayed grand total (FR-12 invariant, asserted in tests).
- Hints: `xyz-gating` rejects the Z-case hint outright (it is absent, not merely hidden); the Y-case hint shows net −7 with its arithmetic; the tolerance sub-case flips visibility at the stated bounds.
- Property tests pass on randomized inputs (bounded sizes, seeded generator); performance target met without web workers or WASM — plain JS on one thread.
- Zero imports beyond the standard library: the module runs in Node test context with no browser globals (NFR-09).

## Definition of done

Suite green; solver package exported with a one-page API note (input list → plan + hints, pure); any behavior discovered during implementation that diverges from `07` is resolved by amending `07` **first**, then the code — the behavioral spec stays authoritative.
