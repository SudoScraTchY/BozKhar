# Solver API (T04) — one page

Pure, dependency-free, browser-free (D-15, NFR-09). Money is **integer Toman**; capture converts Rial → Toman before the solver sees a number.

```ts
import { solve } from 'src/shared/solver';

const { plan, hints } = solve(input);
```

## Input (`SolverInput`)

- `items: SolverItem[]` — per item: `itemKey` (`productId::variantId`, D-05), `quantity`, `offers` (vendor, integer unit price, stock, `isLargeItem`, effective `fee` in Toman or `null` = unknown, `plusCoversFee`), `lock` (`none` / `pin` / `ban` + vendor ids).
- `promos: SolverPromo[]` — `same-item-count` (scoped to one item) or `vendor-count`; threshold in **units**; effect `free-delivery`. Amount-threshold promos are unverified and have no code path (OQ-01).
- `settings` — `hasPlus`, `tolerancePercent`.
- `unknownFeeFallback?` — scoring/display value for unknown fees (default 0; capture passes the largest known fee so estimates err high, never silently low).
- `currentCartTotal?` — enables the savings comparison (FR-12).

## Output (`SolverResult`)

- `plan` — `mode` (`exact`/`approximate`, D-15), per-item `assignments`, vendor groups with **one fee line each carrying exactly one flag** (`regular` / `plus-covered` / `promo-waived` / `large-item` / `already-paid-by-lock`), subtotals, grand total, `unsolved` items with reasons, `totalIsEstimate` + `estimateRange` when unknown fees ride along, optional `comparison.savings`.
- `hints` — extra-unit hints only (D-09/D-11): `extraUnitCost`, `feeRemoved`, `netEffect`, verdict `saving` (always shown) or `within-tolerance` (net increase ≤ tolerance bound). Rejected candidates are absent (D-10).

## Guarantees tested in T04

1. All SDD 07 worked examples (`fee-coupling` 117 vs naive 130; `xyz-gating` all three sub-cases; `lock-ride-along` 113 beats 115).
2. Plan total ≤ per-item-cheapest baseline and ≤ any supplied alternative assignment.
3. Byte-identical output for identical input (FR-11).
4. Every fee line carries exactly one flag; displayed lines reconcile to the grand total (FR-12).
5. 30 items × 10 vendors < 1 s; envelope switch at 40/15 (OQ-09).

## Implementation notes (spec gaps resolved here, mirrored in SDD 07)

- **Flag precedence** when several could apply: `promo-waived` > `plus-covered` > `already-paid-by-lock` > `regular`. Large-item groups are *never* Plus-covered or promo-waived (D-13).
- **Shipment group unit** = vendor × shipping class (`seller` / `large-item`), matching the spike's observed `shipments[]` structure (S-6).
- **Unknown fees** are charged at the fallback for scoring, flagged estimate-only, with a low..high range (low = unknown fees at 0).
- **Promo counts are in units** (the hint layer adds exactly one unit, D-10/D-11).
- **Net-zero hints** (`feeRemoved == extraUnitCost`) count as `within-tolerance` (an increase of 0 is within any tolerance ≥ 0).
- **Tolerance bound** = `floor(cartTotal × tolerancePercent / 100)` in integer Toman — floor pins the SDD's 150-cart pair (2% → 3 shown, 1% → 1.5 → hidden).
