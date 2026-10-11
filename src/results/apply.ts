/**
 * Apply-to-cart pipeline (D-26, brief §5).
 *
 * All cart mutation sits behind `CartApplier` so the
 * transport (internal API today, UI automation tomorrow —
 * open decision 10.3) can change without touching the
 * flow. The flow is:
 *
 *   preflight  re-fetch every chosen offer (price, stock,
 *              seller still offers it) — never continue
 *              silently on a change;
 *   confirm    the sheet states what moves; the current
 *              cart is snapshotted to extension storage
 *              BEFORE any mutation;
 *   apply      per changed line, sequentially: add the
 *              new variant, VERIFY it is in the cart,
 *              only then remove the old row. Unchanged
 *              lines and locked items are left alone;
 *   undo       restores the snapshot with the same
 *              progress UI; the snapshot is kept until
 *              the next apply.
 *
 * The flow never navigates on its own, never checks
 * out, never pays.
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
 * The transport behind the flow. `addVariant` adds by
 * variant id (the site's default offer for that variant —
 * see D-26 amendment: the API takes no seller, so a
 * pinned non-default seller needs UI automation, a
 * follow-up).
 */
export interface CartTransport {
  fetchCart(): Promise<CartLine[]>;
  /** Null when the vendor no longer offers the variant. */
  fetchOffer(productId: string, variantId: string, vendorId: string): Promise<LiveOffer | null>;
  addVariant(variantId: string): Promise<void>;
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

export type LineStatus = 'pending' | 'adding' | 'added' | 'failed';

export interface ApplyProgress {
  itemKey: string;
  title?: string;
  status: LineStatus;
}

export interface ApplyResult {
  ok: boolean;
  applied: string[];
  failed: string[];
}

export interface CartApplier {
  preflight(plan: Plan): Promise<PreflightResult>;
  apply(plan: Plan, onProgress: (p: ApplyProgress) => void): Promise<ApplyResult>;
  undo(onProgress: (p: ApplyProgress) => void): Promise<ApplyResult>;
}

/** The pre-apply snapshot, persisted by the page (D-26). */
export interface CartSnapshot {
  key: 'latest';
  lines: CartLine[];
  savedAt: string;
}

/** productId from an item key (productId::variantId). */
function productIdOf(itemKey: string): string {
  const sep = itemKey.lastIndexOf('::');
  return sep === -1 ? itemKey : itemKey.slice(0, sep);
}

/**
 * A line needs applying when the plan's chosen offer
 * belongs to a different variant than the cart item
 * holds (D-17 passthrough: `line.variantId` is the
 * CHOSEN variant, while the item key names the cart
 * item's own variant). Seller-only changes (same
 * variant, different vendor) are not applyable
 * through the API transport — the add takes no
 * seller — and are left alone.
 */
function currentRowFor(line: PlanLine, cartByItem: Map<string, CartLine>): CartLine | undefined {
  const current = cartByItem.get(line.itemKey);
  if (!current) return undefined; // no cart row: nothing to apply
  if (line.variantId && line.variantId === current.variantId) {
    return undefined; // same variant: unchanged for this transport
  }
  return current; // the old row to remove after the verified add
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

/**
 * The pure pipeline over an injected transport. The
 * snapshot is supplied by the caller (the page persists
 * it to extension storage); `rememberSnapshot` hands the
 * freshly taken one back.
 */
export function createCartApplier(
  transport: CartTransport,
  options: {
    /** Reads the persisted pre-apply snapshot, if any. */
    loadSnapshot(): Promise<CartSnapshot | null>;
    /** Persists the snapshot taken before the first mutation. */
    saveSnapshot(s: CartSnapshot): Promise<void>;
  },
): CartApplier {
  async function preflight(plan: Plan): Promise<PreflightResult> {
    const outOfStock: string[] = [];
    let newTotal = plan.grandTotal;
    let priceChanged = false;
    let changedCount = 0;

    for (const { group, line } of planEntries(plan)) {
      const productId = productIdOf(line.itemKey);
      const variantId = line.variantId;
      if (!variantId) {
        // No variant id cannot be priced (D-05): treat as
        // a stock problem, never silently.
        outOfStock.push(line.title ?? line.itemKey);
        continue;
      }
      let live: LiveOffer | null = null;
      try {
        live = await transport.fetchOffer(productId, variantId, group.vendorId);
      } catch {
        // A transport failure is a stock problem for this
        // line: the flow must not continue silently.
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

  async function apply(plan: Plan, onProgress: (p: ApplyProgress) => void): Promise<ApplyResult> {
    const cart = await transport.fetchCart();
    // Snapshot the current cart before any mutation
    // (brief §5): the first apply records it, and it
    // stays until the next apply.
    const existing = await options.loadSnapshot();
    if (!existing) {
      await options.saveSnapshot({
        key: 'latest',
        lines: cart,
        savedAt: new Date().toISOString(),
      });
    }

    const cartByItem = new Map<string, CartLine>(
      cart.map((l) => [`${l.productId}::${l.variantId}`, l]),
    );

    const applied: string[] = [];
    const failed: string[] = [];

    for (const { line } of planEntries(plan)) {
      if (!line.variantId) continue; // cannot apply without a chosen variant
      const old = currentRowFor(line, cartByItem);
      if (!old) continue;
      onProgress({ itemKey: line.itemKey, title: line.title, status: 'adding' });
      try {
        await transport.addVariant(line.variantId);
        // Verify the add landed BEFORE touching the old row.
        const after = await transport.fetchCart();
        const added = after.find(
          (l) => l.productId === productIdOf(line.itemKey) && l.variantId === line.variantId,
        );
        if (!added) {
          throw new Error('add not verified in cart');
        }
        if (old) {
          await transport.removeCartItem(old.cartItemId);
        }
        onProgress({
          itemKey: line.itemKey,
          title: line.title,
          status: 'added',
        });
        applied.push(line.itemKey);
      } catch {
        // The old row stays in the cart: nothing was removed
        // before the add was verified (D-26).
        onProgress({
          itemKey: line.itemKey,
          title: line.title,
          status: 'failed',
        });
        failed.push(line.itemKey);
      }
    }

    return { ok: failed.length === 0, applied, failed };
  }

  async function undo(onProgress: (p: ApplyProgress) => void): Promise<ApplyResult> {
    const snapshot = await options.loadSnapshot();
    if (!snapshot) {
      return { ok: true, applied: [], failed: [] };
    }
    const cart = await transport.fetchCart();
    const snapshotKeys = new Set(snapshot.lines.map((l) => `${l.productId}::${l.variantId}`));
    const cartKeys = new Set(cart.map((l) => `${l.productId}::${l.variantId}`));

    const restored: string[] = [];
    const failed: string[] = [];

    // Remove what the apply added (not in the snapshot).
    for (const line of cart) {
      const key = `${line.productId}::${line.variantId}`;
      if (snapshotKeys.has(key)) continue;
      onProgress({ itemKey: key, status: 'adding' });
      try {
        await transport.removeCartItem(line.cartItemId);
        onProgress({ itemKey: key, status: 'added' });
        restored.push(key);
      } catch {
        onProgress({ itemKey: key, status: 'failed' });
        failed.push(key);
      }
    }
    // Re-add what the apply removed (in the snapshot, not in cart).
    for (const line of snapshot.lines) {
      const key = `${line.productId}::${line.variantId}`;
      if (cartKeys.has(key)) continue;
      onProgress({ itemKey: key, status: 'adding' });
      try {
        await transport.addVariant(line.variantId);
        onProgress({ itemKey: key, status: 'added' });
        restored.push(key);
      } catch {
        onProgress({ itemKey: key, status: 'failed' });
        failed.push(key);
      }
    }

    return { ok: failed.length === 0, applied: restored, failed };
  }

  return { preflight, apply, undo };
}
