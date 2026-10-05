# Starter prompt — paste into a new AutoClaw chat in project 「Digikala-opt」

Copy everything below the line into the new instance's first message.

---

Read `agent/HANDOFF.md` first (the 2026-10-05 section at the top is current; the 2026-09-30 section at the bottom is superseded but its T02/spike details still hold), then the SDD: `SDD/README.md`, `SDD/00-decision-log.md`, `SDD/07-solver-behavior.md`, `SDD/tasks/T03-capture.md`, `SDD/tasks/T04-solver.md`.

State: T04 (solver) is fully implemented and tested but **uncommitted** — `src/shared/solver/` (11 files incl. `API.md`), `tests/fixtures/solver/` (11 JSON fixtures), and 3 solver test files. All gates were verified green: 60/60 tests, typecheck, lint, format:check. Zero runtime dependencies. Do not redesign the solver; its semantics and the reasons are documented in the handoff (input-only fee table, two scoring views, floor tolerance bound, flag precedence).

Continue the approved 9-step plan from step "t04-props":

1. Add `tests/solver-performance.test.ts` (30 items × 10 vendors < 1s; envelope switch at 40/15 exact → approximate beyond; `selectMode`/`isWithinEnvelope` unit checks). Verify all four gates again.
2. **t04-commit** (one commit): flip `SDD/tasks/T04-solver.md` `todo` → `in-progress` with gate evidence; append implementation notes to `SDD/07-solver-behavior.md`; add the two new OQs (promo counts in units; vendor group mixing large+regular) to `SDD/10-risks-open-questions.md`; commit citing `ref T04.1`–`ref T04.7`. Do NOT flip T04 to `done`.
3. **T03 capture** (t03-readers, t03-crawl, t03-surfaces) per the module structure in the handoff: payload readers (JSON APIs, DOM fallback only), Rial→Toman normalization, resumable sequential crawl with `crawlDelayMs`, cart merge, content-script surfaces, service-worker fetch. Fixture tests from hand-authored sanitized payloads matching `SDD/spike-findings.md` shapes — live API fetch is unavailable from this environment, do not block on it.
4. **t03-commit**: amend `SDD/06-architecture.md` (readers module replaces selectors module; DOM scoped to mount points/fallback; capture fetch in service worker) in the same commit; `T03-capture.md` → `in-progress`; cite `ref T03.x`.
5. **smoke**: ask me before any live cart touch. Human load-unpacked smoke + my confirmation before either task flips to `done`.

Hard constraints: advise-only (no cart write calls ever, D-01), local-only (D-02), permissions exactly `storage`+`tabs`+`https://*.digikala.com/*` (NFR-06), solver pure with zero runtime deps (D-15/NFR-09), TS strict/ESLint/Prettier per repo config, all four gates green before each commit, cite task IDs in commits, SDD amendments ride in the same commit as the deviation.

Update the checklist as you go and report gate evidence with each commit.
