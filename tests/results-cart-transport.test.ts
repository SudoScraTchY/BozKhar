/**
 * The apply flow's live transport (D-30). The extension origin 401s
 * the checkout cart API (D-16 evidence), so every cart call is
 * proxied through the service worker, which runs it in an open
 * digikala tab's main world. This suite stubs chrome.runtime and
 * asserts the message contracts, the payload normalization (the LIVE
 * data.packages[] shape included) and the failure mapping the apply
 * sheet relies on.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cartTransport,
  CartApiError,
  CartTransportError,
  toCartLines,
} from '../src/results/cart-transport';
import { cartItemsOf } from '../src/capture/readers/cart';
import cartLiveShape from './fixtures/capture/cart-live-shape.json';
import cartBasic from './fixtures/capture/cart-basic.json';

/** Stubs chrome.runtime.sendMessage with a canned response. */
function stubRuntime(respond: (req: unknown) => unknown): { sent: unknown[] } {
  const sent: unknown[] = [];
  vi.stubGlobal('chrome', {
    runtime: {
      lastError: undefined,
      sendMessage: (req: unknown, cb: (res: unknown) => void) => {
        sent.push(req);
        cb(respond(req));
      },
    },
  });
  return { sent };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('cartTransport over the service worker (D-30)', () => {
  it('reads the cart through capture/cart-read and normalizes the LIVE packages shape', async () => {
    const { sent } = stubRuntime(() => ({ ok: true, kind: 'cart-read', data: cartLiveShape }));
    const lines = await cartTransport.fetchCart();

    expect(sent).toEqual([{ kind: 'capture/cart-read' }]);
    // The live payload nests the rows under data.packages[].cart_items[]
    // (verified against the real API). A shape-blind read returned an
    // empty cart, which made every apply a silent no-op.
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]).toMatchObject({
      productId: '16622211',
      variantId: '62270876',
      cartItemId: '400000001',
      sellerId: '101',
    });
  });

  it('finds the legacy data.cart_item shape too, and requires a row id to remove', async () => {
    // cart-basic.json predates the cart-row-id discovery, so its items
    // carry no id: the shape is found, but a row that cannot be named
    // cannot be removed (D-28's DELETE body is the row ids), so the
    // apply flow skips it rather than pretending.
    expect(cartItemsOf(cartBasic).length).toBeGreaterThan(0);
    expect(toCartLines(cartBasic)).toEqual([]);

    const withIds = {
      data: {
        cart_item: [{ ...cartBasic.data.cart_item[0], id: 77 }],
      },
    };
    const lines = toCartLines(withIds);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ cartItemId: '77', productId: '16622211' });
  });

  it('sends the add with the variant id and the removal with the row id', async () => {
    const { sent } = stubRuntime(() => ({ ok: true }));
    await cartTransport.addVariant('v2');
    await cartTransport.removeCartItem('c9');
    expect(sent).toEqual([
      { kind: 'capture/cart-add', variantId: 'v2' },
      { kind: 'capture/cart-remove', cartItemId: 'c9' },
    ]);
  });

  it('keeps a 401 as CartApiError so the sheet can say "sign in"', async () => {
    stubRuntime(() => ({ ok: false, errorCode: 'HTTP_STATUS', message: 'HTTP 401', status: 401 }));
    await expect(cartTransport.fetchCart()).rejects.toBeInstanceOf(CartApiError);
    await expect(cartTransport.fetchCart()).rejects.toMatchObject({ status: 401 });
  });

  it('maps NO_TAB to a transport error the page can name', async () => {
    stubRuntime(() => ({ ok: false, errorCode: 'NO_TAB', message: 'no digikala tab' }));
    await expect(cartTransport.fetchCart()).rejects.toBeInstanceOf(CartTransportError);
    await expect(cartTransport.fetchCart()).rejects.toMatchObject({ code: 'NO_TAB' });
  });

  it('reports a missing worker as RUNTIME instead of hanging', async () => {
    // No chrome global at all (a plain page, or a torn-down context).
    await expect(cartTransport.fetchCart()).rejects.toMatchObject({ code: 'RUNTIME' });
  });

  it('reports an empty channel as RUNTIME', async () => {
    stubRuntime(() => undefined);
    await expect(cartTransport.addVariant('v2')).rejects.toMatchObject({ code: 'RUNTIME' });
  });
});
