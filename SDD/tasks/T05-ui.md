# T05 — UI Surfaces

**Goal:** The user-facing half: results page (verdict, plan, locks, hints, live re-solving), options page completion, toasts — bilingual fa-primary RTL, advise-only in wording and behavior.
**Depends on:** T03 (real captured data) + T04 (the solver). **Spec source:** `09-ui-spec.md` (authoritative), FR-04–FR-14, NFR-03/08/10.
**Estimate:** 4–5 ideal days. **Status:** todo.

| ID | Task | Notes | Est |
|---|---|---|---|
| T05.1 | Results page shell | **done** (v0.3.0, D-18): extension page `src/results/`, fa/RTL-first; verdict cards (current / optimized / savings + estimate caveat); empty-state explainer; pure `assemble.ts` (items+snapshots → solver input) unit-tested incl. the D-17 variant-switch end-to-end; page auto-opens from the SW on crawl completion; overlay now also closes from the crawl-start response (done/failed counts) — fixes the live "overlay never went away" | 1d |
| T05.2 | Plan rendering | **done** (v0.3.0, D-18): vendor-grouped table (item lines with variant label (D-17), one fee line per group carrying its flag, group subtotals, item/delivery/grand totals); every line reconciles (FR-12, tested); "prices as of" per item; unknown-fee honesty: current total is null when any fee is unknown (SDD 08) | 1d |
| T05.3 | Lock controls | Per-item dropdown: Any vendor / Pin to … / Ban … (multi); changes re-solve debounced (< 300ms target, NFR-03); quantity editing in the same row (FR-05) | 0.5d |
| T05.4 | Hints cards | Full arithmetic per hint (unit cost, fee removed, net effect, tolerance verdict); no apply buttons, no urgency patterns (09's copy rules) | 0.5d |
| T05.5 | Controls cluster + staleness | Plus toggle and tolerance slider (live hint re-evaluation, FR-14); staleness banner with per-item and whole-list re-capture (FR-04); crawl progress + abort surfaced here (from T03.6) | 0.5d |
| T05.6 | How-to-apply panel + options completion | Manual-apply instructions (which vendors, in what order, timestamps reminder); options page gains crawl delay + staleness threshold + the plain-language privacy note | 0.5d |
| T05.7 | i18n/a11y pass | fa tested first, en second; table semantics, keyboard operability, visible focus, WCAG AA contrast check; numeral style per language | 0.5d |

## Acceptance criteria

- End-to-end manual flows pass on real captured data: browse-add → results; cart-crawl → results; lock change → live re-solve; tolerance change → hint set changes without re-crawl; stale item → flagged with working re-capture.
- Every number on screen traces to a plan line; the reconciliation invariant (lines sum to totals) holds visually in all states, including estimate and approximate modes.
- Copy audit: no imperative verbs beyond "consider" (advise-only tone, D-01); Persian strings reviewed by a native speaker or carefully double-checked — this UI ships fa-first.
- Keyboard-only navigation completes the core loop (view plan, set a pin, change tolerance, read a hint); focus order is logical in RTL.
- Rerender performance: lock/tolerance/quantity interactions stay under 300ms on a 20-item plan.

## Definition of done

Manual flow checklist recorded in the PR (both languages); screenshots of every state (populated, empty, error, estimate-mode, approximate-mode, stale) attached; `09-ui-spec.md` amended wherever reality improved on it.
