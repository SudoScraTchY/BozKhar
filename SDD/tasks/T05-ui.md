# T05 — UI Surfaces

**Goal:** The user-facing half: results page (verdict, plan, locks, hints, live re-solving), options page completion, toasts — bilingual fa-primary RTL, advise-only in wording and behavior.
**Depends on:** T03 (real captured data) + T04 (the solver). **Spec source:** `09-ui-spec.md` (authoritative), FR-04–FR-14, NFR-03/08/10.
**Estimate:** 4–5 ideal days. **Status:** in-progress (T05.1/T05.2 done 2026-10-09, v0.3.0, commit 42b49eb, D-18; T05.3 done 2026-10-09, commit 5334ab1: per-item Any/Pin/Ban lock controls + quantity editor with debounced re-solve, bundled Vazirmatn font, 179/179, live CDP smoke PASS; T05.4–T05.7 remain; T05.8 redesign + T05.9 apply flow done 2026-10-11, D-26/D-27/D-28 — see below).

| ID | Task | Notes | Est |
|---|---|---|---|
| T05.1 | Results page shell | **done** (v0.3.0, D-18): extension page `src/results/`, fa/RTL-first; verdict cards (current / optimized / savings + estimate caveat); empty-state explainer; pure `assemble.ts` (items+snapshots → solver input) unit-tested incl. the D-17 variant-switch end-to-end; page auto-opens from the SW on crawl completion; overlay now also closes from the crawl-start response (done/failed counts) — fixes the live "overlay never went away" | 1d |
| T05.2 | Plan rendering | **done** (v0.3.0, D-18): vendor-grouped table (item lines with variant label (D-17), one fee line per group carrying its flag, group subtotals, item/delivery/grand totals); every line reconciles (FR-12, tested); "prices as of" per item; unknown-fee honesty: current total is null when any fee is unknown (SDD 08) | 1d |
| T05.3 | Lock controls | Per-item dropdown: Any vendor / Pin to … / Ban … (multi); changes re-solve debounced (< 300ms target, NFR-03); quantity editing in the same row (FR-05) | 0.5d |
| T05.4 | Hints cards | Full arithmetic per hint (unit cost, fee removed, net effect, tolerance verdict); no apply buttons, no urgency patterns (09's copy rules) | 0.5d |
| T05.5 | Controls cluster + staleness | Plus toggle and tolerance slider (live hint re-evaluation, FR-14); staleness banner with per-item and whole-list re-capture (FR-04); crawl progress + abort surfaced here (from T03.6) | 0.5d |
| T05.6 | How-to-apply panel + options completion | Manual-apply instructions (which vendors, in what order, timestamps reminder); options page gains crawl delay + staleness threshold + the plain-language privacy note | 0.5d |
|| T05.7 | i18n/a11y pass | fa tested first, en second; table semantics, keyboard operability, visible focus, WCAG AA contrast check; numeral style per language | 0.5d |
|| T05.8 | Settled-bill redesign (D-27/D-28) | **done** (2026-10-11): hero / parcels (totals INCLUDE shipping) / ledger / action bar all show the same number (asserted in tests); staleness disclosure (30-min constant, Jalali tooltips); why-disclosure per line; lock pin + Plus + shipped-by-Digikala + hints in place; Lalezar wordmark; Vazirmatn+Lalezar bundled (no CDN, extension CSP); print stylesheet never splits a parcel; 360px/760px no horizontal scroll; no red outside error states; `results.css` 1222 lines, `format.ts` Persian numerals/units/relative times | 1.5d |
|| T05.9 | Apply-to-cart flow (D-26/D-28) | **done** (2026-10-11): `CartApplier` (preflight → add → verify → remove; unchanged lines and locked items untouched; partial failure keeps old rows + per-item retry + undo-all) behind `cart-transport.ts` (GET/POST/DELETE `/checkout/v1/carts(/items)`); cart snapshot → DB v3 `cartSnapshots` before mutating; price-change/out-of-stock sheets; seller-pin savings disclosed as not applyable via API; 7 pipeline tests on a mock transport | 0.5d |

**E2E status (D-29, 2026-10-11):** the redesign E2E runs offline and passes 6/6 (`e2e/e2e-settled-bill.py`: real Chromium + real 12-item/1336-snapshot capture, Persian digits, no ISO strings, shipping inside parcel totals, staleness disclosed). The live apply E2E is blocked on environment facts, not code: the smoke profile's session expired (401 «لطفا وارد حساب کاربری‌تان شوید» — needs a fresh login) and the storefront tarpits every browser from this host while `curl` (h1.1) and the API host answer fine; three of the four DNS A-records are dead from this host.

## Acceptance criteria

- End-to-end manual flows pass on real captured data: browse-add → results; cart-crawl → results; lock change → live re-solve; tolerance change → hint set changes without re-crawl; stale item → flagged with working re-capture.
- Every number on screen traces to a plan line; the reconciliation invariant (lines sum to totals) holds visually in all states, including estimate and approximate modes.
- Copy audit: no imperative verbs beyond "consider" (advise-only tone, D-01); Persian strings reviewed by a native speaker or carefully double-checked — this UI ships fa-first.
- Keyboard-only navigation completes the core loop (view plan, set a pin, change tolerance, read a hint); focus order is logical in RTL.
- Rerender performance: lock/tolerance/quantity interactions stay under 300ms on a 20-item plan.

## Definition of done

Manual flow checklist recorded in the PR (both languages); screenshots of every state (populated, empty, error, estimate-mode, approximate-mode, stale) attached; `09-ui-spec.md` amended wherever reality improved on it.
