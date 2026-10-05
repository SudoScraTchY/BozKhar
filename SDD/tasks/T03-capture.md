# T03 — Capture Pipeline

**Goal:** Reliable offer capture through both entry points — product-page "Add to comparison" and cart-page crawl — normalized into canonical entities, with per-item failure containment.
**Depends on:** T02; spike findings (T01) for fee location (S-1), variant navigation (S-2), promo markers (S-3), and the fixture corpus (S-7).
**Spec sources:** FR-01–FR-04, FR-10, NFR-02/05/07, `05-domain-model.md`, `06-architecture.md`, `08-data-model.md`.
**Estimate:** 4–5 ideal days. **Status:** in-progress (capture core implemented + tested 2026-10-05; **design deviation per spike S-7: payload readers replace the DOM selectors module** - the `06-architecture.md` amendment rides with the surfaces commit).

| ID | Task | Notes | Est |
|---|---|---|---|
| T03.1 | ~~Selectors module v1~~ -> **Payload readers v1 (spike S-7 deviation)** | `src/capture/readers/{product,cart,url}.ts`: JSON API payload readers + URL builders with the `*.digikala.com` scope guard; versioned via `src/capture/version.ts` (0.3.0-t03); typed error classes in `errors.ts`; DOM demoted to mount-points/fallback (T03.4) | 1d |
| T03.2 | ~~Product-page extractor~~ -> **Product payload reader + fixtures** | `readProductPayload` validates documented spike shapes only; fixture tests (`tests/capture-readers.test.ts`): seller fee, known-free, FBM-unknown (providers:[]), out-of-stock, large-item class (S-5), Plus entitlements (S-3), malformed -> STRUCTURE_UNRECOGNIZED | 1d |
| T03.3 | Normalizer | **done** -  → Offer / DeliveryInfo / Promo entities per `08`; fee provenance marker set by source (page-visible / cart-preview / user-entered); promo raw text preserved | 0.5d |
| T03.4 | "Add to comparison" button | Injection near the seller panel; idle/capturing/added states; toast with offer count incl. variant label; toolbar badge count; re-capture refreshes snapshot (FR-01) | 0.5d |
| T03.5 | Cart-page extractor | Reads cart items + quantities + variants into the comparison list (merge policy: cart quantities win; existing snapshots kept as history) | 0.5d |
| T03.6 | Crawl orchestrator | **core done** -  `06`: one reused tab, sequential navigation, `crawlDelayMs` between pages, closed scope (target list fixed at start, checked before each navigation), state persisted after every step for resume; progress + abort surfaced to the results page | 1d |
| T03.7 | Staleness stamps + per-item failure surfaces | Every snapshot carries `capturedAt` + `extractorVersion`; failed items recorded with error class and retryable; partial results never block the flow (FR-02/FR-04) | 0.5d |

**Evidence (own runs, 2026-10-05):** readers 19/19, crawl 12/12; full suite 97/97 across 10 files; typecheck/lint/format/build clean; zero runtime dependencies intact. Etiquette asserted with injected fakes: sequential cart->items, delay (1500ms default) before each step, closed scope (out-of-scope URL refused before fetch), state persisted per step, resume skips done items without re-fetch, completed crawl refuses restart (no duplicate snapshots), bounded per-item retry (2 attempts) with containment, abort honored between pages, D-01 audit (fetch trace contains only GET-shaped api.digikala.com endpoints).

## Acceptance criteria

- Fixture suite: every S-7 corpus page extracts to identical normalized output across runs; both promo shapes (S-3 findings) produce Promo records with type, threshold, effect, raw text.
- Live smoke: a real cart of 5 items crawls end-to-end (visible progress, per-item status), producing 5 snapshots or explicit per-item failures — zero silent gaps.
- Interruption test: closing the crawl tab or restarting the browser mid-crawl, then re-running, resumes without duplicate snapshots (R-08).
- Etiquette audit: sequential navigation only, delay respected, no page visited outside the fixed target list; zero network requests to any non-Digikala origin (NFR-02).
- A page with a deliberately broken selector yields a visible per-item error with extractor version — never a wrong-but-plausible capture (NFR-05).

## Definition of done

All above verified; selectors module documented (one page: what it reads, version, how to bump); `06`/`08` updated for any deviation; S-7 fixtures committed under a fixtures directory for T06's canary tests.
