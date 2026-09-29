# 01 — Product Definition

## The problem

Digikala is Iran's largest e-commerce marketplace, and like any marketplace it is really many shops behind one storefront. A single product — say a specific phone model in a specific color — is typically offered side by side by several third-party vendors, each with its own item price, its own delivery fee, and occasionally its own promotions. Some vendors run free-delivery promos such as "order 2 and delivery is free", either for two units of the same item or for a total item count from that vendor.

This structure creates a decision problem that humans solve badly. The intuitive strategy — open each product page, pick the vendor with the lowest item price, repeat — is actively misleading, because **delivery fees are charged per vendor shipment, not per item**. Buying five items each from their own cheapest vendor can activate five separate delivery fees and cost more in total than buying all five from a single, slightly pricier vendor. Add promos that zero out a fee once a count threshold is reached, a Plus subscription that waives fees on some offers, and large items with fixed fees Plus cannot touch, and the "obvious" per-item choice becomes hopeless to eyeball. The stakeholder's framing is exact: *same item, different shop; different shop, different price; different price, different delivery cost; some shops add a promo* — and the cheapest basket is only found by cross-referencing all of it at once.

## The solution

A browser extension that runs on digikala.com while the user shops, entirely locally, advise-only. It builds a **comparison list** of the products the user is considering, in two ways: an "Add to comparison" button on any product page (capturing every vendor offer for the selected variant), or a single button on the cart page that visits each cart item's product page, records its vendor offers, and closes it again. When the user asks for a plan, the extension solves for the cheapest vendor assignment — item prices **plus** delivery fees **minus** promo waivers, honoring the user's Plus status, large-item rules, and any vendor locks (pin or ban) — and presents it grouped by vendor with the total, the comparison against the current cart cost, and small money-saving hints (for example, "one more of item Y at 5 removes its 12 delivery fee").

The user then applies the plan themselves. Nothing is automated, nothing leaves the browser, and no page is ever touched without a click.

## Target users

- **The cost-conscious shopper** — buys multi-item baskets monthly, suspects they are overpaying on delivery, and wants a trustworthy second opinion before checkout.
- **The Plus subscriber** — wants to know when Plus changes the optimal split (and when, as with large items, it does not).
- **The bargain hunter** — compares vendors manually today and will appreciate locks ("I only trust vendor X for electronics") and hints that surface non-obvious savings.

## Goals

1. **Phase 1 — Discovery (current):** verify the domain assumptions the whole idea rests on (fee visibility, per-shipment semantics, promo detectability, crawl feasibility — see `11-spike-plan.md`), and fix the feature set and its potential.
2. **Phase 2 — MVP:** capture → solve → present, end to end, with locks, promos, Plus, large items, tolerance-gated hints.
3. **Phase 3 — Hardening & release:** resilience to site changes, packaging, store listing, manual E2E pass.

## Non-goals (all phases until explicitly revisited)

- **No cart mutation** — advise-only, forever unless `NTH-06` is deliberately approved (D-01).
- **No delivery-time optimization** — dropped by the stakeholder (D-07); revisit only if Digikala exposes reliable pre-checkout ETAs.
- **No background scraping or monitoring** — capture only on user action (D-03).
- **No discount-code or campaign-price logic in MVP** — unverified rules, deferred to `NTH-04` / `OQ-06`.
- **No accounts, no server, no telemetry** — nothing to leak, nothing to operate (D-02).
- **No price guarantee** — prices move; we surface capture timestamps and make re-verification cheap instead of promising freshness.

## Success signals

- On representative multi-vendor test carts (built during the spike), the computed plan is measurably cheaper than the per-item-cheapest baseline — target **≥ 5% total savings** on carts where vendor choice actually varies.
- Capture succeeds on ≥ 95% of product pages in the test corpus; failures degrade gracefully with a clear error, never a wrong plan.
- End-to-end time from "optimize" click to rendered plan under 10 seconds for a 10-item cart (crawl included).
- Zero outbound network requests to anything other than digikala.com itself.
- A reviewer reading `00-decision-log.md` plus the results page can reconstruct every number shown.

## Phase 1 scope statement

Phase 1 is **discovery, potential, and features** — not code. Its deliverables are: the spike findings that turn assumptions into facts (`11-spike-plan.md`), a validated feature inventory (`02` + `03`), a settled mathematical approach by name and suitability (`04`), and a task breakdown ready to execute (`tasks/`). Code begins at `T02` only after the spike's go/no-go.
