/**
 * Solver contracts (T04) - plain data in, plain data out.
 *
 * The module is pure, browser-free and dependency-free (D-15, NFR-09): it runs
 * identically under Vitest and inside the extension, and it never reads a DOM,
 * a clock, a random source or a network.
 *
 * Money is integer Toman throughout (capture converts Rial -> Toman before the
 * solver ever sees a number), so the arithmetic is exact and "identical input
 * yields byte-identical output" (FR-11) is achievable rather than hopeful.
 */

/** Item identity is productId + variantId (D-05); the key is `${productId}::${variantId}`. */
export type ItemKey = string;

export type StockState = 'in-stock' | 'out-of-stock' | 'unknown';

/**
 * One vendor's terms for one item. `fee` is the *effective* per-shipment fee
 * the vendor will actually charge this user (spike finding: logged-in users get
 * shipping discounts, so the PDP list fee must never be used).
 *
 * `fee === null` means "unknown" - an explicit state, never a silent zero (SDD 08).
 */
export interface SolverOffer {
  vendorId: string;
  vendorName?: string;
  /** Unit price in Toman. */
  unitPrice: number;
  stock: StockState;
  /** D-13: large items ship as their own class with their own fee; Plus is exempt. */
  isLargeItem: boolean;
  /** Effective per-shipment delivery fee in Toman; null = unknown. */
  fee: number | null;
  /** D-12: whether a Plus subscription waives this vendor's fee for this offer. */
  plusCoversFee: boolean;
  /** ISO timestamp of the capture this offer came from (FR-04 staleness). */
  capturedAt?: string;
  /**
   * Passthrough identity (D-17): the variant this offer belongs
   * to. The solver's arithmetic never reads it; the results page
   * (T05) needs it to say WHICH variant the plan chose - a plan
   * that switches items silently would be unactionable.
   */
  variantId?: string;
}

export type LockMode = 'none' | 'pin' | 'ban';

export interface SolverLock {
  mode: LockMode;
  /** pin: the one pinned vendor. ban: the banned vendors (FR-06/FR-07). */
  vendorIds: string[];
}

export interface SolverItem {
  itemKey: ItemKey;
  title?: string;
  variantLabel?: string;
  quantity: number;
  offers: SolverOffer[];
  lock: SolverLock;
}

/**
 * Promos the solve can act on. Two shapes exist (D-08): a per-item unit count
 * and a vendor-wide item count. `amount-threshold` is deliberately absent - it
 * is unverified (OQ-01) and the fee model has no branch for it.
 */
export type SolverPromoType = 'same-item-count' | 'vendor-count';

export interface SolverPromo {
  promoId: string;
  vendorId: string;
  type: SolverPromoType;
  thresholdValue: number;
  effect: 'free-delivery';
  /** same-item-count: the item the "buy n of this item" promo is scoped to. */
  itemKey?: ItemKey;
  /** Raw page text, kept for audit (SDD 08). */
  rawText?: string;
}

export interface SolverSettings {
  hasPlus: boolean;
  /** D-10/FR-14: percent of the cart total bounding net-increase hints. */
  tolerancePercent: number;
}

export interface SolverInput {
  items: SolverItem[];
  promos: SolverPromo[];
  settings: SolverSettings;
  /**
   * Fee value used when *scoring* a shipment group whose fee is unknown. The
   * default is the largest known fee in the input, because quoting a total that
   * is silently too low is the failure mode SDD 08 forbids.
   */
  unknownFeeFallback?: number;
  /** Current-cart cost, for the savings comparison (FR-12). Null/absent = not known. */
  currentCartTotal?: number | null;
}

// ---- Output ----

/** Exactly one explanation per fee line (FR-12). */
export type FeeFlag =
  'regular' | 'plus-covered' | 'promo-waived' | 'large-item' | 'already-paid-by-lock';

/**
 * A shipment group is what the fee is actually charged against. The spike shows
 * Digikala splitting large & heavy goods into their own shipment class
 * (`ارسال کالاهای بزرگ و سنگین`) alongside the per-seller shipments, so the
 * fee-line unit is vendor x shipping class, not vendor alone.
 */
export type ShipmentClass = 'seller' | 'large-item';

export interface PlanLine {
  itemKey: ItemKey;
  title?: string;
  variantLabel?: string;
  unitPrice: number;
  quantity: number;
  /** unitPrice * quantity. */
  lineTotal: number;
  isLargeItem: boolean;
  /** Passthrough (D-17): the variant the chosen offer belongs to. */
  variantId?: string;
  capturedAt?: string;
}

export interface PlanGroup {
  vendorId: string;
  vendorName?: string;
  shipmentClass: ShipmentClass;
  lines: PlanLine[];
  /** Charged fee in Toman; 0 when waived, null when unknown and charged. */
  fee: number | null;
  feeFlag: FeeFlag;
  /** Promos that would have waived this fee (audit trail; empty when none). */
  promoIds: string[];
  /** Sum of line totals in this group. */
  subtotal: number;
}

export type UnsolvedReason =
  'no-available-vendor' | 'all-offers-out-of-stock' | 'pinned-vendor-unavailable';

export interface UnsolvedItem {
  itemKey: ItemKey;
  title?: string;
  reason: UnsolvedReason;
}

export interface Plan {
  /** D-15: `approximate` above the scale envelope, and labelled as such. */
  mode: 'exact' | 'approximate';
  assignments: PlanLine[];
  groups: PlanGroup[];
  itemSubtotal: number;
  deliverySubtotal: number;
  grandTotal: number;
  unsolved: UnsolvedItem[];
  /** True when any displayed charge rests on an unknown fee (label it estimate-only). */
  totalIsEstimate: boolean;
  /** Present when the total is an estimate: the honest range, low = unknown fees at 0. */
  estimateRange?: { low: number; high: number };
  comparison?: {
    currentCartTotal: number | null;
    /** currentCartTotal - grandTotal; null when the current cost is unknown. */
    savings: number | null;
  };
}

export interface Hint {
  kind: 'extra-unit';
  promoId: string;
  promoType: SolverPromoType;
  itemKey: ItemKey;
  vendorId: string;
  /** The one extra unit's price at the hint's vendor (D-09: one unit, never a new product). */
  extraUnitCost: number;
  /** The delivery fee this extra unit would remove. */
  feeRemoved: number;
  /** feeRemoved - extraUnitCost: positive is a saving for the user. */
  netEffect: number;
  /**
   * `saving` -> always shown. `within-tolerance` -> a net increase inside
   * tolerancePercent of the cart total (D-10). Rejected candidates are never
   * emitted, so no other value exists here.
   */
  verdict: 'saving' | 'within-tolerance';
  /** The absolute Toman bound the verdict was tested against. */
  toleranceBound: number;
}

export interface SolverResult {
  plan: Plan;
  hints: Hint[];
}
