# Digikala Cart Optimizer

An advise-only browser extension that finds the **cheapest way to buy a
basket of items across Digikala's marketplace vendors** - item prices +
per-vendor delivery fees - promotions, Plus benefits, and your own vendor
locks considered together. It never touches your cart: it shows a plan,
you apply it yourself.

- Spec: [`SDD/`](SDD/README.md) (start with [`00-decision-log.md`](SDD/00-decision-log.md))
- Status: **T02 Foundation implemented** (scaffold + storage + settings + i18n + options page). Discovery spike (T01) is still open - see [`SDD/11-spike-plan.md`](SDD/11-spike-plan.md).

## Development quickstart (clone to loaded extension in <10 minutes)

Prerequisites: **Node.js >= 20** and npm. Chrome or any Chromium browser.

```bash
# 1. install toolchain (devDependencies only - no runtime deps)
npm install

# 2. build the extension into dist/
npm run build        # or: npm run dev  (watch mode)

# 3. load it in Chrome: chrome://extensions -> enable "Developer mode"
#    -> "Load unpacked" -> select the dist/ folder of this repo

# 4. open the options page (right-click the extension icon -> Options)
#    - it opens in Persian (RTL) by default; switch to English in one click
#    - toggle Plus, move the tolerance slider, change the crawl delay
#    - "Export data" downloads a JSON file; "Clear all data" wipes storage
```

Useful scripts:

| Command | What it does |
|---|---|
| `npm run build` | Production build into `dist/` |
| `npm run dev` | Watch-mode build |
| `npm test` | Unit tests (Vitest, node environment, fake-indexeddb) |
| `npm run typecheck` | `tsc --noEmit` (strict) |
| `npm run lint` | ESLint (typescript-eslint flat config) |
| `npm run format:check` | Prettier check |

## Manual smoke checklist (load-unpacked)

1. `dist/` loads with no errors on `chrome://extensions`.
2. Options page opens; Persian text renders right-to-left.
3. Switching to English flips the layout to left-to-right.
4. Toggling Plus / changing tolerance survives a page reload.
5. "Clear all data" (after confirming) empties stored data; export before it downloads a valid JSON file.
6. The service worker shows no errors in the extension's `Inspect views`.

All of the above is additionally covered by a scripted CDP smoke
(`.openclaw/tmp/smoke2.mjs`, development-time only) that exercises the
loaded extension: 12/12 checks passed on the current build.

## Layout

```
src/
  manifest.ts             # MV3 manifest source (permissions: storage, tabs, *.digikala.com)
  background/             # service worker placeholder (crawl state machine arrives in T03)
  options/                # options page v0 (bilingual, RTL-first)
  shared/
    types.ts              # canonical entities (SDD 08-data-model)
    storage/              # typed IndexedDB wrapper: items / snapshots (append-only) / promos
    settings/             # chrome.storage.local typed settings + change subscription
    i18n/                 # fa (RTL, primary) + en catalogs
    export/               # FR-16 JSON export payload
tests/                    # Vitest suites (26 tests) incl. manifest permission audit
SDD/                      # the software design document set (spec source of truth)
```

## Ground rules (from the SDD - binding for every contribution)

1. **Advise-only** - no code path may modify the user's Digikala cart.
2. **Local-only** - no servers, no telemetry, no remote code; everything
   stays in the browser.
3. **User-initiated capture only** - no background scraping (capture ships in T03).
4. **Minimal permissions** - exactly `storage`, `tabs`, `*.digikala.com`;
   anything more requires a decision-log entry first.