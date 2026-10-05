/**
 * Cart -> comparison-list merge policy (SDD 09 Surface 2, T03.5).
 *
 * Decided behavior, load-bearing:
 * - Cart quantities WIN: where the cart and the existing list disagree on
 *   quantity, the cart's number is taken.
 * - Existing snapshots are HISTORY: appending a snapshot never rewrites or
 *   deletes older ones (SDD 08 history-first; NTH-02 reads them later).
 * - Existing items keep their identity fields (addedAt, lock,
 *   latestSnapshotId); only the quantity and display data may refresh.
 * - Cart lines without a variant id cannot be identified per D-05 and are
 *   SKIPPED explicitly (never silently merged into a guessed identity).
 */
import type { CartItemView } from './readers/cart';
import type { ComparisonItem, ItemId } from '../shared/types';

export interface MergeEntry {
  productId: string;
  variantId: string;
  title: string;
  quantity: number;
}

export interface CartMergeResult {
  /** Items to upsert into storage (existing ones keep identity fields). */
  items: ComparisonItem[];
  /** Cart lines skipped because no variant id was derivable (S-2). */
  skippedNoVariant: number;
}

/** Builds the merge input from the reader view (drops empty identities). */
export function cartViewsToEntries(views: CartItemView[]): MergeEntry[] {
  return views
    .filter((v) => v.productId && v.variantId)
    .map((v) => ({
      productId: v.productId,
      variantId: v.variantId as string,
      title: v.title,
      quantity: v.quantity,
    }));
}

/**
 * Pure merge: `existing` keyed by productId::variantId, cart entries applied
 * on top. New items get addedAt=now and a no-op lock; existing items keep
 * their lock/addedAt and take the cart quantity.
 */
export function mergeCartIntoItems(
  existing: ComparisonItem[],
  entries: MergeEntry[],
  now: () => Date = () => new Date(),
): CartMergeResult {
  const byKey = new Map<string, ComparisonItem>(
    existing.map((it) => [`${it.itemId.productId}::${it.itemId.variantId}`, it]),
  );
  let skippedNoVariant = 0;

  const merged = new Map<string, ComparisonItem>(byKey);
  for (const e of entries) {
    if (!e.productId || !e.variantId) {
      skippedNoVariant++;
      continue;
    }
    const key = `${e.productId}::${e.variantId}`;
    const prior = byKey.get(key);
    if (prior) {
      // Cart quantities win; identity fields survive.
      merged.set(key, {
        ...prior,
        quantity: e.quantity,
        product: { ...prior.product, title: e.title || prior.product.title },
      });
    } else {
      const itemId: ItemId = { productId: e.productId, variantId: e.variantId };
      merged.set(key, {
        itemId,
        product: { id: e.productId, title: e.title },
        variant: { id: e.variantId, label: '' },
        quantity: e.quantity,
        lock: { mode: 'none', vendorIds: [] },
        addedAt: now().toISOString(),
      });
    }
  }

  return {
    items: [...merged.values()],
    skippedNoVariant,
  };
}
