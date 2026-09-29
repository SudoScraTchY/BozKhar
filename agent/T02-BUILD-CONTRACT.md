# T02 Foundation - ZCode Build Contract

Authoritative spec sources (read these in the repo):
- SDD/tasks/T02-foundation.md  (task list T02.1-T02.7, acceptance criteria, DoD)
- SDD/06-architecture.md       (components, data flow, permissions, tech defaults)
- SDD/08-data-model.md         (entities, storage mapping, migration, privacy)
- SDD/02-requirements.md       (FR-16, NFR-04/05/06/08)
- SDD/00-decision-log.md       (D-01, D-02, D-05, D-12)

## Mission
Implement T02 Foundation for a Chrome MV3 extension at the repo root:
scaffold + tooling + storage + settings + i18n + options page v0. No capture
logic, no solver, no crawl (T03/T04/T05 land later). The only user-visible
surface is the options page.

## Tasks
- T02.1 tooling: TypeScript strict, Vite + @crxjs/vite-plugin, ESLint 9 flat
  config, Prettier, Vitest (solver-package-ready: unit tests must run with
  zero browser APIs). Devdeps are already being installed in package.json;
  adjust versions only if the registry forces it, and note it.
- T02.2 manifest (MV3 via crxjs config): permissions exactly ["storage","tabs"];
  host_permissions exactly ["https://*.digikala.com/*"]; options_page/
  options_ui pointing at the options page; no remote code, default CSP.
  Service worker may be a minimal placeholder (crawl arrives in T03).
- T02.3 storage layer: typed IndexedDB wrapper (NO ORM/dependency) exposing
  the stores items / snapshots / promos per SDD/08-data-model.md
  (ComparisonItem keyed by productId+variantId; snapshots APPEND-ONLY,
  latest-per-item query; promos per vendor). Schema version field +
  forward-only migration hook. Typed TS interfaces for all entities in
  SDD/08 (fields described there; exact TS shape is your implementation
  detail). clearAll() empties every store (FR-16 privacy gate).
- T02.4 settings: chrome.storage.local typed accessor with keys hasPlus,
  tolerancePercent, uiLanguage, crawlDelayMs, stalenessWarnHours - defaults
  per SDD/08 (hasPlus=false; tolerance default: pick a sane value (e.g. 2)
  and note it; uiLanguage "fa"; crawlDelayMs 1500 per NFR-07;
  stalenessWarnHours 24 per FR-04), change subscription.
- T02.5 i18n: fa (RTL, PRIMARY) + en message catalogs, RTL/LTR direction
  driven by uiLanguage, helper so no component hardcodes strings. Use the
  real Persian strings from SDD/09-ui-spec.md Surface 4 where applicable
  (options page wording may be simple but must be real, suggestion-worded,
  advise-only tone).
- T02.6 options page v0: renders/edits all five settings bilingually with
  correct RTL/LTR; export-to-JSON (items + latest snapshots + settings,
  lossless) + clear-all with confirmation, wired to the storage layer
  (FR-16). Include the short local-only privacy note and the extractor
  version display (09-ui-spec Surface 4). Clean, generous-whitespace design
  (preset "11 Build": 70%+ whitespace, weight-shift typography 200-600,
  single sparing accent color; fa layout is primary, not an afterthought).
- T02.7 smoke: extension loads unpacked cleanly; README section "Development
  quickstart" gets a newcomer from clone to loaded extension in <10 minutes
  (prerequisites, install, build, load dist/ unpacked, open options, toggle
  fa/en, export, clear). If Chrome headless is available on this Windows
  machine (C:\Program Files\Google\Chrome\Application\chrome.exe), add a
  scripted smoke check; if not feasible, document the manual checklist.

## Hard constraints (from SDD, non-negotiable)
- Advise-only/local-only: no network calls anywhere; no telemetry; no
  remote code; no cart mutation code paths (D-01/D-02).
- Permissions EXACTLY storage+tabs+*.digikala.com (NFR-06).
- No new runtime dependencies; devDependencies only. Solver stays
  dependency-free and browserless (it is not in scope now, but the tooling
  must not bake in browser APIs).
- Monorepo layout suggestion: src/shared (types, i18n, settings), src/
  options, src/background (placeholder), src/shared/storage. Keep it simple;
  this is the base T03/T04/T05 build on.
- All text/comments/docs in English (SDD language); UI strings in fa+en.

## Acceptance evidence to produce (run these, capture output)
1. npm run build -> dist/ with manifest.json, options html/js, service
   worker. Paste the manifest.json content verbatim in your report.
2. npm run test -> storage unit tests all green, including:
   - item round-trip keyed by productId+variantId
   - snapshots append-only (two captures = two records; latest returns #2)
   - migration hook runs on version bump
   - clearAll empties every store
   IndexedDB in vitest: use fake-indexeddb (devDependency) ONLY as a test
   shim - never imported by runtime code.
3. npm run typecheck, npm run lint, npm run format:check -> clean output.
4. Permission audit: print the permissions + host_permissions arrays from
   the BUILT dist/manifest.json and assert they match the allowed set.
5. If a scripted Chrome smoke was feasible: how you ran it + result.
   Otherwise: the manual checklist.

## Report back
Changed/created files (with one-line reasons), exact commands with exit
codes and the relevant output tail, deviations from this contract with
reasons, anything NOT completed or NOT verified. Distinguish clearly between
what you ran successfully and what you merely expect to work.