# 10 — Risks and Open Questions

Two registers, kept separate on purpose: **risks** are things that can go wrong that we already see, each with a mitigation and an early-warning signal; **open questions** are things we genuinely don't know yet, each with a resolution path and — critically — a **default assumption** so that every downstream task can proceed today and only one thing changes if the answer arrives late.

## Risk register

| ID | Risk | Likelihood | Impact | Mitigation | Early warning |
|---|---|---|---|---|---|
| R-01 | **Delivery fee not visible before checkout** — the optimizer's core input may not be knowable where we capture | Medium | **Critical** | Spike S-1 is the gate (go/no-go); fee source is pluggable (05-domain-model.md): page-visible / cart-preview / user-entered-estimate modes | Spike finding itself; any "fee: null" in captures |
| R-02 | **Digikala DOM changes break extraction** | High (eventually) | High | Versioned selectors module as sole DOM touchpoint (NFR-05); fixture canary tests (T06); per-item error surfaces | Canary test failures on saved fixtures after a site update; user reports of failed captures |
| R-03 | **Promos not machine-detectable** from page structure | Medium | Medium | Manual promo entry as documented fallback; hints simply don't fire when promos are unknown (degrades gracefully — plans stay correct, just less clever) | Spike S-3; promo records with unstable raw text across captures |
| R-04 | **Rate limiting / account friction from the crawl** | Medium | Medium | User-initiated only, one sequential tab, ≥1.5s delays, closed scope (D-03, NFR-07) | Captcha/verification interstitials appearing during crawl; slowed page loads |
| R-05 | **ToS conflict with the extension model** | Low–Medium | High | Advise-only, no bulk scraping, no data egress, minimal permissions; the posture is documented and stated in the listing (D-01/D-02) | Any policy communication from Digikala; store review feedback |
| R-06 | **Stale prices make the plan wrong at checkout** | High | Medium | Timestamps on everything, staleness warnings, cheap re-capture (FR-04); NTH-11 auto re-verify as the promoted fix | User reports of totals not matching at checkout |
| R-07 | **Variant identity mismatch** — crawl opens the wrong variant or treats variants as one item | Medium | Medium | Identity = productId + variantId (D-05); spike S-2 verifies URL/state drives variant selection | Crawl captures whose offer count differs from the user's manual capture of the same item |
| R-08 | **MV3 service worker killed mid-crawl** | Medium | Low–Medium | Crawl state persisted per step; resume without duplication (06-architecture.md, FR-02) | Crawls that restart from item 1 after interruption (regression test T03) |
| R-09 | **Solver blow-up on giant carts** | Low | Low | Scale envelope 40 items / 15 vendors; labeled approximate fallback (D-15, OQ-09) | Perf test exceeding 1s at 30×10 (T04) |
| R-10 | **RTL/i18n layout defects** ship in the fa-primary UI | Medium | Low–Medium | fa tested first (NFR-08); RTL in the fixture storybook from T05 onward | Screenshots with clipped numerals or LTR-only tables |

The register's headline is honest and worth stating plainly: **the two risks that can kill the project are R-01 and R-02, and both are about data, not math.** Everything else is engineering containment around a sound core idea. That asymmetry is why Phase 1 is a spike and not a build.

## Open questions

| ID | Question | Why it matters | Resolution path | Default meanwhile |
|---|---|---|---|---|
| OQ-01 | Do amount-threshold promos ("free delivery over X") exist, and are they detectable? | A third fee-waiver rule would change capture and the solver's fee branch (NTH-08) | Spike S-3 | Treat as nonexistent; no code paths reserved beyond the enum value |
| OQ-02 | Is the delivery fee visible pre-checkout, and is it stable per vendor/composition? | The project's premise (R-01) | Spike S-1 | Assume visible on the offer surface; pluggable source as fallback |
| OQ-03 | Is a vendor's fee charged once per shipment regardless of item count and units? | The entire consolidation benefit (D-14) | Spike S-6 (small test carts, checkout preview, no purchase) | Assume yes |
| OQ-04 | Large-item fee: confirmed per shipment, and Plus truly exempt? | Fee-model branch (D-13) | Spike S-5 | Assume per-shipment, Plus-exempt (stakeholder belief) |
| OQ-05 | Chrome-only or Chrome + Firefox for release? | Packaging effort split | Evaluation task in T06 | Chrome MV3 first |
| OQ-06 | Include discount codes / campaign prices in MVP scope? | Scope creep vs missed savings | Deliberate deferral; revisit after spike evidence (NTH-04) | Excluded from MVP |
| OQ-07 | Offer equivalence: are warranty/rating differences acceptable to ignore? | Correctness of "same item" (F-11) | User feedback post-MVP; NTH-01 trigger | All in-stock offers interchangeable; locks are the escape hatch |
| OQ-08 | Default UI language and numeral style | Reach vs effort (NFR-08) | T05 user feedback | fa primary (RTL), en toggle |
| OQ-09 | Exact scale envelope before approximate mode? | Performance vs honesty (D-15) | Perf test in T04 | 40 items / 15 vendors |
| OQ-10 | Where exactly does Plus apply (all regular offers? some categories?) | Fee-model correctness for Plus users | Spike S-4 | Plus waives fees on regular offers, never on large items (D-12/D-13) |

Each default above is a **decision-log-ready assumption**: when its spike answer arrives, the matching entry in `00-decision-log.md` is amended and any affected task re-scoped — the spec is built so that late answers change one branch, not the design.
