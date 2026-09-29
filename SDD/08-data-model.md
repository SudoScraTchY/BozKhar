# 08 — Data Model

Entities below are described by field and purpose, not TypeScript types — the types are an implementation detail of T02. One design principle runs through everything: **history-first storage**. We keep every snapshot rather than overwriting the latest, because it costs nothing today and makes price history (NTH-02) a read-only feature later instead of a migration.

## Entities

### ComparisonItem
The user's basket-as-seen-by-the-extension. Fields: `itemId` (productId + variantId, per D-05); product reference (id, title, slug/URL, image); variant reference (id, label); `quantity`; `lock` (mode: none / pin / ban-list, plus the vendor ids); `addedAt`; and the id of its latest snapshot. Removing an item from the list never deletes its snapshots — history survives list churn.

### Offer
One vendor's terms for one item, as of one capture. Fields: vendor id and name; price; stock state; `isLargeItem` flag; delivery info; ids of promos attached; optional vendor rating (reserved for NTH-01); `capturedAt`; `extractorVersion`; `sourceUrl`. The fee may be `unknown` — an explicit state, never a silent zero (see F-4 risk handling).

### DeliveryInfo
Fee amount plus a provenance marker: where the fee value came from (page-visible, cart-preview, or user-entered estimate) and whether Plus applies to it. Large-item offers carry the fixed per-shipment fee and a Plus-exempt marker (D-13).

### Promo
Fields: vendor id; type (`same-item-count` / `vendor-count` / — reserved — `amount-threshold` per OQ-01); threshold value; effect (free delivery); `detectedAt`; the raw text as seen on the page (audit trail for when detection rules need tuning). Promos are stored per vendor, referenced by offers, and re-validated on every capture.

### Plan (solver output — not persisted beyond the session)
Fields: assignments (per item: vendor, unit price, quantity, line total); vendor groups (per vendor: item lines, one fee with its single explanation flag — regular / plus-covered / promo-waived / large-item / already-paid-by-lock); item subtotal; delivery subtotal; grand total; current-cart comparison and savings; per-item price timestamps; an `exact` vs `approximate` label (scale envelope, D-15). Plans are recomputed on demand; only the *inputs* are durable.

### Hint
Fields: kind (extra-unit); item and vendor; extra-unit cost; fee removed; net effect; verdict (saving / within-tolerance / rejected — rejected hints are simply not emitted, but the evaluation is logged in tests). The results UI renders the arithmetic in full so the user can audit it (FR-13).

### Settings
Fields: `hasPlus` (D-12); `tolerancePercent` (D-10, FR-14); `uiLanguage` (fa default / en, NFR-08); `crawlDelayMs` (NFR-07); `stalenessWarnHours` (FR-04). Stored in `chrome.storage.local`.

### CrawlState
The service worker's persisted cursor (06-architecture.md): target item list (fixed at start), current index, per-item status (pending / captured / failed + error class), startedAt, abort flag. Living in storage is what makes the crawl resumable across MV3 service-worker restarts (R-08).

## Storage mapping

| Store | Contents | Notes |
|---|---|---|
| IndexedDB — `items` | ComparisonItem records | Key: productId + variantId |
| IndexedDB — `snapshots` | Immutable capture records (offers + delivery info + promo refs + timestamps) | Append-only; queries take "latest per item" |
| IndexedDB — `promos` | Promo records per vendor | Re-validated on capture |
| `chrome.storage.local` — settings, CrawlState | Small, sync-free state | Schema-versioned |

**Why this split:** snapshots are append-only and potentially numerous — IndexedDB's territory; settings and crawl state are tiny and hot — storage.local's. Nothing is stored remotely; the export function (FR-16) serializes items + latest snapshots + settings to a JSON file the user owns.

## Staleness policy

Every offer carries `capturedAt`; the plan view shows per-item "prices as of …" and flags anything older than `stalenessWarnHours` (default 24). Re-capture (per item or whole list) updates only targeted items. Plans are never presented without their timestamps — a plan with unlabeled stale prices is treated in review as a bug, not a UX choice.

## Identity, versioning, migration

Item identity is productId + variantId, full stop — titles and slugs are display data, never keys (F-10's URL instability is exactly why). Every snapshot records its `extractorVersion` so a capture regression is diagnosable from data alone ("every offer captured after version 2.3 has a null fee" is the kind of query the data must answer). A schema version field gates forward-only migrations; export-before-migrate is offered automatically on major version bumps.

## Privacy review of the schema itself

The stored data is a shopping list: product/variant ids, prices, vendor ids, timestamps, and settings. No account identifiers, no credentials, no personal data beyond what the user chose to compare. The clear-all function (FR-16) deletes every store and resets settings — verified by a test that asserts empty storage after the call.
