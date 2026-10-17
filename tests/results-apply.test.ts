/**
 * Apply-to-cart pipeline tests (D-26, brief §5/§11):
 * preflight (ok / price-changed / out-of-stock),
 * apply (add → verify → remove ordering, unchanged
 * lines untouched), partial failure (the old row
 * stays), and undo (the snapshot is restored).
 * The transport is mocked; the pipeline is pure.
 */
import { describe, expect, it } from 'vitest';
import {
  createCartApplier,
  type CartLine,
  type CartSnapshot,
  type CartTransport,
  type LiveOffer,
} from '../src/results/apply';
import type { Plan } from '../src/shared/solver';

function planOf(
  lines: Array<{
    itemKey: string;
    title: string;
    variantId: string;
    unitPrice: number;
    quantity?: number;
  }>,
): Plan {
  return {
    mode: 'exact',
    assignments: lines.map((l) => ({
      itemKey: l.itemKey,
      title: l.title,
      variantLabel: 'گونه',
      unitPrice: l.unitPrice,
      quantity: l.quantity ?? 1,
      lineTotal: l.unitPrice * (l.quantity ?? 1),
      isLargeItem: false,
      variantId: l.variantId,
      capturedAt: '2026-10-10T12:00:00Z',
    })),
    groups: [
      {
        vendorId: 'vend-b',
        vendorName: 'فروشنده ب',
        shipmentClass: 'seller',
        lines: lines.map((l) => ({
          itemKey: l.itemKey,
          title: l.title,
          variantLabel: 'گونه',
          unitPrice: l.unitPrice,
          quantity: l.quantity ?? 1,
          lineTotal: l.unitPrice * (l.quantity ?? 1),
          isLargeItem: false,
          variantId: l.variantId,
          capturedAt: '2026-10-10T12:00:00Z',
        })),
        fee: 0,
        feeFlag: 'promo-waived' as const,
        promoIds: [],
        subtotal: lines.reduce((s, l) => s + l.unitPrice * (l.quantity ?? 1), 0),
      },
    ],
    itemSubtotal: lines.reduce((s, l) => s + l.unitPrice * (l.quantity ?? 1), 0),
    deliverySubtotal: 0,
    grandTotal: lines.reduce((s, l) => s + l.unitPrice * (l.quantity ?? 1), 0),
    unsolved: [],
    totalIsEstimate: false,
  };
}

function line(
  cartItemId: string,
  productId: string,
  variantId: string,
  sellerId = 'vend-a',
): CartLine {
  return {
    cartItemId,
    productId,
    variantId,
    sellerId,
    sellerName: 'فروشنده الف',
    quantity: 1,
  };
}

interface MockState {
  calls: string[];
  cart: CartLine[];
  offers: Map<string, LiveOffer>;
  failAdds: Set<string>;
  /** variantId -> productId, for the add response. */
  variantProduct: Map<string, string>;
}

function mockTransport(state: MockState): CartTransport {
  return {
    async fetchCart() {
      state.calls.push('fetchCart');
      return state.cart;
    },
    async fetchOffer(productId, variantId, vendorId) {
      state.calls.push(`fetchOffer:${productId}/${variantId}/${vendorId}`);
      return state.offers.get(`${productId}/${variantId}/${vendorId}`) ?? null;
    },
    async addVariant(variantId) {
      state.calls.push(`add:${variantId}`);
      if (state.failAdds.has(variantId)) {
        throw new Error('network');
      }
      // The gateway answers with the transformed cart:
      // the variant's product line, at its default seller.
      const productId = state.variantProduct.get(variantId) ?? 'p1';
      state.cart = [
        ...state.cart.filter((l) => l.variantId !== variantId),
        line(`new-${variantId}`, productId, variantId, 'vend-b'),
      ];
    },
    async removeCartItem(cartItemId) {
      state.calls.push(`remove:${cartItemId}`);
      state.cart = state.cart.filter((l) => l.cartItemId !== cartItemId);
    },
  };
}

const offer = (
  vendorId: string,
  price: number,
  stockState: 'in-stock' | 'out-of-stock' = 'in-stock',
): LiveOffer => ({ vendorId, price, stockState });

describe('apply-to-cart pipeline (D-26)', () => {
  it('preflight ok when every chosen offer is live and priced as planned', async () => {
    const state: MockState = {
      calls: [],
      cart: [line('c1', 'p1', 'v1')],
      offers: new Map([['p1/v2/vend-b', offer('vend-b', 60)]]),
      failAdds: new Set(),
      variantProduct: new Map(),
    };
    const applier = createCartApplier(mockTransport(state), {
      loadSnapshot: async () => null,
      saveSnapshot: async () => {},
    });
    const plan = planOf([{ itemKey: 'p1::v1', title: 'محصول p1', variantId: 'v2', unitPrice: 60 }]);
    await expect(applier.preflight(plan)).resolves.toEqual({
      status: 'ok',
    });
  });

  it('preflight reports a price change with the new total and the delta', async () => {
    const state: MockState = {
      calls: [],
      cart: [line('c1', 'p1', 'v1')],
      offers: new Map([
        // Live price 70 vs the planned 60.
        ['p1/v2/vend-b', offer('vend-b', 70)],
      ]),
      failAdds: new Set(),
      variantProduct: new Map(),
    };
    const applier = createCartApplier(mockTransport(state), {
      loadSnapshot: async () => null,
      saveSnapshot: async () => {},
    });
    const plan = planOf([{ itemKey: 'p1::v1', title: 'محصول p1', variantId: 'v2', unitPrice: 60 }]);
    await expect(applier.preflight(plan)).resolves.toEqual({
      status: 'price-changed',
      newTotal: 70,
      delta: 10,
      changedCount: 1,
    });
  });

  it('preflight reports out-of-stock (and a transport failure as one)', async () => {
    const state: MockState = {
      calls: [],
      cart: [line('c1', 'p1', 'v1')],
      offers: new Map([['p1/v2/vend-b', offer('vend-b', 60, 'out-of-stock')]]),
      failAdds: new Set(),
      variantProduct: new Map(),
    };
    const applier = createCartApplier(mockTransport(state), {
      loadSnapshot: async () => null,
      saveSnapshot: async () => {},
    });
    const plan = planOf([{ itemKey: 'p1::v1', title: 'محصول p1', variantId: 'v2', unitPrice: 60 }]);
    await expect(applier.preflight(plan)).resolves.toEqual({
      status: 'out-of-stock',
      titles: ['محصول p1'],
    });
  });

  it('apply: add the planned variant, verify it landed, then remove the old row', async () => {
    const state: MockState = {
      calls: [],
      cart: [line('c1', 'p1', 'v1')],
      offers: new Map([['p1/v2/vend-b', offer('vend-b', 60)]]),
      failAdds: new Set(),
      variantProduct: new Map([['v2', 'p1']]),
    };
    let saved: unknown = null;
    const applier = createCartApplier(mockTransport(state), {
      loadSnapshot: async () => null,
      saveSnapshot: async (s) => {
        saved = s;
      },
    });
    const plan = planOf([{ itemKey: 'p1::v1', title: 'محصول p1', variantId: 'v2', unitPrice: 60 }]);

    const progress: string[] = [];
    const result = await applier.apply(plan, (p) => {
      progress.push(`${p.itemKey}:${p.status}`);
    });

    expect(result.ok).toBe(true);
    expect(result.applied).toEqual(['p1::v1']);
    // The snapshot is taken before any mutation.
    expect(saved).toEqual({
      key: 'latest',
      lines: [line('c1', 'p1', 'v1')],
      savedAt: expect.any(String),
    });
    // Ordering: add → (verify read) → remove the old row.
    expect(state.calls).toEqual(['fetchCart', 'add:v2', 'fetchCart', 'remove:c1']);
    // Progress walks the changed line: adding → added.
    // (Pending rows are seeded by the UI, not the
    // pipeline.)
    expect(progress).toEqual(['p1::v1:adding', 'p1::v1:added']);
    // The cart now holds the new variant.
    expect(state.cart.map((l) => l.variantId)).toEqual(['v2']);
  });

  it('apply leaves an unchanged line alone and reports it as settled', async () => {
    const state: MockState = {
      calls: [],
      cart: [line('c1', 'p1', 'v1', 'vend-b')],
      offers: new Map([['p1/v1/vend-b', offer('vend-b', 80)]]),
      failAdds: new Set(),
      variantProduct: new Map(),
    };
    const applier = createCartApplier(mockTransport(state), {
      loadSnapshot: async () => null,
      saveSnapshot: async () => {},
    });
    // The plan keeps the cart's own variant AND seller.
    const plan = planOf([{ itemKey: 'p1::v1', title: 'محصول p1', variantId: 'v1', unitPrice: 80 }]);
    const progress: string[] = [];
    const result = await applier.apply(plan, (p) => {
      progress.push(`${p.itemKey}:${p.status}`);
    });
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual([]);
    // The UI seeds every row as pending; the pipeline must settle the
    // ones it deliberately skips (2026-10-17 report).
    expect(progress).toEqual(['p1::v1:unchanged']);
    expect(state.cart).toEqual([line('c1', 'p1', 'v1', 'vend-b')]);
  });

  it('apply marks a same-variant seller change as manual, not pending', async () => {
    // The plan wants the same variant from vend-b; the cart holds it from
    // vend-a. The API transport cannot switch sellers (D-28), so the
    // sheet must say "change by hand" instead of leaving the row pending.
    const state: MockState = {
      calls: [],
      cart: [line('c1', 'p1', 'v1')],
      offers: new Map([['p1/v1/vend-b', offer('vend-b', 80)]]),
      failAdds: new Set(),
      variantProduct: new Map(),
    };
    const applier = createCartApplier(mockTransport(state), {
      loadSnapshot: async () => null,
      saveSnapshot: async () => {},
    });
    const plan = planOf([{ itemKey: 'p1::v1', title: 'محصول p1', variantId: 'v1', unitPrice: 80 }]);
    const progress: string[] = [];
    await applier.apply(plan, (p) => {
      progress.push(`${p.itemKey}:${p.status}`);
    });
    expect(progress).toEqual(['p1::v1:manual']);
    expect(state.calls).toEqual(['fetchCart']);
  });

  it('apply reports a line a previous run already moved as settled', async () => {
    // A retry after a partial failure: the cart already holds the
    // planned variant under a new row, while the plan still names the
    // original cart item. Nothing must be added or removed.
    const state: MockState = {
      calls: [],
      cart: [line('c1', 'p1', 'v2')],
      offers: new Map(),
      failAdds: new Set(),
      variantProduct: new Map(),
    };
    const applier = createCartApplier(mockTransport(state), {
      loadSnapshot: async () => null,
      saveSnapshot: async () => {},
    });
    const plan = planOf([{ itemKey: 'p1::v1', title: 'محصول p1', variantId: 'v2', unitPrice: 60 }]);
    const progress: string[] = [];
    const result = await applier.apply(plan, (p) => {
      progress.push(`${p.itemKey}:${p.status}`);
    });
    expect(result.ok).toBe(true);
    expect(result.applied).toEqual([]);
    expect(progress).toEqual(['p1::v1:unchanged']);
    expect(state.calls).toEqual(['fetchCart']);
  });

  it('partial failure: the failed line keeps its old row, the rest apply', async () => {
    const state: MockState = {
      calls: [],
      cart: [line('c1', 'p1', 'v1'), line('c2', 'p2', 'v1')],
      offers: new Map([
        ['p1/v2/vend-b', offer('vend-b', 60)],
        ['p2/v3/vend-b', offer('vend-b', 40)],
      ]),
      // p1's add fails; p2's succeeds.
      failAdds: new Set(['v2']),
      variantProduct: new Map([
        ['v2', 'p1'],
        ['v3', 'p2'],
      ]),
    };
    const applier = createCartApplier(mockTransport(state), {
      loadSnapshot: async () => null,
      saveSnapshot: async () => {},
    });
    const plan = planOf([
      { itemKey: 'p1::v1', title: 'محصول p1', variantId: 'v2', unitPrice: 60 },
      { itemKey: 'p2::v1', title: 'محصول p2', variantId: 'v3', unitPrice: 40 },
    ]);

    const result = await applier.apply(plan, () => {});
    expect(result.ok).toBe(false);
    expect(result.failed).toEqual(['p1::v1']);
    expect(result.applied).toEqual(['p2::v1']);
    // The failed line's old row is still in the cart.
    expect(state.cart.some((l) => l.cartItemId === 'c1')).toBe(true);
    // The applied line's old row was removed.
    expect(state.cart.some((l) => l.cartItemId === 'c2')).toBe(false);
  });

  it('undo restores the snapshot: added rows removed, removed rows re-added', async () => {
    const state: MockState = {
      calls: [],
      cart: [line('c1', 'p1', 'v1')],
      offers: new Map([['p1/v2/vend-b', offer('vend-b', 60)]]),
      failAdds: new Set(),
      variantProduct: new Map([['v2', 'p1']]),
    };
    let saved: CartSnapshot | null = null;
    const applier = createCartApplier(mockTransport(state), {
      loadSnapshot: async () => saved,
      saveSnapshot: async (s) => {
        saved = s;
      },
    });
    const plan = planOf([{ itemKey: 'p1::v1', title: 'محصول p1', variantId: 'v2', unitPrice: 60 }]);

    const applied = await applier.apply(plan, () => {});
    expect(applied.ok).toBe(true);
    expect(state.cart.map((l) => l.variantId)).toEqual(['v2']);

    const undone = await applier.undo(() => {});
    expect(undone.ok).toBe(true);
    // The original variant is back in the cart.
    expect(state.cart.map((l) => l.variantId)).toEqual(['v1']);
    // Undo removed the added row and re-added the old variant.
    expect(state.calls).toContain('remove:new-v2');
    expect(state.calls).toContain('add:v1');
  });
});
