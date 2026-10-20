# Changelog

All notable changes to BozKhar are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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

[0.6.0]: https://github.com/SudoScraTchY/BozKhar/releases/tag/v0.6.0
