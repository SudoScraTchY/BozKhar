# Handoff — Digikala Cart Optimizer (mid T03/T04)

**Date:** 2026-10-05 · **Prepared by:** AutoClaw session (supersedes the 2026-09-30 handoff below; its T02/spike sections remain accurate and are kept at the bottom) · **Workspace:** `M:\Agentic\Projects\Digikala-opt` (branch `main`)

**⚠ Tree is NOT clean:** T04 is fully implemented and tested but **uncommitted**. Commit is a pending planned step (see "Remaining work").

## Project state

| Item | Status | Evidence |
|---|---|---|
| SDD v0.1 | complete | commit `34b1853` |
| T02 Foundation | done, stakeholder-confirmed | `a211442` (impl), `1bf8bd8` (done) |
| T01 Discovery spike | **GO** | `SDD/spike-findings.md` v2, `3cfdbf2`→`8b71ee5` |
| T04 Solver | **implemented + tested, UNCOMMITTED**; SDD status still `todo` (must flip to `in-progress` in the t04-commit) | 11 solver files + 11 fixtures + 3 test files, all gates green (see below) |
| T03 Capture | **not started** (planned module structure below) | — |
| T05 UI / T06 Hardening | queued | — |

Commit chain: `34b1853` → `7d9c160` (EOL) → `a211442` (T02 impl) → `1bf8bd8` (T02 done) → `3cfdbf2` (spike v1) → `41195f2` (T01 status) → `8b71ee5` (spike v2 GO) → `7fd1323` (handoff doc). Work plan for T03+T04 was approved by the stakeholder with a 9-step checklist: t04-core, t04-fixtures, t04-props, t04-commit, t03-readers, t03-crawl, t03-surfaces, t03-commit, smoke. Steps t04-core and t04-fixtures are complete; **t04-props is ~90% done** (properties + determinism + edge cases green; the performance/envelope test is missing — see Remaining work #1).

## Verified gate evidence (run 2026-10-05, this workspace)

```
npm run test          → 7 files, 60/60 passed (was 26/26 baseline + 34 new solver tests)
npm run typecheck     → clean (tsc --noEmit, strict)
npm run lint          → clean (eslint .)
npm run format:check  → clean (prettier --check .)   [after npx prettier --write on new files]
```

Zero runtime dependencies preserved (`package.json` has no `dependencies` block; do not add any — D-15/NFR-09).

## Untracked files awaiting the t04-commit

```
src/shared/solver/            types.ts envelope.ts promos.ts evaluate.ts enumerate.ts
                              promote.ts approximate.ts hints.ts solve.ts index.ts API.md
tests/fixtures/solver/        fee-coupling.json xyz-gating.json xyz-gating-tolerance.json
                              lock-ride-along.json promo-satisfied-in-plan.json
                              plus-on-off-large-regular.json fee-unknown-estimate.json
                              quantity-effects.json ties-and-degenerate.json
                              vendor-count-unreachable.json ban-exhaustion-and-repair.json
tests/solver-fixtures.test.ts tests/solver-edge-cases.test.ts tests/solver-properties.test.ts
```

## What T04 delivers (semantics the next instance must not silently change)

**Entry:** `solve(input: SolverInput) → { plan, hints }` from `src/shared/solver/index.ts`. Pure, dependency-free, browserless; integer Toman. `API.md` in the same folder is the one-page contract.

**Architecture** (SDD 07 steps): `prefilter` (stock/ban/pin → solvable items + fixed pinned assignments + unsolved with reasons) → vendor-set bitmask enumeration over `poolVendorIds` (pinned vendors forced into every mask) → in-set cheapest assignment per item → promo repair pass → best by (total, fewer vendors, lexicographic signature) → `buildPlan` (fee flags, groups, totals) → `buildHints`. Above the envelope (40 items/15 vendors, `envelope.ts`) the mode flips to labeled `approximate` (greedy + repair).

**Key implementation decisions, all load-bearing:**

1. **Fee table is input-only (`buildFeeTable`).** A vendor+class fee = max of known fees across that vendor's in-stock offers; null only if every such offer's fee is null. This makes the grand total a function of the vendor *set*, which is what makes enumeration exact (SDD 07 step 3). The naive "first non-null fee among member offers" rule was tried and is **wrong**: it makes totals assignment-dependent and enumeration silently suboptimal (caught by seeded property test, seed 1000: 143 vs true optimum).
2. **Two scoring views.** `scoringTotal` / `buildGroups({scoreOnly:true})` charge pinned vendors like any vendor (enumeration/repair view). Final `buildPlan` re-flags the pinned vendor's fee as `already-paid-by-lock` (display view). Both must exist; collapsing them reintroduces the seed-1000 bug.
3. **Tolerance bound is `floor(cartTotal × tolerancePercent / 100)`**, not round — pinned by SDD 07's xyz-gating pair (150-cart: 2% → bound 3 → net −2 hint shown; 1% → 1.5 → hidden). `hints.ts` comment documents this; rounding breaks the fixture.
4. **Flag precedence** (SDD 07 impl notes): `promo-waived` > `plus-covered` > `already-paid-by-lock` > `regular`; large-item class never Plus-covered/promo-waived (D-13); unknown fee may coexist with any flag via `totalIsEstimate` + `estimateRange {low = grandTotal − unknownGroupCount × fallback, high = grandTotal}`.
5. **Shipment group = vendor × class** (`seller` | `large-item`) per spike S-5/S-6.
6. **Promo counts in units** (not distinct items) so vendor-count promos are hint-reachable (new OQ to record, see Remaining work #2).
7. **Hints:** exactly-one-unit-short promos only, candidate item must already be in the list (D-11), feeRemoved vs extraUnitCost with full arithmetic; net saving → `saving` always; net increase → `within-tolerance` only within bound; larger increases absent outright (D-10). Net-zero counts as within-tolerance.
8. **Promo repair** (`promote.ts`): minimal move-set reaching the threshold, accepted only if `scoringTotal` strictly improves; moves ordered by (price delta, itemKey); pins and large items never move.

**Fixture notes (all hand-verified, SDD numbers verbatim):** fee-coupling 117 (naive 130); lock-ride-along unlocked-portion 113, displayed grand total 228 with the V1 fee `already-paid-by-lock`; xyz-gating: Z-hint absent (outright reject), Y-hint net +7 `saving`, tolerance sub-case flips at 2% vs 1% with a 150-cart reproduced via item W=124 (10+5+124 items + 3+3+5 fees = 150). `promo-satisfied-in-plan` exercises the repair pass (greedy start 270 → repaired 234, both promo types waived in-plan). Every fixture also asserts the FR-12 reconciliation invariant in `solver-fixtures.test.ts`.

## Remaining work, in order

1. **Finish t04-props:** add `tests/solver-performance.test.ts` — 30 items × 10 vendors solves < 1s (plain JS, one thread); envelope switch verified at 40/15 (exact) and beyond (approximate mode labeled so); `isWithinEnvelope`/`selectMode` unit checks. Then re-run all four gates.
2. **t04-commit (one commit):** amend `SDD/tasks/T04-solver.md` status `todo` → `in-progress` with the gate evidence above and per-subtask notes (T04.1–T04.7: 1–5 done, 6 done, 7 partial); append implementation notes to `SDD/07-solver-behavior.md` (fee-flag precedence; input-only fee table for exactness — this *resolves* a spec ambiguity, record it; floor tolerance bound; units-based promo counts; net-zero hint = within-tolerance); add two new open questions to `SDD/10-risks-open-questions.md`: vendor-count promos counted in units (default chosen) and vendor groups mixing large+regular items (one fee line per class per D-14). Commit message cites `ref T04.1`–`ref T04.7`. Do **not** flip to `done` — needs human smoke + stakeholder confirmation (same protocol as T02).
3. **t03-readers / t03-crawl / t03-surfaces (T03):** module structure already decided: `src/capture/version.ts` (bump EXTRACTOR_VERSION from `0.0.0-t02`), `errors.ts`, `readers/product.ts` + `readers/cart.ts` + `readers/url.ts` (payload readers per spike — DOM demoted to fallback), `normalize.ts` (Rial→Toman, fee provenance), `dom/selectors.ts` (mount points only), `capture-product.ts`, `cart-merge.ts` (cart quantities win, snapshots are history), `crawl/state.ts` (resumable, no duplicate snapshots, closed scope checked before each navigation), `crawl/orchestrator.ts` (one reused tab, sequential, `crawlDelayMs`, abort between pages, per-item failure containment), `content/` (Add-to-comparison + Optimize-cart buttons, toast with offer count + variant label, toolbar badge), `fetch/digikala-fetch.ts` (service-worker fetch with user session, avoids content-script CORS), crawl messaging in `service-worker.ts`. Fixtures: hand-authored sanitized JSON matching spike-documented shapes (live API fetch is unavailable from this environment — `fetch_content` failed; do NOT retry as a blocker). Etiquette audit tests with injected fakes: sequential-only, delay respected, no non-Digikala origin, no cart writes ever (D-01).
4. **t03-commit:** gates green; amend `SDD/06-architecture.md` in the SAME commit (readers module replaces selectors module as primary extractor per spike S-7; DOM scoped to mount points/fallback; capture fetch lives in the service worker); `SDD/tasks/T03-capture.md` → `in-progress` with evidence; commit cites `ref T03.x`.
5. **smoke (final):** ask the user BEFORE any live cart touch (never enter payment; restore cart state). Human load-unpacked smoke + stakeholder confirmation required before flipping either task to `done`.

## Binding constraints (unchanged)

- **Advise-only (D-01):** no cart write calls anywhere, ever. **Local-only (D-02).** **Permissions exactly** `storage`+`tabs`+`https://*.digikala.com/*` (NFR-06, `tests/manifest.test.ts` fails otherwise).
- Solver stays pure/browserless/importable in Node (NFR-09); never import from `tests/` in runtime code; `tests/setup.ts` installs fake-indexeddb globally.
- TS strict with `noUncheckedIndexedAccess` (indexed access returns `T|undefined` — the solver code handles this with `?? fallback` patterns; keep it). ESLint: unused vars must be `_`-prefixed; `import type` for type-only imports (consistent-type-imports). Prettier: singleQuote, semi, printWidth 100, trailingComma all — run `npx prettier --write` on new files before `format:check`.
- Cite task IDs in commits; SDD doc amendments ride in the same commit as the deviation; all four gates green before every commit; never commit without evidence from your own runs.

## Environment

- win32, PowerShell 5.1; invoke `python` (not python3); Node v24.20.0, npm 11.19.0 on PATH.
- Git already has `safe.directory` exception for this repo. Playwright Chromium for extension smokes: `%LOCALAPPDATA%\ms-playwright\chromium-1148\chrome-win\chrome.exe` (branded Chrome/Edge ignore `--load-extension` headless). Dev-only scripts in `.openclaw/tmp/` (git-ignored; currently holds solver debug repros — safe to delete).
- Full test suite runs in ~1–6s now (was 27s at baseline; machine variance).
- Runtime date at handoff time: 2026-10-05.

---

# Superseded handoff (2026-09-30) — T02/spike sections still accurate

**Date:** 2026-09-30 · **Prepared by:** AutoCoder session · **Workspace:** `M:\Agentic\Projects\Digikala-opt` (branch `main`)

Spec source of truth is the SDD (`SDD/README.md` first, then `00-decision-log.md`, task board in `SDD/tasks/`). This file summarizes state; the SDD and `SDD/spike-findings.md` carry the details.

## What T02 delivered (keep intact)

- **Manifest** `src/manifest.ts`: MV3, permissions EXACTLY `storage` + `tabs` + `https://*.digikala.com/*` (enforced by `tests/manifest.test.ts`). Deliberately **no `default_locale`** — declaring it without a `_locales/` bundle makes Chrome reject the whole extension at load (smoke-caught bug; comment in file explains).
- **Storage** `src/shared/storage/db.ts`: typed IndexedDB wrapper, factory-injected (fake-indexeddb in tests only). Stores: `items` (keyPath `itemKey` = `productId::variantId`), `snapshots` (append-only via `add()`, latest-per-item via `byItem` index, tie-break on snapshotId), `promos`. Forward-only `runMigrations`; `clearAllStores` = FR-16 privacy gate. Facade: `src/shared/storage/index.ts`.
- **Settings** `src/shared/settings/settings.ts`: typed `chrome.storage.local` accessor — `hasPlus=false`, `tolerancePercent=2`, `uiLanguage='fa'`, `crawlDelayMs=1500`, `stalenessWarnHours=24`; per-field coercion; change subscription.
- **i18n** `src/shared/i18n/messages.ts`: fa (RTL primary) + en; advise-only wording.
- **Options page v0** `src/options/`: bilingual, RTL/LTR, export JSON, confirmed clear-all, privacy note, extractor version display (`0.0.0-t02`).
- **Export** `src/shared/export/export.ts`: versioned lossless envelope.
- **Tooling**: TS strict, Vite + @crxjs 2.7.1, ESLint 9 flat, Prettier, Vitest (node env; `tests/setup.ts` installs fake-indexeddb — never import test shims from runtime code). Scripts: `build`/`dev`/`test`/`typecheck`/`lint`/`format:check`.

## Spike findings that bind T03/T04 (details + numbers in `SDD/spike-findings.md` v2)

1. **Capture via JSON APIs, not DOM.** Product: `GET api.digikala.com/product/v1/products/<id>/?variant_id=<vid>`. Cart: `GET /checkout/v1/carts` (+ `/carts/mini`). DOM is fallback — implement NFR-05's "selectors module" as a **payload readers module** and amend `06-architecture.md` at T03 kickoff.
2. **Fee location:** per-offer fee at `variants[].shipment_methods.providers[].price.{value,is_free}` (Rial). Cart payload repeats the per-seller fee line on each item of that seller. Some sellers have `providers: []` or no `price` key = FBM via Digikala = fee unknown.
3. **D-14 CONFIRMED:** one fee per vendor shipment regardless of units. Checkout tracking payload exposes canonical `shipments[]` with `shippingCost` + `shippingProducts[]`.
4. **Large items** ship as their own class (`ارسال کالاهای بزرگ و سنگین`), separate fee (observed 359,000 Toman), time-slot-gated ("تعیین نشده" until slot). Plus interaction untested.
5. **Use EFFECTIVE fees:** logged-in users get large shipping discounts (observed list 319,000 → effective 168,000).
6. **Variant identity by URL:** cart item URLs embed `?variant_id=`; PDP API honors it — crawl deep-links, no in-page variant selection.
7. **Promos:** per-seller Plus entitlements machine-readable (`digiplus.services[]`, `services_summary`, `price.is_locked_for_digiplus`, cart price `is_digiplus_promotion`). Count-promo shapes and amount-threshold promos open (S-3 residual, OQ-01).
8. **Open non-blockers:** Plus A/B (account is non-Plus), Plus × large-item fee, count-promo payload shapes.

## Etiquette for live testing

The user's Digikala account is logged into the AutoClaw built-in browser (non-Plus). **Never enter payment**; restore cart state after tests (the spike did, via `PATCH /checkout/v1/carts/items`); **ask before touching the cart**.
