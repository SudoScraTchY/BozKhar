# Changelog

All notable changes to BozKhar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.8.0] - 2026-10-29

### Added

- The PDP now has a third Torob action, «بازه قیمت در ترب»: it compares all
  matching Torob listings in two categories — installment (TorobPay) and
  unfiltered — and shows a low/high range built from each listing's cheapest
  price. The high bound is the third-cheapest distinct price (second, then
  single). Delivery is explicitly excluded: it depends on city/address and is
  not in Torob's data, so the range is item-price only (D-48).

### Fixed

- The “چرا این فروشنده؟” trade-off sentence now states how much the unit is
  cheaper at the rejected seller (`plan price − seller price`) instead of
  quoting that seller's full price. “۵۶۹٬۰۰۰ تومان کمتر” next to a ۶۰۰٬۱۰۰
  plan read as a broken calculation; it now says ۳۱٬۱۰۰ تومان کمتر
  (2026-10-29 report).
- Both PDP actions ("Add to comparison" and the Torob trigger) now mount in
  one row under the product title instead of the buy box. On the live desktop
  PDP the buy box sits in a `sticky top-[180px]` wrapper that painted over
  anything inserted after it, and on mobile the only buy-box CTA is inside the
  fixed bottom bar, so the old stack was covered by Digikala's own controls.
  The actions are now normal-flow content above the fold, and the fixed
  bottom-left fallback pill was removed (D-47).

### Changed

- The landing page install ticket now follows the selected browser family:
  choosing Chromium shows the Chromium package, choosing Firefox shows the
  Firefox package, and the source tab shows the source card. All three use the
  same primary button style.
- Browser support copy now names the Chromium-based family (Chrome, Edge,
  Brave, Opera, Vivaldi, Yandex) and the Firefox-based family (Firefox 140+,
  Zen, Waterfox, Floorp), including the per-browser extensions page.

## [0.7.0] - 2026-10-23

### Added

- **Firefox 140+ desktop support** from the same TypeScript source and the same
  bundled artifact. `npm run build:firefox` derives `dist-firefox/` from the
  audited Chrome build, and `npm run audit:dist:firefox` proves the shared
  fields and every non-manifest byte match. CI packages and attests both zips;
  releases attach the versioned Firefox zip and an AMO source archive.
- Firefox AMO metadata: a permanent Gecko id, `strict_min_version` 140, and a
  `data_collection_permissions` declaration of `websiteContent` for the
  click-only Torob title lookup.

### Fixed

- Cart-crawl progress now reaches the cart overlay. `runtime.sendMessage`
  cannot deliver to content scripts, so the worker also sends each progress
  message to the initiating Digikala tab with `tabs.sendMessage`.
- A price refresh started from the results page now runs its delegated fetches
  in an open Digikala tab instead of the results tab itself.
- SPA route changes remount the in-page surfaces on Firefox through a 500 ms
  pathname poll, backing up the `history.pushState` patch (Firefox Xray can
  keep a content-script patch invisible to the page).

### Changed

- PDP capture delegates its product GET to the page's main world first (the
  session-bearing context in every browser) and falls back to the
  extension-origin fetch.
- The GitHub Pages install section now has separate Chrome and Firefox
  tickets, Firefox temporary-install steps, and the `npm run build:firefox`
  path in the source instructions. Page metadata and structured data list both
  browsers.
- Firefox event pages are kept alive during a crawl by a 10 s no-op message
  from the initiating page. Insights needs no keepalive: each request is a
  separate short message.

### Tests

- New keepalive, route-watch, background-routing and Firefox build/audit
  suites, plus crawl-keepalive, results-refresh, PDP-delegation and manifest
  source-shape cases. Full suite: 482 tests across 45 files.

## [0.6.2] - 2026-10-22

### Fixed

- Spend by category, vendor and brand is capped at each order's actual net
  paid amount. Item rows carry list prices, so an order-level coupon, refund
  or later price change could make a single 4,000,000-Toman product appear as
  18,200,000 Toman. Values are never scaled up, and cancelled orders still
  contribute nothing.
- A detail response can no longer overwrite a list status of `cancelled` or
  `returned`, so a deep scan cannot move a cancelled order back into spend.

### Tests

- 456 tests across 41 files, including an end-to-end page test with one
  4,000,000-Toman SSD at an 18,200,000 list price and five cancelled storage
  orders.

## [0.6.1] - 2026-10-20

### Added

- A small GitHub star icon in the toolbar popup, opening the BozKhar
  repository in a new tab.
- A quiet update pill in the popup footer. Opening the popup asks GitHub's
  public releases API for the latest tag; when it is newer than the running
  version, the pill links to the release page. There is no polling, no
  background timer, and no user data in the request.

### Changed

- The cancelled-order amount card uses an order's total when no payment was
  recorded, instead of summing zero for cancelled orders.

### Removed

- The cancelled-orders list section. Cancelled orders still stay out of every
  spend and item total and remain visible in the red status-chart bar; the
  list itself showed zero amounts for orders that were cancelled before
  payment.

### Security and privacy

- The manifest adds `https://api.github.com/*`, used only by the popup's
  release check (`credentials: 'omit'`, `no-referrer`, 8 s timeout). Only the
  latest tag name is read, and the download URL is built locally rather than
  taken from the response.

### Tests

- 453 tests across 41 files, plus typecheck, ESLint, Prettier, production
  build and the built-manifest audit.

## [0.6.0] - 2026-10-20

### Added

- **Order Insights** (`src/insights/`): an on-device summary of the user's own
  Digikala order history with a selectable date range, net paid, refunds,
  shipping, discounts, order-value distribution, monthly/cumulative spend,
  weekdays, status breakdown, median/p90 orders, repeat purchases, vendors,
  brands and categories.
- **Current deliveries** section, with in-progress orders counted in net paid
  by default and deep-scanned first.
- **Optional deep analysis** of order details (products, sellers, shipments,
  ratings) with progress, cancellation and a 300-order cap.
- **Share cards** for X/Instagram/other media: eight palettes, three layouts
  (cards, strip, editorial), bundled fonts, PNG download and caption/X intent.
- **Cancelled orders section**: a dedicated red-accented table with date, order
  reference, read item count and amount. Cancelled orders and cancelled item
  quantities stay out of every spend and item total.
- **Toolbar popup** with cached order totals, last-sync time and links to
  Insights, Results, Settings and the Digikala orders tab.
- **Orders-tab button** that opens the Insights page from `/profile/orders`.
- **Torob comparison** on product pages: a full-width action under the buy box
  opens the five cheapest Torob sellers for the current product, with shop,
  city, rating, shipping and a per-seller link.
- **PDP action stack**: the "Add to comparison" button and the Torob action
  now share a deliberate card below the buy row instead of being squeezed into
  it. The compare button is indigo with a balance-scales icon.

### Changed

- Deep analysis now reads the live `data.order` detail shape and covers every
  order status. In-progress orders are prioritised under the cap.
- The share card footer now reads «ساخته شده با افزونه بُزخَر», and the product
  name is consistently «بُزخَر».
- Charts are full-width (960×380), carry y-axis labels, and use line/area
  charts for cumulative spend and monthly averages.
- Status-breakdown bars are colour-coded: delivered teal, returned amber,
  in-progress blue, cancelled red.

### Fixed

- Deep scan failed because the live detail payload nests items at
  `data.order.order_items`; the reader now unwraps `data.order` with a flat
  fallback.
- The journal share card no longer overlaps its stats with the narrative
  column; long titles wrap to two lines.
- The PDP action button mounts on the current layout (`add-to-cart` anchor)
  and waits for the hydrated heading before choosing a Torob query, avoiding a
  stale-title mismatch.
- Torob matching rejects sibling models (X7/F8) and prefers the canonical
  listing over a one-seller colour variant.
- Torob seller rows are de-duplicated by offer and by shop + price.

### Security and privacy

- Everything except the Torob comparison stays local: no server, account,
  telemetry or analytics.
- The Torob comparison is triggered only by an explicit click. The worker
  sends the public product title to `api.torob.com` with
  `credentials: 'omit'` and `referrerPolicy: 'no-referrer'`, and accepts seller
  links only from `https://*.torob.com`.
- The manifest adds exactly one host permission for this feature:
  `https://api.torob.com/*`. Content scripts still run only on
  `https://*.digikala.com/*`.

### Tests

- 438 tests across 39 files, plus typecheck, ESLint, Prettier, production
  build and the built-manifest audit.

[0.7.0]: https://github.com/SudoScraTchY/BozKhar/releases/tag/v0.7.0
[0.6.2]: https://github.com/SudoScraTchY/BozKhar/releases/tag/v0.6.2
[0.6.1]: https://github.com/SudoScraTchY/BozKhar/releases/tag/v0.6.1
[0.6.0]: https://github.com/SudoScraTchY/BozKhar/releases/tag/v0.6.0
