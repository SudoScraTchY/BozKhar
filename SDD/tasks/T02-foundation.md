# T02 — Foundation

**Goal:** A loadable MV3 extension skeleton with storage, settings, i18n, and build tooling — everything T03/T04/T05 build on, nothing user-visible except an empty options page.
**Depends on:** T01 (may start in parallel; freeze before merging if the spike forces structural changes).
**Spec sources:** `06-architecture.md`, `08-data-model.md`, NFR-04/05/06/08.
**Estimate:** 2 ideal days. **Status:** in-progress (implementation complete 2026-09-30: scaffold, storage, settings, i18n, options page v0, 26 unit tests green, CDP smoke 12/12; DoD pending: load-unpacked smoke recorded in a PR + docs 06/08 deviation check).

| ID | Task | Notes | Est |
|---|---|---|---|
| T02.1 | Repo + tooling | TypeScript strict; Vite with a Chrome-MV3 extension plugin; ESLint/Prettier; Vitest wired to run the (future) solver package with zero browser APIs | 0.5d |
| T02.2 | Manifest + permissions | MV3; permissions exactly `storage`, `tabs`, host `*.digikala.com` (NFR-06); no remote code; CSP default | 0.25d |
| T02.3 | Storage layer | Typed IndexedDB wrapper with the stores of `08-data-model.md` (items / snapshots / promos); append-only snapshot writes; schema version field + forward-only migration hook | 0.5d |
| T02.4 | Settings access | `chrome.storage.local` typed accessor: `hasPlus`, `tolerancePercent`, `uiLanguage`, `crawlDelayMs`, `stalenessWarnHours`, with defaults and change subscription | 0.25d |
| T02.5 | i18n scaffold | fa (RTL, primary) + en message catalogs; layout direction driven by language; helper so no component hardcodes strings | 0.25d |
| T02.6 | Options page v0 | Renders/edits all settings bilingually; data export (JSON) + clear-all wired to the storage layer (FR-16) | 0.25d |
| T02.7 | Load-unpacked smoke + dev quickstart | Extension loads cleanly in Chrome; a README dev section gets a new contributor from clone to loaded extension in < 10 minutes | 0.25d |

## Acceptance criteria

- `pnpm build` (or npm equivalent) produces a loadable `dist/`; loading unpacked shows the options page in fa and en with correct RTL/LTR.
- Storage unit tests pass: item round-trip keyed by productId + variantId; snapshots append (two captures = two records, latest query returns the second); migration hook runs on version bump.
- Permission audit: the built manifest contains exactly the permissions of T02.2 — nothing more.
- A storage-layer test asserts clear-all empties every store (privacy gate from `08`).

## Definition of done

All tests green; smoke checklist (load, open options, toggle language, export, clear) executed and recorded in the PR; docs `06`/`08` updated for any deviation.
