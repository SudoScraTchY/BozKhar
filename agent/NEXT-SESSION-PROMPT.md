# Starter prompt — paste into a new AutoClaw chat in project 「Digikala-opt」

Copy everything below the line into the new instance's first message.

---

Read 'agent/HANDOFF.md' first (the 2026-10-05 section at the top is current; the 2026-09-30 section at the bottom is superseded but its T02/spike details still hold), then the SDD: 'SDD/README.md', 'SDD/06-architecture.md', 'SDD/08-data-model.md', 'SDD/tasks/T03-capture.md'.

State: T04 (solver) is DONE and committed (b9bbc19). T03 capture core is DONE and committed (490aacf): payload readers (product/cart/url per spike S-7), normalizer (Rial->Toman, fee provenance), crawl state machine + orchestrator with etiquette tests. Full suite 97/97 green; tree clean; zero runtime dependencies. Do not redesign what exists; the module contracts are in the handoff.

Remaining work is T03 surfaces (t03-surfaces), then the T03 commit (t03-commit), then smoke:

1. **t03-surfaces:** 'src/capture/dom/selectors.ts' (mount points only), 'src/capture/content/' (Add-to-comparison button on PDP: idle/capturing/added states, toast with offer count + variant label, toolbar badge; Optimize-cart button on cart page), 'src/capture/cart-merge.ts' (cart quantities win, existing snapshots kept as history), 'src/capture/fetch/digikala-fetch.ts' (service-worker fetch with user session, avoids content-script CORS), crawl messaging (start/abort/progress) in 'src/background/service-worker.ts', onProduct -> normalize -> storage facade (db.addSnapshot, append-only). Content-script tests with DOM fakes are enough - no real browser in unit tests.
2. **t03-commit:** all four gates + build green; amend 'SDD/06-architecture.md' in the SAME commit (payload readers module replaces the selectors module as primary extractor per spike S-7; DOM scoped to mount points/fallback; capture fetch in service worker); update T03-capture.md rows T03.4/T03.5/T03.7 with evidence; commit citing 'ref T03.x'. Do NOT flip T03 to done.
3. **smoke:** ask me before any live cart touch (never enter payment; restore cart state after). Human load-unpacked smoke via the Playwright Chromium + my confirmation before either task flips to done.

Hard constraints: advise-only (no cart write calls ever, D-01), local-only (D-02), permissions exactly storage+tabs+https://*.digikala.com/* (NFR-06, tests/manifest.test.ts fails otherwise), zero runtime deps (D-15/NFR-09), TS strict/ESLint/Prettier per repo config (run npx prettier --write on new files), all gates green before each commit, cite task IDs in commits, SDD amendments ride in the same commit as the deviation.

Update the checklist as you go and report gate evidence with each commit.
