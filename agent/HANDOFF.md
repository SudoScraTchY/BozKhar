# Handoff — Digikala Cart Optimizer

**Date:** 2026-09-30 · **Prepared by:** AutoCoder session · **Workspace:** `M:\Agentic\Projects\Digikala-opt` (branch `main`, tree clean)

Spec source of truth is the SDD (`SDD/README.md` first, then `00-decision-log.md`, task board in `SDD/tasks/`). This file summarizes state; the SDD and `SDD/spike-findings.md` carry the details.

## Project state

| Item | Status | Evidence |
|---|---|---|
| SDD v0.1 (13 docs + task board) | complete | commit `34b1853` |
| T02 Foundation (scaffold, storage, settings, i18n, options page) | **done, stakeholder-confirmed** | commit `a211442` (impl), `1bf8bd8` (status flip); 26/26 tests; CDP smoke 12/12; human load-unpacked pass |
| T01 Discovery spike | **GO** (evidence-complete) | `SDD/spike-findings.md` v2, commits `3cfdbf2`→`8b71ee5` |
| T03 Capture / T04 Solver | **unblocked, not started** — run in parallel per task graph | `SDD/tasks/T03-capture.md`, `SDD/tasks/T04-solver.md` |
| T05 UI / T06 Hardening | queued | — |

Commit chain: `34b1853` baseline SDD → `7d9c160` EOL config → `a211442` T02 impl → `1bf8bd8` T02 done → `3cfdbf2` spike v1 → `41195f2` T01 status → `8b71ee5` spike v2 (GO).

## What T02 delivered (keep intact)

- **Manifest** `src/manifest.ts`: MV3, permissions EXACTLY `storage` + `tabs` + `https://*.digikala.com/*` (enforced by `tests/manifest.test.ts`). Deliberately **no `default_locale`** — declaring it without a `_locales/` bundle makes Chrome reject the whole extension at load (smoke-caught bug; comment in file explains).
- **Storage** `src/shared/storage/db.ts`: typed IndexedDB wrapper, factory-injected (fake-indexeddb in tests only). Stores: `items` (keyPath `itemKey` = `productId::variantId`, denormalized because IDB keyPaths cannot address nested objects), `snapshots` (append-only via `add()`, latest-per-item via `byItem` index, tie-break on snapshotId), `promos`. Forward-only `runMigrations`; `clearAllStores` = FR-16 privacy gate. Facade for runtime: `src/shared/storage/index.ts`.
- **Settings** `src/shared/settings/settings.ts`: typed `chrome.storage.local` accessor — `hasPlus=false`, `tolerancePercent=2`, `uiLanguage='fa'`, `crawlDelayMs=1500`, `stalenessWarnHours=24`; per-field coercion (type violation → default, numeric violation → clamp); change subscription.
- **i18n** `src/shared/i18n/messages.ts`: fa (RTL primary) + en catalogs; advise-only wording.
- **Options page v0** `src/options/`: bilingual, RTL/LTR switch, export JSON, confirmed clear-all, privacy note, extractor version display (currently `0.0.0-t02`).
- **Export** `src/shared/export/export.ts`: versioned lossless envelope (items + latest snapshots + settings).
- **Tooling**: TS strict, Vite + @crxjs 2.7.1, ESLint 9 flat, Prettier, Vitest (node env; `tests/setup.ts` installs fake-indexeddb — never import test shims from runtime code).
- **Scripts**: `build` / `dev` (watch) / `test` / `typecheck` / `lint` / `format:check`. Zero runtime dependencies (devDependencies only) — keep it that way (D-15/NFR-09).

## Spike findings that bind T03/T04 (details + numbers in `SDD/spike-findings.md` v2)

1. **Capture via JSON APIs, not DOM.** Product data: `GET api.digikala.com/product/v1/products/<id>/?variant_id=<vid>`. Cart: `GET /checkout/v1/carts` (+ `/carts/mini`). DOM scraping is fallback only — implement NFR-05's "selectors module" as a **payload readers module** and amend `06-architecture.md` at T03 kickoff.
2. **Fee location:** per-offer fee at `variants[].shipment_methods.providers[].price.{value,is_free}` (Rial). Cart payload repeats the per-seller fee line on each item of that seller.
3. **D-14 CONFIRMED** (checkout shipping page + qty 1→2 counterfactual): one fee per vendor shipment regardless of item count/units. Page's tracking payload exposes canonical `shipments[]` with per-shipment `shippingCost` + `shippingProducts[]` — the model T04 should compute against.
4. **Large items** ship as their own class (`ارسال کالاهای بزرگ و سنگین`), separate fee (observed 359,000 Toman), time-slot-gated ("تعیین نشده" until slot chosen). D-13 fee structure confirmed; Plus interaction untested.
5. **Use EFFECTIVE fees:** logged-in users get large shipping discounts (observed list 319,000 → effective 168,000). Solver must consume the effective/payload fee, never the PDP list fee.
6. **Variant identity works by URL:** cart item URLs embed `?variant_id=`; PDP API honors it (S-2 PASS) — crawl deep-links, no in-page variant selection.
7. **Promos:** per-seller Plus free-shipment entitlements are machine-readable (`digiplus.services[]`, `services_summary`, `price.is_locked_for_digiplus`, cart price `is_digiplus_promotion`). Count-promo shapes and amount-threshold promos remain open (S-3 residual, OQ-01).
8. **Open non-blockers:** Plus A/B (account is non-Plus), Plus × large-item fee, count-promo payload shapes.

## Binding constraints (SDD)

- **Advise-only (D-01):** no code path may mutate the user's cart. Ever.
- **Local-only (D-02):** no telemetry, no remote code, no non-Digikala network.
- **Permissions:** exactly `storage` + `tabs` + `*.digikala.com` (NFR-06) — the test fails CI on any change.
- **Solver:** pure, dependency-free, browserless module (D-15/NFR-09); fixtures from `SDD/07-solver-behavior.md` (`lock-ride-along`, `xyz-gating`) are mandatory tests in T04.
- **Process:** cite task IDs in commits (`ref T03.2`); update task-file statuses as you work; SDD doc changes ride in the same commit as the deviation (the SDD stays true).

## Environment notes

- Node 22 + npm; git identity already configured.
- **Browser automation:** branded Chrome/Edge ignore `--load-extension` in headless; use the Playwright Chromium (`%LOCALAPPDATA%\ms-playwright\chromium-1148\chrome-win\chrome.exe`) for scripted extension smokes. Smoke scripts live in `.openclaw/tmp/` (git-ignored, dev-only).
- The user's Digikala account is logged into the AutoClaw built-in browser (non-Plus). Etiquette for any future live testing: **never enter payment**, restore cart state after tests (the spike did: qty restored via `PATCH /checkout/v1/carts/items`), and ask before touching the cart again.

## Definition of done for next tasks

- T03: capture pipeline writes normalized Snapshots through the storage facade; fixture tests against saved (sanitized) API payloads; per-item failure containment; permission audit still green.
- T04: solver passes all `07-solver-behavior.md` fixtures incl. `lock-ride-along` and `xyz-gating`; <1s at 30 items × 10 vendors; deterministic byte-identical plans.
- Human smoke + stakeholder confirmation before flipping either task to `done` (same as T02).