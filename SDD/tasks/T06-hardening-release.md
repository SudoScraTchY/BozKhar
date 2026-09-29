# T06 — Hardening & Release

**Goal:** Turn a working MVP into something that survives Digikala changing and ships to the Chrome Web Store: extractor canaries, packaging, privacy note, live E2E pass, and the Firefox decision.
**Depends on:** T05. **Spec sources:** NFR-04/05/06, R-02/R-04/R-05, OQ-05, `01-product-definition.md` success signals.
**Estimate:** 3 ideal days. **Status:** todo.

| ID | Task | Notes | Est |
|---|---|---|---|
| T06.1 | Selector canary tests | Nightly-style (or pre-release) run of the T03 fixture suite; a fixture that fails after a site change must produce a loud, actionable report ("vendor offer row selector broken since extractor vX") | 0.5d |
| T06.2 | Extractor versioning process | One-pager: bump procedure, fixture refresh steps, user-facing error text templates; shipped `extractorVersion` visible in options for support conversations | 0.25d |
| T06.3 | Live-site manual E2E checklist | Scripted pass on digikala.com: multi-vendor cart crawl, plan verification by hand (fees, promos, Plus on/off, large item, one lock, one hint), staleness re-capture; no purchase completed at any point | 1d |
| T06.4 | Privacy note + permission audit | Final audit: manifest contains exactly the agreed permissions; zero non-Digikala network calls in a session log; plain-language privacy note (local-only, advise-only) ready for the listing and options page | 0.25d |
| T06.5 | Packaging + store listing | Zip build; listing drafts in fa and en: one-line pitch, the example-1 story from `07` as the explainer, screenshots (T05's set), the advise-only statement; version 0.1.0 | 0.5d |
| T06.6 | Firefox evaluation decision | Load the build under a WebExtension compatibility check; write the go/later verdict with the concrete deltas found (OQ-05); amend `00-decision-log.md` either way | 0.5d |

## Acceptance criteria

- Canary suite runs against the committed fixture corpus and fails loudly on an intentionally broken selector (verified by sabotage test).
- The E2E checklist executes fully on the live site with zero failed captures (or every failure honestly surfaced and retryable), and hand-verified plan math on at least one multi-vendor cart with a promo.
- Session network log shows no request to any origin besides digikala.com.
- Store listing package complete in both languages; version tagged; Firefox verdict recorded with evidence.

## Definition of done

v0.1.0 tag; release notes quoting the success signals of `01-product-definition.md` with measured values where available (capture success rate, end-to-end time, savings on the E2E carts); remaining OQs re-triaged into either the spike-followup list or specific NTH triggers.
