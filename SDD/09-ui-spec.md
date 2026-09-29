# 09 — UI Specification

Four surfaces, no more. Each is specified with its states and its user flow; all labels are suggestion-worded (advise-only tone, D-01) and all surfaces ship bilingual — Persian primary with full RTL mirroring, English secondary (NFR-08).

## Surface 1 — Product page: "Add to comparison"

**Placement:** adjacent to the seller/offer panel so it reads as part of the vendor list, not a floating widget. Label: «افزودن به مقایسه» / "Add to comparison".

**States and behavior:**
- *Idle → capturing → added:* a short capture pass over the visible offer list (sub-second), then a toast: "Captured N offers for [variant label]" — the variant is always named, reinforcing that identity is product + variant (D-05).
- *Already in list:* button shows «در مقایسه» / "In comparison" with the capture age; a second click re-captures (refreshes the snapshot).
- *Extraction failure:* inline error with the extractor version and a "try again" action — never a silent no-op (NFR-05).
- A toolbar badge shows the comparison-list size at all times.

**Flow:** the user browses normally; whenever a product is a real candidate, one click banks its full offer surface. The mental model being taught: *the extension remembers what you're considering, with every vendor's terms.*

## Surface 2 — Cart page: "Optimize this cart"

**Placement:** near the cart summary controls. Label: «بهینه‌سازی سبد خرید» / "Optimize this cart".

**Flow:** click → the crawl state machine starts (06-architecture.md): one reused tab walks each cart item's product page sequentially (variant respected, F-10), capturing offers; a progress overlay shows item i of N with per-item status (captured / failed / skipped); an abort control stops between pages. On completion the results page opens automatically. If some items failed, the results page opens anyway with the gaps honestly listed and retryable — partial truth beats no truth. If items already exist in the comparison list, quantities are taken from the cart where they differ, and older snapshots are kept as history.

**The two-surface story in one sentence:** Surface 1 is "capture while you browse"; Surface 2 is "I already filled my cart — figure it out." Both feed the same pipeline and the same results page.

## Surface 3 — Results page (the product's face)

An extension page, RTL-aware, structured top-to-bottom as: verdict → plan → controls → hints.

1. **Verdict cards:** current-cart total, optimized total, and savings — the three numbers everything else exists to justify. If any input fee is an estimate, a fourth card states the estimation caveat in plain words.
2. **The plan, grouped by vendor:** each vendor group lists its item lines (title, variant, quantity, unit price, line total) and exactly one fee line carrying its flag — *regular / Plus-covered / promo-waived / large item (Plus-exempt) / already paid by your lock*. Group subtotals; then item subtotal, delivery subtotal, grand total. Every displayed line must reconcile (FR-12). Each item row carries a lock control: vendor dropdown with *Any vendor / Pin to … / Ban …* (multi-ban) — the lock model of D-06 made visible.
3. **Controls cluster:** Plus toggle, tolerance slider (percent of cart total, live hint re-evaluation), staleness banner with re-capture buttons (per item / whole list), and an *approximate mode* notice when the scale envelope is exceeded.
4. **Hints:** cards that show the full arithmetic — "Add 1 more of [Y] at 5 → removes its 12 delivery fee → **you save 7**", or, for tolerance-gated ones, "→ costs 2 more, within your 2% tolerance". Rejected candidates (the Z case) are simply absent (D-10). Each hint ends with the phrase "up to you" in spirit: no apply buttons, no urgency patterns.
5. **How-to-apply panel:** short, honest instructions for doing it manually — which vendors to buy from, in what order, and the reminder that prices are as-of-capture (with timestamps). Advise-only, worded as help rather than as a limitation.

**Live re-solving:** any lock, quantity, Plus, or tolerance change re-solves immediately (debounced, target under 300ms, NFR-03) — the plan feels like a spreadsheet, not a report. This responsiveness is the everyday proof of the solver's purity (NFR-09) and the seed of NTH-05.

**Empty and error states:** empty list → a two-line explainer with links to the two capture flows; no offers anywhere for an item → flagged row, excluded from totals, last-known offers shown; whole plan impossible (all banned) → explicit message, plan hidden rather than faked.

## Surface 4 — Options page

Language (fa/en), tolerance default, crawl delay, staleness threshold; data management (export JSON / clear all, FR-16); a short privacy note stating the local-only posture in plain language; extractor version display for support conversations.

## Internationalization and accessibility notes

Persian is the default and the RTL layout is the *primary* layout, not a mirrored afterthought — tested in fa first, en second. Numerals follow the UI language. The plan table uses real table semantics with headers and captions; all controls are keyboard-reachable with visible focus; contrast meets WCAG AA; the verdict cards must remain readable at a glance (large numerals, clear labels) since they carry the product's entire value proposition.

## What the UI deliberately does not have

No countdown timers, no "deal ending" patterns, no auto-navigation to vendor pages, no apply/checkout buttons, no notifications outside the page. The advise-only decision (D-01) is enforced at the copywriting level as much as the code level: the strongest verb the UI ever uses is "consider".
