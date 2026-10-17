/**
 * Apply-to-cart pipeline (D-26, brief §5).
 *
 * All cart mutation sits behind `CartApplier` so the transport
 * (internal API today, UI automation tomorrow — open decision 10.3)
 * can change without touching the flow:
 *
 *   preflight  re-fetch every chosen offer (price, stock, seller
 *              still offers it) — never continue silently on a change;
 *   confirm    the sheet states what moves; the current cart is
 *              snapshotted BEFORE any mutation;
 *   apply      per changed line, sequentially: add the new variant
 *              (with its quantity), VERIFY it is in the cart with the
 *              planned seller and quantity, only then remove the old
 *              row. Unchanged lines and locked items are left alone;
 *   undo       restores the snapshot with the same progress UI.
 *
 * The flow never navigates, never checks out, never pays.
 *
 * Review fixes (round 2):
 *  - the snapshot is taken at the START OF EVERY apply (it used to be
 *    kept from the very first apply, so undo restored a stale cart);
 *    a retry after a partial failure passes keepSnapshot so the
 *    original cart is not overwritten by the half-applied one;
 *  - quantity is carried over (addVariant had no quantity, so a
 *    2-unit row silently became 1 unit);
 *  - the added row's seller must equal the planned vendor, otherwise
 *    the add is rolled back and the line fails (the site may add its
 *    default seller for a variant);
 *  - undo only removes rows that belong to products in the snapshot,
 *    so items the user added to the cart afterwards are never touched;
 *  - preflight reports progress, mutations keep a polite gap, and
 *    failures carry a reason.
 */
import type { Plan, PlanGroup, PlanLine } from '../shared/solver';

/** One line of the live cart. */
export interface CartLine {
  cartItemId: string;
  productId: string;
  variantId: string;
  sellerId: string;
  sellerName: string;
  quantity: number;
}

/** A live offer as re-fetched during preflight. */
export interface LiveOffer {
  vendorId: string;
  /** Toman. */
  price: number;
  stockState: 'in-stock' | 'out-of-stock' | 'unknown';
}

/**
 * The transport behind the flow. `addVariant` adds by variant id.
 * `quantity` is optional: a transport that ignores it adds 1, and the
 * pipeline tops the row up by verifying the cart after the add.
 */
export interface CartTransport {
  fetchCart(): Promise<CartLine[]>;
  /** Null when the vendor no longer offers the variant. */
  fetchOffer(productId: string, variantId: string, vendorId: string): Promise<LiveOffer | null>;
  addVariant(variantId: string, quantity?: number): Promise<void>;
  removeCartItem(cartItemId: string): Promise<void>;
}

export type PreflightResult =
  | { status: 'ok' }
  | {
      status: 'price-changed';
      newTotal: number;
      delta: number;
      changedCount: number;
    }
  | { status: 'out-of-stock'; titles: string[] };

export type LineStatus = 'pending' | 'adding' | 'added' | 'unchanged' | 'manual' | 'failed';

export interface ApplyProgress {
  itemKey: string;
  title?: string;
  status: LineStatus;
}

export interface ApplyResult {
  ok: boolean;
  applied: string[];
  failed: string[];
  /** Why each failed line failed (itemKey → message). */
  errors?: Record<string, string>;
}

export interface ApplyOptions {
  /** Keep the existing snapshot (a retry after a partial failure). */
  keepSnapshot?: boolean;
}

export interface CartApplier {
  preflight(
    plan: Plan,
    onProgress?: (done: number, total: number) => void,
  ): Promise<PreflightResult>;
  apply(
    plan: Plan,
    onProgress: (p: ApplyProgress) => void,
    options?: ApplyOptions,
  ): Promise<ApplyResult>;
  undo(onProgress: (p: ApplyProgress) => void): Promise<ApplyResult>;
}

/** The pre-apply snapshot, persisted by the page (D-26). */
export interface CartSnapshot {
  key: 'latest';
  lines: CartLine[];
  savedAt: string;
}

/** Gap between cart mutations (be polite to the site). */
const POLITE_GAP_MS = 150;
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** 401/403 from the gateway: the user is signed out, not out of stock. */
function isAuthError(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  return status === 401 || status === 403;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** productId from an item key (productId::variantId). */
function productIdOf(itemKey: string): string {
  const sep = itemKey.lastIndexOf('::');
  return sep === -1 ? itemKey : itemKey.slice(0, sep);
}

/** Every plan line with its owning group's vendor. */
function* planEntries(plan: Plan): Generator<{
  group: PlanGroup;
  line: PlanLine;
}> {
  for (const group of plan.groups) {
    for (const line of group.lines) {
      yield { group, line };
    }
  }
}

export function createCartApplier(
  transport: CartTransport,
  options: {
    /** Reads the persisted pre-apply snapshot, if any. */
    loadSnapshot(): Promise<CartSnapshot | null>;
    /** Persists the snapshot taken before the first mutation. */
    saveSnapshot(s: CartSnapshot): Promise<void>;
  },
): CartApplier {
  async function findInCart(productId: string, variantId: string): Promise<CartLine | undefined> {
    const cart = await transport.fetchCart();
    return cart.find((l) => l.productId === productId && l.variantId === variantId);
  }

  /** Add a variant and make sure the row reaches the wanted quantity. */
  async function addWithQuantity(
    productId: string,
    variantId: string,
    quantity: number,
  ): Promise<CartLine | undefined> {
    await transport.addVariant(variantId, quantity);
    let added = await findInCart(productId, variantId);
    let topUps = 0;
    // A transport that ignores `quantity` adds one unit: top up.
    while (added && added.quantity < quantity && topUps < quantity) {
      await transport.addVariant(variantId, 1);
      topUps++;
      added = await findInCart(productId, variantId);
    }
    return added;
  }

  async function preflight(
    plan: Plan,
    onProgress?: (done: number, total: number) => void,
  ): Promise<PreflightResult> {
    const entries = [...planEntries(plan)];
    const outOfStock: string[] = [];
    let newTotal = plan.grandTotal;
    let priceChanged = false;
    let changedCount = 0;
    let done = 0;

    for (const { group, line } of entries) {
      onProgress?.(++done, entries.length);
      if (done > 1) await sleep(POLITE_GAP_MS);
      const productId = productIdOf(line.itemKey);
      const variantId = line.variantId;
      if (!variantId) {
        // No variant id cannot be priced (D-05): treat as a stock
        // problem, never silently.
        outOfStock.push(line.title ?? line.itemKey);
        continue;
      }
      let live: LiveOffer | null = null;
      try {
        live = await transport.fetchOffer(productId, variantId, group.vendorId);
      } catch (err) {
        // Signed out: say so, instead of listing every item as out of stock.
        if (isAuthError(err)) throw err;
        // Any other transport failure is a stock problem for this line:
        // the flow must not continue silently.
        outOfStock.push(line.title ?? line.itemKey);
        continue;
      }
      if (!live || live.stockState !== 'in-stock') {
        outOfStock.push(line.title ?? line.itemKey);
        continue;
      }
      if (live.price !== line.unitPrice) {
        priceChanged = true;
        changedCount++;
        newTotal += (live.price - line.unitPrice) * line.quantity;
      }
    }

    if (outOfStock.length > 0) {
      return { status: 'out-of-stock', titles: outOfStock };
    }
    if (priceChanged) {
      return {
        status: 'price-changed',
        newTotal,
        delta: newTotal - plan.grandTotal,
        changedCount,
      };
    }
    return { status: 'ok' };
  }

  async function apply(
    plan: Plan,
    onProgress: (p: ApplyProgress) => void,
    applyOptions: ApplyOptions = {},
  ): Promise<ApplyResult> {
    const cart = await transport.fetchCart();
    // Snapshot the current cart before any mutation (brief §5): every
    // apply records it, except a retry that must keep the ORIGINAL.
    if (!applyOptions.keepSnapshot) {
      await options.saveSnapshot({
        key: 'latest',
        lines: cart,
        savedAt: new Date().toISOString(),
      });
    }

    const cartByItem = new Map<string, CartLine>(
      cart.map((l) => [`${l.productId}::${l.variantId}`, l]),
    );
    const rowsBefore = new Set(cart.map((l) => l.cartItemId));

    const applied: string[] = [];
    const failed: string[] = [];
    const errors: Record<string, string> = {};

    for (const { group, line } of planEntries(plan)) {
      if (!line.variantId) continue; // cannot apply without a chosen variant
      const productId = productIdOf(line.itemKey);
      const current = cartByItem.get(line.itemKey);
      const planned = cartByItem.get(`${productId}::${line.variantId}`);
      // Already at the planned variant - either this apply has nothing to
      // do for the line, or a retry finds a previous run's successful
      // move. Report it as settled instead of leaving the row "pending"
      // (2026-10-17 report). Seller-only changes (same variant, another
      // vendor) are not applyable through the API transport; the page
      // tells the user to do those by hand.
      if (planned && (!current || current.cartItemId === planned.cartItemId)) {
        // A different seller for the SAME variant cannot go through the
        // add-by-variant endpoint (D-28): that one is a manual change.
        const sellerDiffers =
          !!current?.sellerId && !!group.vendorId && current.sellerId !== group.vendorId;
        onProgress({
          itemKey: line.itemKey,
          title: line.title,
          status: sellerDiffers ? 'manual' : 'unchanged',
        });
        continue;
      }
      if (!current) continue; // no cart row at all: nothing to apply
      if (applied.length + failed.length > 0) await sleep(POLITE_GAP_MS);
      onProgress({ itemKey: line.itemKey, title: line.title, status: 'adding' });
      let added: CartLine | undefined;
      try {
        added = await addWithQuantity(productId, line.variantId, line.quantity);
        if (!added) {
          throw new Error('add not verified in cart');
        }
        if (added.sellerId && group.vendorId && added.sellerId !== group.vendorId) {
          throw new Error('the cart holds a different seller than planned');
        }
        if (added.quantity < line.quantity) {
          throw new Error('quantity not reached');
        }
        // Only now is it safe to touch the old row.
        await transport.removeCartItem(current.cartItemId);
        onProgress({ itemKey: line.itemKey, title: line.title, status: 'added' });
        applied.push(line.itemKey);
      } catch (err) {
        // Roll back a row WE added (never a pre-existing one); the old
        // row stays in the cart: nothing was removed before the add
        // was verified (D-26).
        if (added && !rowsBefore.has(added.cartItemId)) {
          try {
            await transport.removeCartItem(added.cartItemId);
          } catch {
            // best effort: the failure below already tells the user
          }
        }
        errors[line.itemKey] = errorMessage(err);
        onProgress({ itemKey: line.itemKey, title: line.title, status: 'failed' });
        failed.push(line.itemKey);
      }
    }

    return { ok: failed.length === 0, applied, failed, errors };
  }

  async function undo(onProgress: (p: ApplyProgress) => void): Promise<ApplyResult> {
    const snapshot = await options.loadSnapshot();
    if (!snapshot) {
      return { ok: true, applied: [], failed: [] };
    }
    const cart = await transport.fetchCart();
    const keyOf = (l: CartLine) => `${l.productId}::${l.variantId}`;
    const snapshotKeys = new Set(snapshot.lines.map(keyOf));
    const snapshotProducts = new Set(snapshot.lines.map((l) => l.productId));
    const cartKeys = new Set(cart.map(keyOf));

    const restored: string[] = [];
    const failed: string[] = [];
    const errors: Record<string, string> = {};
    let steps = 0;

    // Remove what the apply added: a row whose product was in the
    // snapshot but whose variant was not. A product that was NOT in the
    // snapshot is something the user added later: never touched.
    for (const line of cart) {
      const key = keyOf(line);
      if (snapshotKeys.has(key)) continue;
      if (!snapshotProducts.has(line.productId)) continue;
      if (steps++ > 0) await sleep(POLITE_GAP_MS);
      onProgress({ itemKey: key, status: 'adding' });
      try {
        await transport.removeCartItem(line.cartItemId);
        onProgress({ itemKey: key, status: 'added' });
        restored.push(key);
      } catch (err) {
        errors[key] = errorMessage(err);
        onProgress({ itemKey: key, status: 'failed' });
        failed.push(key);
      }
    }
    // Re-add what the apply removed (in the snapshot, not in cart),
    // with its original quantity.
    for (const line of snapshot.lines) {
      const key = keyOf(line);
      if (cartKeys.has(key)) continue;
      if (steps++ > 0) await sleep(POLITE_GAP_MS);
      onProgress({ itemKey: key, status: 'adding' });
      try {
        const back = await addWithQuantity(line.productId, line.variantId, line.quantity);
        if (!back || back.quantity < line.quantity) {
          throw new Error('restore not verified in cart');
        }
        onProgress({ itemKey: key, status: 'added' });
        restored.push(key);
      } catch (err) {
        errors[key] = errorMessage(err);
        onProgress({ itemKey: key, status: 'failed' });
        failed.push(key);
      }
    }

    return { ok: failed.length === 0, applied: restored, failed, errors };
  }

  return { preflight, apply, undo };
}
