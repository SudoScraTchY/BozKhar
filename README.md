# بز خر — Boz Khar

**بزخر** (boz khar — literally "goat donkey") is Persian slang for someone who
hunts bargains relentlessly: a person who buys things **very cheap**. That is
exactly what this tool does for you on [Digikala](https://www.digikala.com).

**Boz Khar** is an advise-only Chrome extension (MV3) that finds the
**cheapest way to buy your Digikala cart across marketplace vendors** — item
prices **and** per-vendor delivery fees together, with promotions, Digikala
Plus benefits, large-item fees, and your own vendor locks (pin/ban) factored
in. It never touches your cart: it shows you a plan, you apply it yourself.

```
سبد خریدت را ارزان‌تر بخر — buy the same cart, pay less.
```

- Spec (SDD): [`SDD/`](SDD/README.md) — start with [`00-decision-log.md`](SDD/00-decision-log.md)
- Status: T03 capture + T04 solver implemented; live-smoke in progress (see [`agent/HANDOFF.md`](agent/HANDOFF.md))
- License: TBD (all rights reserved by the repository owner until decided)

## Why "بز خر"?

Because the point is haggling *by computation*. Digikala is a marketplace:
the same product is sold by many sellers, each with its own price and its own
shipping fee. Digikala's default cart flow picks one seller per item — it
never optimizes **across** items. But vendors often offer free shipping above
item-count thresholds, Digikala Plus waives regular-shipment fees, and large
items always cost a separate fixed fee. Splitting one basket across the right
vendor set can save real money; doing it wrong (too many vendors, one unit
short of a promo threshold) can *cost* money. Boz Khar does that arithmetic
exactly, so you can buy like a proper بزخر.

## What it does

Two surfaces, both user-triggered:

1. **Product page — "Add to comparison" (افزودن به مقایسه).** Captures every
   vendor offer for the current variant: vendor identity, price, stock,
   delivery-fee signal, promos.
2. **Cart page — "Optimize this cart" (بهینه‌سازی سبد خرید).** Resolves your
   actual cart items (product + the exact variant in your cart), captures
   their offers with polite sequential fetches, then computes the plan.

Everything is captured from Digikala's own JSON payloads (read-only GETs with
your existing session), normalized into a local model, and stored **only in
your browser** (IndexedDB). No server. No account. No telemetry.

## Use cases we accounted for

These map to the requirements in [`SDD/02-requirements.md`](SDD/02-requirements.md) (FR-01…FR-16):

- **The multi-seller basket (the core case).** Your cart has items from
  several sellers; you want the vendor assignment with the minimum grand
  total (item prices + exactly one shipping fee per used vendor). The solver
  enumerates vendor sets exactly at supported scale (40 items × 15 vendors)
  and falls back to a labeled approximate mode above that envelope. (FR-11)
- **Free-shipping count promos — both shapes.** "Buy 2 of *this item* → free
  delivery" (same-item count) and "buy *z* items *from this vendor* → free
  delivery" (vendor-wide count). The plan charges fees only where genuinely
  owed, and the repair pass can move items onto a vendor to legitimately
  cross a vendor-wide threshold when that strictly lowers the total. (FR-10)
- **"One unit short of free shipping" hints.** After solving, Boz Khar
  evaluates adding **one unit of an item already in your list** to cross a
  promo threshold. A hint is shown only if the extra unit cost still yields a
  net saving (or a net increase inside your tolerance — see below). A hint
  that increases the total beyond tolerance is rejected outright. (FR-13)
- **Tolerance knob.** A percentage of the cart total (default 2%) bounds
  which net-increase hints are even worth showing. It is a first-class
  setting, not a hidden constant. (FR-14)
- **Digikala Plus members.** A toggle declares Plus status; regular-shipment
  fees are then modeled as Plus-waived (fee = 0), large-item fees are never
  Plus-covered. Non-members see the plain fee model. (FR-08)
- **Large/heavy items (کالاهای بزرگ و سنگین).** These always ship as their own
  shipment class with their own fixed fee (observed ~359,000 Toman on real
  carts), time-slot-gated on Digikala. The plan groups them separately and
  never pretends Plus or count-promos waive them. (FR-09)
- **You already bought from one vendor and want to ride along.** Pin an item
  to a vendor: that assignment is frozen and the vendor's fee counts as
  already paid — other items can "ride along" on that shipment for free.
  Ban a vendor you distrust: it never receives that item. (FR-06, FR-07)
- **Stale prices are dangerous, so staleness is visible.** Every snapshot
  carries a timestamp; plans display the age of the prices behind them and
  warn past a configurable threshold (default 24h), with one-click
  re-capture per item or for the whole list. (FR-04)
- **Multi-variant products.** Cart identity is product **+ variant** (e.g. a
  supplement in the 60-count pack, not the 30-count). Capture deep-links the
  exact variant; snapshots are keyed `productId::variantId`. (FR-03)
- **Advise-only, always.** There is **no code path that writes to your
  cart** — no add, no remove, no quantity change, no checkout. The plan is
  presented; applying it is 100% your click. Enforced by a GET-only audit
  test in the suite. (FR-15, NFR-02)
- **Privacy: your shopping list stays in your browser.** Local-only storage,
  zero non-Digikala network requests (verified by a network-log test), no
  telemetry, no remote code. Export your list as JSON or wipe all stored
  data from the options page at any time. (NFR-01, FR-16)
- **Polite crawling.** Sequential item fetches with a configurable delay
  (default 1.5s), bounded retries, abort button mid-crawl, user-initiated
  only — no scheduled or background visits, ever. (NFR-07, NFR-02)
- **Persian-first, bilingual.** UI is Persian (RTL) by default with English
  available; both are first-class, not an afterthought. (NFR-08)
- **Small and auditable.** Zero runtime dependencies, minimal permissions
  (`storage`, `tabs`, `https://*.digikala.com/*` only), and the whole engine
  (solver + capture pipeline) is pure, typed TypeScript under test
  (137 tests at the time of writing). (NFR-06, NFR-09, D-15)

### A worked example (from the test fixtures)

Cart of 3 items from the same vendor, item sum 113,000 Toman, vendor fee
13,000 (free above a 3-item count promo): the naive plan "buy from the
cheapest single-vendor set" pays 126,000. Boz Khar's exact solver notices the
promo makes the vendor-set total lower than any per-item reasoning — and its
hint engine tells you when adding one more unit of an in-list item crosses a
threshold for a net saving, but stays silent when the "saving" actually
costs more than the fee removed. Every arithmetic case like this is a
committed fixture in `tests/fixtures/solver/`.

## What it deliberately does NOT do

- No background fetching, scheduling, or auto-refresh (NFR-02).
- No cart writes, no auto-checkout, no payment interaction (FR-15).
- No data collection or sharing — there is no server to collect it (D-04).
- No support for sites other than digikala.com (scope guard in code).

## Development

Prerequisites: **Node.js >= 20** and npm; any Chromium browser for loading.

```bash
npm install          # devDependencies only — zero runtime deps
npm run build        # bundle to dist/
npm run test         # vitest suite
npm run typecheck    # tsc --noEmit (strict)
npm run lint         # eslint
npm run format:check # prettier
```

Load into Chrome: `chrome://extensions` → enable **Developer mode** →
**Load unpacked** → select `dist/`. Then open any Digikala product page or
your cart page and use the buttons described above. The options page has the
Plus toggle, tolerance, crawl delay, UI language, export, and clear-all.

Architecture notes live in [`SDD/06-architecture.md`](SDD/06-architecture.md);
the solver contract is documented in [`src/shared/solver/API.md`](src/shared/solver/API.md).
Current engineering state, verified smoke evidence, and the next work items
are in [`agent/HANDOFF.md`](agent/HANDOFF.md).

## Etiquette & fairness

Boz Khar reads only pages/APIs you are already browsing, at human-ish pace,
only when you click. It adds no load beyond a careful user's own browsing.
Please keep the crawl delay at its default or higher; this tool is meant to
be a good citizen of Digikala, not a scraper.

---

*بزخر means buying very cheap. This tool is the honest version of that: same
cart, fewer rials, zero dark patterns.*
