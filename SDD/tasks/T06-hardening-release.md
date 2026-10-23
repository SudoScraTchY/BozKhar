# T06 — Hardening & Release

**Goal:** Turn a working MVP into something that survives Digikala changing and ships to the Chrome Web Store and Firefox Add-ons: extractor canaries, packaging, privacy note, live E2E pass, and the Firefox port.
**Depends on:** T05. **Spec sources:** NFR-04/05/06, R-02/R-04/R-05, OQ-05, `01-product-definition.md` success signals.
**Estimate:** 3 ideal days (plus the Firefox port, D-46). **Status:** in progress — the CI/CD pipeline, the audited store package and the publishing guide are done (T06.5's packaging half and T06.7, 2026-10-16, D-33); the Firefox build/audit/package is done (T06.6, 2026-10-23, D-46). Canaries, the live E2E pass, the live Firefox smoke and the AMO submission remain.

| ID | Task | Notes | Est |
|---|---|---|---|
| T06.1 | Selector canary tests | Nightly-style (or pre-release) run of the T03 fixture suite; a fixture that fails after a site change must produce a loud, actionable report ("vendor offer row selector broken since extractor vX") | 0.5d |
| T06.2 | Extractor versioning process | One-pager: bump procedure, fixture refresh steps, user-facing error text templates; shipped `extractorVersion` visible in options for support conversations | 0.25d |
| T06.3 | Live-site manual E2E checklist | Scripted pass on digikala.com: multi-vendor cart crawl, plan verification by hand (fees, promos, Plus on/off, large item, one lock, one hint), staleness re-capture; no purchase completed at any point | 1d |
| T06.4 | Privacy note + permission audit | Final audit: manifest contains exactly the agreed permissions; zero non-Digikala network calls in a session log; plain-language privacy note (local-only, advise-only) ready for the listing and options page | 0.25d |
| T06.5 | Packaging + store listing | Zip build **done** (`scripts/package-store-zip.py`: manifest.json at the archive root, byte-stable entries, `.sha256` sidecar); the reviewer-facing listing answers (single purpose, per-permission justifications, data/remote-code declarations, trademark hygiene) are drafted in `agent/PUBLISHING.md`. Still to write: the fa/en listing copy and the screenshot set | 0.5d |
| T06.6 | Firefox port | **Done 2026-10-23 (D-46).** `scripts/build-firefox.mjs` derives `dist-firefox/` from the audited Chrome bundle (background.scripts, no `use_dynamic_url`, Gecko id/min 140/`websiteContent`); `scripts/audit-firefox-dist.mjs` proves shared fields and byte-identical files; `web-ext lint` gates CI. Runtime deltas: 10 s crawl keepalive, `tabs.sendMessage` progress, Digikala-tab resolution for results-page crawls, SPA pathname poll, delegate-first PDP fetch. Unit/integration tests added | — |
| T06.8 | Firefox live smoke + AMO submission | Run `agent/FIREFOX-SMOKE.md` on Firefox 140+ with a real account: >90 s crawl, event-page termination, SPA nav, apply/undo, insights, exports, share cards. Then submit the listed AMO listing with the source zip and the reviewer answers in `agent/PUBLISHING.md` | 0.5d |
| T06.7 | CI/CD: gates, package, attest, release | **Done 2026-10-16 (D-33).** `.github/workflows/ci.yml` (quality + test on Node 22/24 + built-manifest audit + zip + artifact), `release.yml` (`v*` tag → re-verify, tag==version, attest, `gh release create`), `.github/dependabot.yml` (minor+patch groups; majors one at a time — see D-33's amendment); `scripts/audit-dist.mjs` applies NFR-06 to the artifact. Actions pinned by SHA, token read-only, no secrets | 0.5d |

## Acceptance criteria

- Canary suite runs against the committed fixture corpus and fails loudly on an intentionally broken selector (verified by sabotage test).
- The E2E checklist executes fully on the live site with zero failed captures (or every failure honestly surfaced and retryable), and hand-verified plan math on at least one multi-vendor cart with a promo.
- Session network log shows no request to any origin besides digikala.com and the two documented on-demand hosts (api.torob.com, api.github.com).
- Store listing package complete in both languages; version tagged; Firefox package passes `audit:dist:firefox` and `web-ext lint`.
- Firefox 140+ smoke passes, including a crawl longer than 90 s and a mid-crawl event-page termination; the AMO submission is recorded.
- **Met (2026-10-16):** `npm run audit:dist` fails the build when the artifact's version, permissions, host matches or manifest keys drift from the audited set (verified by running it against the pre-bump `dist/`), and the packaged zip is attested with build provenance.

## Definition of done

v0.1.0 tag; release notes quoting the success signals of `01-product-definition.md` with measured values where available (capture success rate, end-to-end time, savings on the E2E carts); remaining OQs re-triaged into either the spike-followup list or specific NTH triggers.
