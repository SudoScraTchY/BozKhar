# Starter Prompt — Digikala Cart Optimizer (next agent instance)

Copy everything below the line into the new agent's first message.

---

You are continuing development of the **Digikala Cart Optimizer**, a Chrome MV3 browser extension (TypeScript, zero runtime dependencies) in workspace `M:\Agentic\Projects\Digikala-opt`. Your first action must be to read `agent/HANDOFF.md` (top section, dated 2026-10-06) — it is the authoritative state summary and supersedes anything else. The SDD under `SDD/` is the spec source of truth (`SDD/README.md`, `00-decision-log.md`, task board in `SDD/tasks/`, spike numbers in `SDD/spike-findings.md`).

## Where things stand

- Committed through `7a7481e` on `main`, tree clean: T02 foundation, T01 spike (GO), T04 solver (`b9bbc19`), T03 capture core (`490aacf`) + surfaces (`a57091b`) + live-shape hardening (`f647270`) + SPA resilience (`e765a01`, `9d6a9a7`) + live cart anchors (`7a7481e`). Gates verified 2026-10-06: **137/137 tests across 17 files**, typecheck/lint/format/build all clean.
- Real-browser smoke Phase A passed 6/6 (PDP surface end-to-end). Phase B (cart crawl) is blocked on exactly one thing: **the checkout/cart API returns HTTP 401 to our fetches** (service-worker fetch, extension-page fetch, and plain page fetch all 401) while the site's own calls succeed. Everything else in Phase B is proven working on the live site: button mount, crawl start, progress/toast UI, badge, GET-only behavior, zero cart modification.
- The investigation narrowed the 401 cause to **custom request headers the site's JS attaches** (`x-site`, `x-source`, `X-Web-Optimize-Response` — no Authorization header involved; product API works fine without them). The replication experiment (`.openclaw/tmp/auth_recon11.py`) was interrupted by site network timeouts.
- The user already chose the fix path: **delegate cart fetches to the content script (same-origin page context) with the site's header set**. Do not re-litigate; if headers alone fix the 401 from page context, implement fetch delegation (content script performs GETs on behalf of the SW, which keeps orchestration/state).

## Your task chain

1. Verify the header hypothesis: open the Playwright Chromium with the logged-in profile, capture the site's `x-site`/`x-source`/`X-Web-Optimize-Response` header values via CDP on its own `carts/mini` call (these are believed to be non-secret routing markers like `"web"`, but verify before hardcoding; if anything looks like a real credential, mask it and stop), then replicate `GET https://api.digikala.com/checkout/v1/carts` from the page context with those headers and confirm 401→200.
2. Implement fetch delegation accordingly (messaging extension, D-02 scope guard preserved, GET-only audit tests preserved). Capture the real full-cart payload once 200 works and align `readCartPayload` (its `data.cart_item` vs `data.items` assumption is still fixture-derived and unverified). Add a live-shape fixture. Amend SDD docs in the same commit as any deviation.
3. Re-run Phase B via `.openclaw/tmp/phase_b_crawl.py` (7 checks) against the real cart (currently 8 items). Watch for site rate limiting — the site timed out repeatedly at the end of the last session; back off for minutes, never hammer.
4. If a 200 proves unreachable, fall back to cart-from-DOM extraction on the cart page (proven feasible: item links carry product+variant ids; needs item-list scoping and dedupe) with an SDD 06 amendment in the same commit.
5. After Phase B passes: report for human smoke + stakeholder confirmation. Do NOT flip T03/T04 to done in the SDD yourself.
6. Then continue with T05 (results UI) per `SDD/tasks/T05-ui.md`.

## Hard constraints (never violated)

- **Advise-only (D-01):** no cart write calls anywhere, ever. GET-only. **Ask before touching the cart; never enter payment; restore any cart state changed during testing** (the previous session ran Phase B with zero cart modification — keep that bar).
- **Local-only (D-02):** fetches guarded to `*.digikala.com`.
- **Permissions exactly** `storage` + `tabs` + `https://*.digikala.com/*` (NFR-06, enforced by `tests/manifest.test.ts`).
- **Zero runtime dependencies** (D-15/NFR-09). Solver stays pure/browserless.
- TS strict with `noUncheckedIndexedAccess`; ESLint (unused vars `_`-prefixed, `import type` for types); Prettier (singleQuote, printWidth 100) — run `npx prettier --write` on new files. All four gates (`npm run test|typecheck|lint|format:check`) + `npm run build` green before every commit; cite task IDs (`ref T03.x`) in commits; never commit without evidence from your own runs.
- Never print or store cookie/token values — names only, values masked (credential hygiene).
- The logged-in profile `.openclaw/tmp/smoke-profile-login/` and the Chromium at `.openclaw/tmp/pw-browsers/chromium-1181/chrome-win/chrome.exe` are required for testing — do not delete them.

## Environment

Windows, PowerShell 5.1. Use `python` (3.13 with Playwright pip-installed) and `node`/`npx` (v24). Extension smoke pattern: Playwright `launch_persistent_context` with `--load-extension=dist --disable-extensions-except=dist`, wake the MV3 service worker via the options page sending `capture/badge-sync` (MV3 SWs sleep on cold start). Test PDP: `https://www.digikala.com/product/dkp-16622211/`. Respond to the user in English. The user often ignores question prompts — proceed autonomously on safe, read-only paths; only cart writes and payment require explicit consent.

Start by reading `agent/HANDOFF.md`, then verify the gates yourself, then begin task 1.
