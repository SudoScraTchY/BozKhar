/**
 * Canonical entities, transcribed from SDD 08-data-model.md.
 * Field-level wording there is the spec; these types are the T02 implementation.
 */

/** D-05: item identity is productId + variantId, never title or slug. */
export interface ItemId {
  productId: string;
  variantId: string;
}

export type LockMode = 'none' | 'pin' | 'ban';

export interface Lock {
  mode: LockMode;
  /** pin: the vendor the item is pinned to. ban: banned vendor ids. */
  vendorIds: string[];
}

export interface ComparisonItem {
  itemId: ItemId;
  product: {
    id: string;
    title: string;
    slug?: string;
    image?: string;
  };
  variant: {
    id: string;
    label: string;
  };
  quantity: number;
  lock: Lock;
  addedAt: string; // ISO timestamp
  latestSnapshotId?: string;
}

/**
 * Where a delivery-fee value came from. SDD 08: the fee may be unknown -
 * an explicit state, never a silent zero.
 */
export type FeeProvenance = 'page-visible' | 'cart-preview' | 'user-estimate';

export interface DeliveryInfo {
  /** Fee amount in Toman; null means "unknown" and must render as a gap. */
  feeAmount: number | null;
  provenance: FeeProvenance;
  plusApplies: boolean;
}

export type PromoType = 'same-item-count' | 'vendor-count' | 'amount-threshold';

export interface Promo {
  promoId: string;
  vendorId: string;
  type: PromoType;
  thresholdValue: number;
  /** D-08: MVP only knows effect=free-delivery; the field is kept explicit. */
  effect: 'free-delivery';
  detectedAt: string; // ISO timestamp
  /** Raw text as seen on the page - the audit trail. */
  rawText: string;
}

export interface Offer {
  vendor: {
    id: string;
    name: string;
    rating?: number; // reserved for NTH-01
  };
  price: number;
  stockState: 'in-stock' | 'out-of-stock' | 'unknown';
  isLargeItem: boolean;
  delivery: DeliveryInfo;
  promoIds: string[];
  capturedAt: string; // ISO timestamp
  extractorVersion: string;
  sourceUrl: string;
}

/**
 * Immutable capture record (history-first, NTH-02). Snapshots are
 * append-only: storing never overwrites, queries read "latest per item".
 */
export interface Snapshot {
  snapshotId: string;
  itemId: ItemId;
  offers: Offer[];
  promos: Promo[];
  capturedAt: string; // ISO timestamp
  extractorVersion: string;
}

// ---- Shipment quote (D-19): real per-package shipping costs ----

/**
 * One delivery package as quoted by POST /v4/shipment/ at crawl
 * time. Packages group by vendor: every item in a package ships
 * together under one fee (the seller's real package price, which
 * the product API's per-offer fee only approximates - and sometimes
 * omits entirely).
 */
export interface ShipmentPackage {
  shipmentId: string;
  /** The real package fee in Toman, as the user would be charged. */
  shippingCost: number;
  items: { productId: string; variantId: string }[];
}

/**
 * Cart-level record of the shipment quote captured with the crawl.
 * Keyed 'latest' (one row): the quote describes the whole cart at
 * capture time, and a new crawl re-quotes it.
 */
export interface ShipmentRecord {
  key: 'latest';
  capturedAt: string; // ISO timestamp
  packages: ShipmentPackage[];
}

// ---- Settings (chrome.storage.local), SDD 08 + FR-14 + NFR-07 ----

export type UiLanguage = 'fa' | 'en';

export interface Settings {
  /** D-12: Plus status is user input, never detected. */
  hasPlus: boolean;
  /** D-10/FR-14: hint tolerance as percent of cart total. */
  tolerancePercent: number;
  /** NFR-08: fa is the default and the primary (RTL) layout. */
  uiLanguage: UiLanguage;
  /** NFR-07: sequential crawl delay between pages. */
  crawlDelayMs: number;
  /** FR-04: staleness warning threshold. */
  stalenessWarnHours: number;
}

export const DEFAULT_SETTINGS: Settings = {
  hasPlus: false,
  tolerancePercent: 2,
  uiLanguage: 'fa',
  crawlDelayMs: 1500,
  stalenessWarnHours: 24,
};

/**
 * Schema version of the whole storage layer (IndexedDB stores +
 * settings shape). Bump on any breaking change; migrations are
 * forward-only (SDD 08 "Identity, versioning, migration").
 */
export const SCHEMA_VERSION = 1;
