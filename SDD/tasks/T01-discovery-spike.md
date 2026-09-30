# T01 — Discovery Spike

**Goal:** Convert the three load-bearing assumptions (fee visibility R-01, fee aggregation D-14, promo detectability D-08) into verified facts, and produce the go/no-go.
**Depends on:** nothing. **Feeds:** every other group; T03/T04 designs freeze on its output.
**Spec source:** `11-spike-plan.md` (full method details per task) — this file is the execution checklist.
**Estimate:** 2-3 ideal days. **Status:** in-progress (2026-09-30: spike-findings.md v1 committed from a live logged-in session - S-1 PASS/full optimizer, S-2 PASS, S-6 PASS at API level, S-7 PASS via JSON APIs; S-3/S-4 partial, S-5 untested, D-14 checkout arithmetic still needs one guided session. Verdict so far: go-with-changes.)

All work is manual browser inspection with devtools; no extension code is written in this group.

| ID | Task | Notes | Est |
|---|---|---|---|
| T01.1 | Fee visibility survey (S-1) | Product pages + cart preview, logged in/out; record every place a per-vendor fee appears; verdict: full / cart-preview-only / invisible | 0.5d |
| T01.2 | Variant-preserving navigation test (S-2) | Cart links → product pages; confirm variant preselected; measure fallback cost if not | 0.25d |
| T01.3 | Promo shape survey (S-3) | Find both count-promo types live; capture DOM + raw text; actively hunt for amount-threshold promos (OQ-01) | 0.5d |
| T01.4 | Plus applicability check (S-4) | Fee rendering with/without Plus across offer classes; answers OQ-10 | 0.25d |
| T01.5 | Large-item fee semantics (S-5) | Fee at quantity 1 vs 2+; Plus exemption; confirms D-13/OQ-04 | 0.25d |
| T01.6 | Fee aggregation test carts (S-6) | Same-vendor multi-item and multi-unit carts; read preview fee lines; **never complete a purchase** | 0.25d |
| T01.7 | Selector stability survey + fixture corpus (S-7) | DOM snapshots of 5–10 diverse product pages; judgment on semantic anchors; corpus saved for T03 fixtures | 0.5d |
| T01.8 | Write `spike-findings.md`; amend decision log + domain-model fact statuses; record go / go-with-changes / no-go | The spike's actual deliverable | 0.25d |

## Acceptance criteria

- Every S-task has evidence attached (snippets/screenshots/fixtures) and an explicit verdict.
- `00-decision-log.md` reflects any assumption that broke; `05-domain-model.md` statuses updated (◐/? → ✔ or corrected).
- The outcome is one of: **Go** (start T02), **Go with changes** (amendments enumerated and folded into T03/T04 scopes), **No-go** (failing fact named; fallback product shape sketched — e.g., estimate-mode advisory).

## Definition of done

T01.8 merged; outcome recorded in this file's status line; T03/T04 group files updated with any re-scoping notes from the findings.
