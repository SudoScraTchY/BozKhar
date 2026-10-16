# Starter prompt — paste into a new AutoClaw chat in project 「Digikala-opt」

Copy everything below the line into the new instance's first message.

---

Read **`agent/HANDOFF.md` §0 first** (the 2026-10-16 rounds 3–4 section — it is the current state; the older sections below it are history, still accurate for T02/spike/T03 details), then the SDD: `SDD/README.md`, `SDD/00-decision-log.md` (the last entries D-26…D-33 are the live conventions), `SDD/09-ui-spec.md`, `SDD/tasks/T05-ui.md`, `SDD/tasks/T06-hardening-release.md`, and `agent/PUBLISHING.md` (the store/release path).

**State (v0.4.0).** T03 capture and T04 solver are committed. The UI round is done: the settled-bill results page (D-27/D-28), the apply-to-cart flow whose cart calls run in an open digikala tab's main world (D-30), one 3D brand mark everywhere, a header export menu (PDF / CSV / Excel / pretty text / Markdown / plain text), a Plus switch that actually toggles (D-31), hint arithmetic + a results-page tolerance slider + settings-driven staleness with per-item re-capture (D-32). The repo now builds itself (D-33): `.github/workflows/{ci,release}.yml` + `.github/dependabot.yml`, with `scripts/audit-dist.mjs` applying NFR-06 to the built artifact and `scripts/package-store-zip.py` producing the store zip. `291/291` tests across 26 files; `tsc --noEmit`, ESLint, Prettier and `vite build` clean over the **whole** tree. **The tree is clean and everything through `90afe14` is on `main`** (the first commits since `0147758`; `docs/` is the landing page, untouched). One scar worth knowing: a Dependabot dev-dependency group was merged while its CI was red and took `main` down — `90afe14` reverses it, and `.github/dependabot.yml` now keeps majors out of the group. Never merge a red PR.

**Open, in priority order** (the tracking issues, each with a status comment recording exactly what is missing):

1. `#5` — options completion is verified done; the a11y half still lacks **table semantics** on the item grid (`role="table"/"row"/"cell"`) and a full WCAG AA contrast sweep.
2. `#6` — the human smoke gate: only the user can confirm the report matches the Digikala checkout panel. Do not close it yourself.
3. `#7` — T06 hardening + release: its CI/CD half is now done (D-33); what remains is T06.1–T06.4 (canaries, extractor versioning, the live-site E2E checklist, the privacy note), T06.5's fa/en listing copy + screenshots, and T06.6's Firefox verdict.

`#3` (hint arithmetic) and `#4` (tolerance on the plan, per-item re-capture, the settings-driven staleness threshold) were done in D-32 and are **closed**.

**Releasing (only when the user asks).** Bump `package.json`, commit, then `git tag -a v0.4.1 -m "…" && git push origin v0.4.1`. The Release workflow refuses any tag that does not equal `v$(package.json version)` and publishes the attested zip. Never create the tag or push on your own initiative.

**Verify with the browser, not just the suite.** `e2e/e2e-settled-bill.py` renders the real `dist` in real Chromium over the real 12-item / 1336-snapshot capture seeded into the extension's own IndexedDB in an isolated profile; it passes 10/10 and asserts the header mark, the six export formats, a **real click** on the Plus switch and the missing approximate notice. It cannot run in CI (it needs the git-ignored Playwright Chromium and IndexedDB dump under `.openclaw/tmp/`). Two traps that cost time: a control can pass a `change`-dispatching test while its real hit target belongs to a sibling span (use `document.elementFromPoint`), and jsdom's `Blob` has no `text()`/`arrayBuffer()`.

**Environment.** `node` / `npm` / `npx` are **not on PATH** — use `ELECTRON_RUN_AS_NODE=1 "m:/Users/SaintScraTchY/AppData/Local/Programs/Qoder/Qoder.exe" node_modules/{vitest/vitest.mjs,typescript/bin/tsc,eslint/bin/eslint.js,vite/bin/vite.js,prettier/bin/prettier.cjs}`. Python: `/c/Users/SaintScraTchY/AppData/Local/Programs/Python/Python314/python.exe`. The pw Chromium and the E2E's IndexedDB dump live in `.openclaw/tmp/` (git-ignored). `npm run verify` runs the four local gates; `npm run build && npm run audit:dist` checks the artifact. `zip` is **not** installed on this machine — packaging is `python scripts/package-store-zip.py`.

Hard constraints: advise-first (cart writes only inside the user-initiated apply flow, D-26/D-30 — never a write outside it), local-only (D-02), permissions exactly storage+tabs+scripting+https://*.digikala.com/* (NFR-06, `tests/manifest.test.ts` and `scripts/audit-dist.mjs` both fail otherwise), zero runtime deps (D-15/NFR-09 — CI checks this as a policy step), TS strict/ESLint/Prettier per repo config, all gates green before each commit, cite task IDs in commits, SDD amendments ride in the same commit as the deviation. **Never commit unless the user asks.**

Update the checklist as you go and report gate evidence with each commit.
