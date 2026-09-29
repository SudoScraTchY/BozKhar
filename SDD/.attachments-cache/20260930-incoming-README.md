# Digikala Cart Optimizer — Software Design Document (SDD)

**Status:** Draft v0.1 — pre-spike (Phase 1: Discovery)
**Date:** 2026-09-30
**Source:** brainstorm + clarification rounds with the stakeholder (captured in `00-decision-log.md`)

## What this is

This is the specification for a browser extension for digikala.com that finds the **cheapest way to buy a basket of items across the marketplace's multiple vendors**. Digikala is a vendor marketplace: the same product is typically offered by several sellers at different prices, each with its own delivery fee, and some sellers run free-delivery promos (for example "order 2 and delivery is free"). Picking the lowest item price one product at a time is therefore **not** optimal — the extension cross-references all items, all vendors, all delivery fees, and all promos together, then presents a cost-minimal split as **advice only**.

The document set is deliberately split across many files (stakeholder instruction: *never dump the entire SDD into a single file*). Each file has one job and can be reviewed, revised, and versioned independently.

## Ground rules from the brainstorm

These constrain every design decision that follows. Each is recorded with rationale in `00-decision-log.md`.

1. **Advise-only** — the extension shows a plan; it never modifies the user's cart (D-01).
2. **Local-only** — solving and storage happen in the user's browser; shopping data never leaves it (D-02).
3. **User-initiated capture only** — no background scraping or monitoring; data is captured when the user acts (D-03).
4. **Single objective: total cost** — delivery time is explicitly out of scope (D-07).
5. **No formulas in these documents** — mathematical challenges are identified by name with a suitability verdict; see `04-optimization-analysis.md` (stakeholder request).

## Document map

| File | Purpose | Primary audience |
|---|---|---|
| `00-decision-log.md` | Every decision taken during the brainstorm, with rationale and consequences | Everyone — read this first |
| `01-product-definition.md` | Problem statement, users, goals, non-goals, phase plan | Product reviewer |
| `02-requirements.md` | Functional and non-functional requirements with IDs and acceptance criteria | Product + engineering |
| `03-nice-to-haves.md` | The Nice-To-Haves discussion: what, why tempting, why not now, promotion trigger | Product reviewer |
| `04-optimization-analysis.md` | The mathematical challenges: problem names + suitability verdicts, no formulas | Engineering + curious product |
| `05-domain-model.md` | How Digikala actually works: vendors, offers, variants, delivery, Plus, promos — facts vs assumptions | Engineering |
| `06-architecture.md` | Extension components, data flow, permissions, crawl design | Engineering |
| `07-solver-behavior.md` | Behavioral spec of the optimizer: locks, promos, hints, tolerance, worked examples | Engineering |
| `08-data-model.md` | Entities, storage design, staleness policy, versioning | Engineering |
| `09-ui-spec.md` | UI surfaces (product page, cart page, results, options) and user flows | Engineering + design |
| `10-risks-open-questions.md` | Risk register and open questions with default assumptions | Everyone |
| `11-spike-plan.md` | Phase 1 discovery spike: what to verify, how, go/no-go criteria | Engineering |
| `tasks/` | Task board: `README.md` + one file per task group T01–T06 | Engineering |

## Reading order

- **Product reviewer:** `00` → `01` → `03` → `02` → `10`.
- **Engineer building it:** `00` → `05` → `11` → `06` → `07` → `08` → `02` → `09`, then pick a task from `tasks/`.
- **New contributor:** `README` (this file) → `00` → `tasks/README.md` → the task you were assigned.

## Task tracking

Tasks live in `tasks/` — one file per task group, never a single monolithic task list. Each task has a stable ID (for example `T04.3`), a goal, dependencies, acceptance criteria, and a definition of done. Status values: `todo`, `in-progress`, `blocked`, `done`. The board overview and dependency graph are in `tasks/README.md`.

## Conventions

- Requirement IDs: `FR-xx` (functional), `NFR-xx` (non-functional), `NTH-xx` (nice-to-have).
- Decisions: `D-xx`. Risks: `R-xx`. Open questions: `OQ-xx`. Spike tasks: `S-x`. Task groups: `T0x`.
- Prices in examples are in Toman unless stated otherwise; they are illustrative, not real Digikala prices.
- "Vendor" and "seller" are synonyms; "vendor" is used consistently.

## Changelog

| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-09-30 | Initial draft from brainstorm + clarification rounds. Pre-spike: assumptions flagged throughout. |
