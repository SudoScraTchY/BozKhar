# T03 — Capture Pipeline

**Goal:** Reliable offer capture through both entry points — product-page "Add to comparison" and cart-page crawl — normalized into canonical entities, with per-item failure containment.
**Depends on:** T02; spike findings (T01) for fee location (S-1), variant navigation (S-2), promo markers (S-3), and the fixture corpus (S-7).
**Spec sources:** FR-01–FR-04, FR-10, NFR-02/05/07, `05-domain-model.md`, `06-architecture.md`, `08-data-model.md`.
**Estimate:** 4–5 ideal days. **Status:** todo.

| ID | Task | Notes | Est |
|---|---|---|---|
| T03.1 | Selectors module v1 | The sole DOM touchpoint; versioned; built directly on the spike's S-7 fixture corpus; each selector named by purpose (offer row, price node, fee node, promo badge, stock state, variant anchor) | 1d |
| T03.2 | Product-page extractor + fixtures | Parses a fixture page into raw extraction records; fixture tests assert stable output; extraction failures carry error classes (no fee found / no offers / structure unrecognized) | 1d |
| T03.3 | Normalizer | Raw records → Offer / DeliveryInfo / Promo entities per `08`; fee provenance marker set by source (page-visible / cart-preview / user-entered); promo raw text preserved | 0.5d |
| T03.4 | "Add to comparison" button | Injection near the seller panel; idle/capturing/added states; toast with offer count incl. variant label; toolbar badge count; re-capture refreshes snapshot (FR-01) | 0.5d |
| T03.5 | Cart-page extractor | Reads cart items + quantities + variants into the comparison list (merge policy: cart quantities win; existing snapshots kept as history) | 0.5d |
| T03.6 | Crawl orchestrator | Service-worker state machine per `06`: one reused tab, sequential navigation, `crawlDelayMs` between pages, closed scope (target list fixed at start, checked before each navigation), state persisted after every step for resume; progress + abort surfaced to the results page | 1d |
| T03.7 | Staleness stamps + per-item failure surfaces | Every snapshot carries `capturedAt` + `extractorVersion`; failed items recorded with error class and retryable; partial results never block the flow (FR-02/FR-04) | 0.5d |

## Acceptance criteria

- Fixture suite: every S-7 corpus page extracts to identical normalized output across runs; both promo shapes (S-3 findings) produce Promo records with type, threshold, effect, raw text.
- Live smoke: a real cart of 5 items crawls end-to-end (visible progress, per-item status), producing 5 snapshots or explicit per-item failures — zero silent gaps.
- Interruption test: closing the crawl tab or restarting the browser mid-crawl, then re-running, resumes without duplicate snapshots (R-08).
- Etiquette audit: sequential navigation only, delay respected, no page visited outside the fixed target list; zero network requests to any non-Digikala origin (NFR-02).
- A page with a deliberately broken selector yields a visible per-item error with extractor version — never a wrong-but-plausible capture (NFR-05).

## Definition of done

All above verified; selectors module documented (one page: what it reads, version, how to bump); `06`/`08` updated for any deviation; S-7 fixtures committed under a fixtures directory for T06's canary tests.
