# Handoff — Digikala Cart Optimizer (post live-smoke, auth investigation)

**Date:** 2026-10-06 · **Prepared by:** AutoClaw session · **Workspace:** `M:/Agentic/Projects/Digikala-opt` (branch `main`, tree clean at `7a7481e`)

This handoff supersedes the 2026-10-05 handoff below (its T02/spike sections still hold). The 2026-09-30 handoff at the bottom remains accurate for T02/spike details.

## 1. One-paragraph state

T02 (foundation), T01 (discovery spike, GO), T04 (solver, `b9bbc19`), and T03 capture (core `490aacf`, surfaces `a57091b`, live-smoke hardening `f647270`, SPA resilience `e765a01` + `9d6a9a7`, cart anchor alignment `7a7481e`) are all **committed**. The suite is **137/137 tests across 17 files**, typecheck/lint/format/build all clean (verified 2026-10-06). Real-browser smoke Phase A passed 6/6 earlier (load-unpacked, SW wake, options page, PDP button mount, end-to-end PDP capture with toast + badge 0→1). Phase B (cart crawl on the real logged-in cart) got as far as: **button mounts on the live cart page, crawl starts, progress/toast UI works, SW performs the fetch** — but the cart API returns **HTTP 401** to our fetches while the site's own identical calls succeed. The final session narrowed this to **custom request headers the site attaches (`x-site`, `x-source`, `X-Web-Optimize-Response`)** and was interrupted by network timeouts before the replication experiment could complete. The user has chosen the fix path: **delegate capture fetches to the content script (same-origin `www.digikala.com` context) with the site's header set**. That work is NOT started. T03/T04 remain `in-progress` in the SDD — flipping to done requires human smoke + stakeholder confirmation.

## 2. Verified gate evidence (run 2026-10-06, this workspace)

```
npm run test          → 17 files, 137/137 passed
npm run typecheck     → clean (tsc --noEmit, strict)
npm run lint          → clean (eslint .)
npm run format:check  → clean (prettier --check .)
npm run build         → built in ~1.2s
```

Zero runtime dependencies preserved (`package.json` has no `dependencies` block — D-15/NFR-09, do not add any).

Commit chain (newest last): `34b1853` → `7d9c160` → `a211442` → `1bf8bd8` → `3cfdbf2` → `41195f2` → `8b71ee5` → `7fd1323` → `b911044` → `490aacf` (T03 core) → `b9bbc19` (T04 solver) → `a57091b` (T03 surfaces + SDD 06 amendment) → `f647270` (live-shape hardening) → `e765a01` (SPA resilience) → `9d6a9a7` (entry remount tests) → `7a7481e` (live cart anchors).

## 3. What this session proved on the real site (the load-bearing new knowledge)

All of the following was verified read-only against the real site with the user's logged-in session. **The cart was never modified** (before/after item-list diff equal; D-01 holds structurally — code contains no write calls).

### 3.1 Site/architecture facts

1. **The cart page data is server-rendered.** `GET https://www.digikala.com/cart/` returns the items embedded in the HTML (Next.js RSC/flight payload + DOM). On first load the SPA makes **zero** XHRs for cart data; `api.digikala.com` calls (`/v1/user/init/?skip_keys[]=cart`, `/checkout/v1/carts/mini`) fire only on SPA navigation (e.g. home → cart via client-side router click) — and even then only `carts/mini`, never the full `/checkout/v1/carts`.
2. **DOM extraction of the cart works.** Item cards link to `/product/dkp-<id>/...?variant_id=<vid>`; a simple query found 29 dkp links with variant ids from the real 8-item cart (extra links come from recommendation widgets — dedupe by scoping to the item-list container is needed; see §5). Product `16622211` (our fixture PDP) was in the cart with variant `62270876`.
3. **Product API needs no special treatment:** `GET api.digikala.com/product/v1/products/<id>/?variant_id=<vid>` returns **200** from the extension service worker, from extension pages, and from page context. Only the **checkout/cart API** 401s.
4. **The cart API 401s for us from everywhere tested** — SW fetch (`credentials: 'include'`), extension-page fetch, and plain page-context fetch from `www.digikala.com` — despite the profile holding valid auth cookies for the api host (names observed via forensics: `ACCESS_TOKEN`, `REFRESH_TOKEN_V2` host-only on `api.digikala.com`; a v2 user-token cookie on `.api.digikala.com`; all `SameSite=Lax`; **values were never read or stored**). CDP-observed statuses: `product: 200, cart: 401, cartMini: 401` from extension context; `product: 200, cartMini: 401, cart: 401` from page context.
5. **The site's own `carts/mini` GET succeeds (200, `is_logged_in: true`, `items_count: 8`)** from the very same page. CDP shows its request header set: `Accept, Referer, User-Agent, X-Web-Optimize-Response, sec-ch-ua*, x-site, x-source` — **no `Authorization` header**. (An OPTIONS preflight for it was also observed.) Playwright's sanitized header view shows `cookie-count: 0` for everything, so cookie presence could not be compared directly; but a plain page fetch (same cookie jar) 401s while the site's fetch 200s, so **the difference is almost certainly the custom headers `x-site` / `x-source` / `X-Web-Optimize-Response` (anti-bot/routing markers set by the site's JS), not cookies or bearer tokens**. Keycloak artifacts (`kc-callback-*` localStorage keys) exist but appear unrelated to the API auth path.
6. **Live cart page DOM anchors (commit `7a7481e`):** there is no stable test-id; the checkout CTA (ثبت سفارش) lives inside an absolutely positioned summary card. Working candidates now in `src/capture/dom/selectors.ts`: `div.bg-neutral-000.rounded.shadow-3-bottom` (summary card) and `a[href*="/checkout"][class*="w-full"]` (CTA fallback). PDP anchor `data-testid="sellers-cta"` already verified live in Phase A.
7. **Live payload shapes already handled** (from `f647270`): product payload `data.product.variants[]` with `{id, status:'marketable', seller{id,title}, price{selling_price, is_locked_for_digiplus}, shipment_methods: OBJECT{providers:[{type:'seller', price{value,is_free}}]}, digiplus{services[]}}` — no `in_stock` key; provider `type:'seller'` discriminator; stock from `status:'marketable'`. The **live full-cart payload shape was never captured** (401 blocked it) — `readCartPayload` is still fixture-derived; its assumptions (`data.cart_item` vs `data.items`) remain unverified against the real endpoint.
8. **Site network can rate-limit/timeout.** At the end of the session `www.digikala.com` started returning `ERR_TIMED_OUT`/`ERR_CONNECTION_CLOSED`/`ERR_ABORTED` from the Playwright Chromium for several minutes (the built-in browser also failed once). Back off (minutes, not seconds) and retry; do not hammer.

### 3.2 Session/login facts

- The user logged into Digikala **inside the Playwright Chromium profile** `.openclaw/tmp/smoke-profile-login` (persistent context). The session survived browser restarts (verified by cookie forensics + `is_logged_in: true`). **Do not delete this profile directory** — it holds the only working login outside the user's real browser.
- The user's real system Chrome (`C:\Users\SaintScraTchY\AppData\Local\Google\Chrome\User Data`, profile "Person 1") is logged in too but cannot be used: branded Chrome ignores `--load-extension` (Chrome 137+), and it runs without a debug port.
- The AutoClaw **built-in browser is also logged in** (its www session works; a direct `api.digikala.com` tab there shows 401 because the API host scopes auth differently) but cannot load unpacked extensions, so it is useful only for observation, not extension smokes.
- Cookie forensics scripts list names/domains only (never values) — keep it that way (credential hygiene).

## 4. What T03 currently delivers (committed)

- `src/capture/dom/selectors.ts` — mount-point candidates only (PDP seller panel, cart summary card), page-type guards, variant-from-URL fallback. `SELECTORS_VERSION 0.3.0-t03`.
- `src/capture/content/` — `pdp.ts` (Add-to-comparison button + toast, bounded anchor re-poll because the SPA hydrates the buy-box ~6s after `document_idle`), `cart.ts` (Optimize-cart button + progress overlay + abort, late anchor poll), `ui.ts` (states idle/capturing/added/failed, toast/progress CSS, `dkopt-*` class names), `index.ts` (entry: route tracking via `history.pushState/replaceState` + `popstate` with surface destroy/remount; Digikala link clicks are full navigations — the history patch only guards true SPA route changes).
- `src/capture/cart-merge.ts` — `mergeCartIntoItems(existing, entries, now)`: cart quantities win, identity preserved, no-variant entries skipped+counted.
- `src/capture/fetch/digikala-fetch.ts` — SW fetch with the user's session, D-02 scope guard, arrow-wrapped `globalThis.fetch` (bare reference throws "Illegal invocation").
- `src/capture/sw-controller.ts` — `handleCapturePdp(deps, productId, variantId)` (empty variantId → resolve first in-stock variant from product payload), `handleCrawlStart/handleCrawlAbort` (abort latch: `crawlRunning=true` set at start, reset in `finally`; requested abort honored, never leaks; completed crawl re-opens fresh on new start — append-only snapshots make reruns duplicate-free), `syncBadge`. Crawl state persisted to `chrome.storage.local` under `CRAWL_STATE_KEY='crawlState'`; all deps injectable.
- `src/background/service-worker.ts` — message router for `capture/pdp`, `capture/crawl-start`, `capture/crawl-abort`, `capture/badge-sync`; broadcasts `capture/progress` to all surfaces.
- `src/capture/messaging.ts` — typed `CaptureRequest`/`CaptureResponse` + `isCaptureRequest` guard.
- Tests: `tests/capture-readers-live-shape.test.ts` (live API shapes), `tests/capture-entry.test.ts` (SPA remount), plus earlier reader/crawl/merge suites incl. the D-01 GET-only audit.
- SDD `06-architecture.md` amended (payload readers = primary extractor per spike S-7; DOM scoped to mount points/fallback; capture fetch lives in the SW). `SDD/tasks/T03-capture.md` rows T03.4/T03.5/T03.7 updated.

### T04 solver invariants (do not silently change)

Entry `solve(input: SolverInput) → { plan, hints }` in `src/shared/solver/index.ts` (pure, browserless; `API.md` there). Fee table is **input-only** (`buildFeeTable`: vendor+class fee = max over that vendor's in-stock offers; naive "first non-null" rule makes totals assignment-dependent and enumeration silently suboptimal — caught by seeded property test, seed 1000). Two scoring views must coexist (`scoringTotal`/`scoreOnly` vs final `buildPlan` re-flagging pinned vendor fee as `already-paid-by-lock`). Tolerance bound is `floor(cartTotal × tolerancePercent / 100)` (not round). Flag precedence `promo-waived` > `plus-covered` > `already-paid-by-lock` > `regular`; large-item class never Plus/promo-waived. Shipment group = vendor × class. Promo counts in units. Hints: exactly-one-unit-short only, candidate already in list, net saving → `saving`, net increase → `within-tolerance` only within bound. Promo repair accepts only strictly-improving minimal move-sets.

## 5. Immediate next work (ordered)

1. **Finish the auth investigation (user-approved path: content-script delegation + site headers).** Concretely:
   - Replicate the site's successful call from a `www.digikala.com` page: `fetch('https://api.digikala.com/checkout/v1/carts', {method:'GET', credentials:'include', headers:{Accept:'application/json', 'x-site': <site's value>, 'x-source': <site's value>, 'X-Web-Optimize-Response': <site's value>}})`. Capture the site's exact header VALUES first via CDP (`Network.requestWillBeSent`) — `x-site`/`x-source` are believed to be app-routing markers (e.g. `"web"`), not secrets, but **verify before hardcoding; if anything looks like a real token, mask it and rethink**. The last attempt at this experiment died in network timeouts (script ready at `.openclaw/tmp/auth_recon11.py`).
   - If headers alone flip 401→200 from page context: implement **fetch delegation** — content script (page origin) performs the GET on behalf of the SW; SW keeps orchestration/state. Add the same headers. Keep D-02 scope guard and GET-only audit. Consider fetching the cart through the **content script on the cart page itself** (it is open when the user clicks Optimize anyway), which also matches "same-origin call" semantics.
   - If headers alone do NOT fix it, fall back to **cart-from-DOM extraction** on the cart page (proven feasible, §3.1.2): scope to the item-list container, dedupe dkp links, take `variant_id` from hrefs; items without a variant id in the URL need resolution via the product API (200, works). This is a larger reader change and needs an SDD 06 amendment in the same commit.
   - Either way: capture the **real full-cart payload** once a 200 is achievable and align `readCartPayload` (currently fixture-derived: `data.cart_item` vs `data.items` unknown); add a live-shape fixture.
2. **Re-run Phase B end-to-end** with the fixed fetch: `.openclaw/tmp/phase_b_crawl.py` (7 checks: sw-warm, cart-before, button-mounted, crawl-finished, badge, snapshots-in-IndexedDB, cart-unchanged). It opens its own browser with the extension + logged-in profile. Expect the crawl to hit the **8 real cart items** — sequential GETs, 1.5s delay, bounded retries; watch for the site's rate limiting (§3.1.8) and consider raising `crawlDelayMs` for the smoke if 429s/timeouts appear.
3. **Verify cart-page surface live** (done once Phase B passes): button mounts (already proven), progress overlay counts items, abort works, toast lists results, badge updates, IndexedDB snapshots append.
4. **Then:** human smoke + stakeholder confirmation → flip T03 (and T04, which needs the same human step) to done in the SDD task board. After that: T05 UI (results page) and T06 hardening per `SDD/tasks/`.
5. **Housekeeping:** `.openclaw/tmp/` holds this session's smoke/recon scripts (git-ignored): `smoke_phase_a.py`, `phase_b_login.py` (obsolete), `phase_b_window.py`, `phase_b_crawl.py`, `phase_b_diagnose.py`, `phase_b_cors_probe.py`, `auth_recon*.py` (v1–v11; **v11 is the unfinished experiment**), `auth_matrix*.py`, `cookie_forensics.py`, `token_source_probe.py`, `check_login_state.py`, `api_calls_probe*.py`, `probe_*.py`, `smoke_spa*.py`, `smoke-profile-login/` (the logged-in profile — **keep**), `pw-browsers/chromium-1181/` (the usable Chromium — **keep**). Safe to delete the finished probes once their lessons are recorded here.

## 6. Binding constraints (unchanged)

- **Advise-only (D-01):** no cart write calls anywhere, ever; GET-only; D-01 audit tests must keep passing. **Ask before touching the cart; never enter payment; restore cart state after testing** (this session's Phase B was run with zero cart modification — keep that bar).
- **Local-only (D-02):** fetch guarded to `*.digikala.com`.
- **Permissions exactly** `storage` + `tabs` + `https://*.digikala.com/*` (NFR-06; `tests/manifest.test.ts` enforces).
- Zero runtime dependencies (D-15/NFR-09). Solver stays pure/browserless. Never import from `tests/` in runtime code; `tests/setup.ts` installs fake-indexeddb globally.
- TS strict with `noUncheckedIndexedAccess`; ESLint (unused vars `_`-prefixed, `import type`); Prettier (singleQuote, printWidth 100, trailingComma all) — `npx prettier --write` new files before `format:check`.
- All four gates green + build before every commit; cite task IDs (`ref T03.x`) in commits; SDD amendments ride in the same commit as the deviation. **Never commit without evidence from your own runs.**
- T03/T04 must NOT be flipped to done without human smoke + stakeholder confirmation.

## 7. Environment

- win32, PowerShell 5.1; invoke `python` (3.13, Playwright pip-installed), `node`/`npx` (v24). `npx tsc` / `npm run test|typecheck|lint|format:check|build`.
- **Usable Chromium:** `M:\Agentic\Projects\Digikala-opt\.openclaw\tmp\pw-browsers\chromium-1181\chrome-win\chrome.exe` (installed via `npx playwright@1.54.1 install chromium` with `PLAYWRIGHT_BROWSERS_PATH` set to that tmp dir). Branded system Chrome ignores `--load-extension`.
- **Extension smoke pattern:** `launch_persistent_context(user_data_dir=smoke-profile-login, executable_path=<chromium>, headless=False, args=[--load-extension=dist, --disable-extensions-except=dist, --no-first-run])`; wake the MV3 SW via the options page (`chrome-extension://opbdobecgmknfnnhkbedfkjaehebcdoe/src/options/index.html`) sending `capture/badge-sync`; then navigate.
- Test PDP: `https://www.digikala.com/product/dkp-16622211/` (product 16622211; live first in-stock variant 58880138, fee 2,500,000 Rial, price 3,390,000 Rial; fixture variants 62270876-79).
- Fixture file ids: `cart-basic.json` 3 items (16622211 no variant id, 17773333, 18884444); `product-basic.json` product 16622211 variants 62270876/877/878/879.
- Git: `safe.directory` exception already set for this repo.
- User communication: respond in **English** (the user's latest explicit request is fully-English output). The user often does not answer `ask_user_question` prompts — proceed autonomously on safe/read-only paths, but **cart writes still require explicit consent**, and they DO respond in chat when they choose to (e.g. "i have logged it, continue").
- Runtime date at handoff time: 2026-10-06.

---

# Superseded handoff (2026-10-05) — T02/spike sections still accurate

**Date:** 2026-10-05 (evening update) · T04 committed (`b9bbc19`); T03 capture core committed (`490aacf`); surfaces + smoke were then outstanding (now done, see top).

## What T02 delivered (keep intact)

- **Manifest** `src/manifest.ts`: MV3, permissions EXACTLY `storage` + `tabs` + `https://*.digikala.com/*` (enforced by `tests/manifest.test.ts`). Deliberately **no `default_locale`** — declaring it without a `_locales/` bundle makes Chrome reject the whole extension at load (smoke-caught bug; comment in file explains).
- **Storage** `src/shared/storage/db.ts`: typed IndexedDB wrapper, factory-injected (fake-indexeddb in tests only). Stores: `items` (keyPath `itemKey` = `productId::variantId`), `snapshots` (append-only via `add()`, latest-per-item via `byItem` index, tie-break on snapshotId), `promos`. Forward-only `runMigrations`; `clearAllStores` = FR-16 privacy gate. Facade: `src/shared/storage/index.ts`.
- **Settings** `src/shared/settings/settings.ts`: typed `chrome.storage.local` accessor — `hasPlus=false`, `tolerancePercent=2`, `uiLanguage='fa'`, `crawlDelayMs=1500`, `stalenessWarnHours=24`; per-field coercion; change subscription.
- **i18n** `src/shared/i18n/messages.ts`: fa (RTL primary) + en; advise-only wording. (The 2026-10-06 session added surface keys + a `formatMessage()` helper.)
- **Options page v0** `src/options/`: bilingual, RTL/LTR, export JSON, confirmed clear-all, privacy note, extractor version display.
- **Export** `src/shared/export/export.ts`: versioned lossless envelope.
- **Tooling**: TS strict, Vite + @crxjs 2.7.1, ESLint 9 flat, Prettier, Vitest (node env). Scripts: `build`/`dev`/`test`/`typecheck`/`lint`/`format:check`.

## Spike findings that bind T03/T04 (details + numbers in `SDD/spike-findings.md` v2)

1. **Capture via JSON APIs, not DOM.** Product: `GET api.digikala.com/product/v1/products/<id>/?variant_id=<vid>`. Cart: `GET /checkout/v1/carts` (+ `/carts/mini`). DOM is fallback — implemented as a **payload readers module** (SDD 06 amended at `a57091b`).
2. **Fee location:** per-offer fee at `variants[].shipment_methods.providers[].price.{value,is_free}` (Rial). Cart payload repeats the per-seller fee line on each item of that seller. Some sellers have `providers: []` or no `price` key = FBM via Digikala = fee unknown.
3. **D-14 CONFIRMED:** one fee per vendor shipment regardless of units. Checkout tracking payload exposes canonical `shipments[]` with `shippingCost` + `shippingProducts[]`.
4. **Large items** ship as their own class (`ارسال کالاهای بزرگ و سنگین`), separate fee (observed 359,000 Toman), time-slot-gated. Plus interaction untested.
5. **Use EFFECTIVE fees:** logged-in users get large shipping discounts (observed list 319,000 → effective 168,000).
6. **Variant identity by URL:** cart item URLs embed `?variant_id=`; PDP API honors it — crawl deep-links, no in-page variant selection. (Live PDPs browsed without `?variant_id=` are handled by SW-side first-in-stock resolution.)
7. **Promos:** per-seller Plus entitlements machine-readable (`digiplus.services[]`, `services_summary`, `price.is_locked_for_digiplus`, cart price `is_digiplus_promotion`). Count-promo shapes and amount-threshold promos open (S-3 residual, OQ-01).
8. **Open non-blockers:** Plus A/B (account is non-Plus), Plus × large-item fee, count-promo payload shapes.

## Etiquette for live testing

The user's Digikala account is logged into the AutoClaw built-in browser (non-Plus) and now also into the Playwright profile (§3.2). **Never enter payment**; restore cart state after tests; **ask before touching the cart**.
