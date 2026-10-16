/**
 * The live CartTransport (D-26, transport re-cut in D-30): the
 * Digikala gateway behind CartApplier.
 *
 * Why the split. The product API answers any origin, so `fetchOffer`
 * (preflight) still calls it directly from this page. The checkout
 * cart API does NOT: it 401s requests from the extension origin
 * (SameSite=Lax session cookies are not attached cross-site, and
 * its CORS allows only the web origin - D-16 evidence). Every cart
 * call therefore goes through the service worker, which runs it in
 * an open digikala tab's main world:
 *
 *   capture/cart-read     -> GET  /checkout/v1/carts
 *   capture/cart-add      -> POST /checkout/v1/carts/items
 *   capture/cart-remove   -> DELETE /checkout/v1/carts/items
 *
 * There is deliberately no direct-fetch fallback for the cart
 * calls: an extension-origin cart request is the bug being fixed,
 * and silently falling back would hide it. `NO_TAB` (no digikala
 * tab open) is surfaced to the user instead.
 *
 * D-19 lesson: routing headers break this host's CORS
 * preflight — send Content-Type only; the session
 * cookie authenticates every call. (The cart API is the exception
 * that requires the site's routing header set; the worker's
 * injected funcs add it - see src/capture/fetch/site-headers.ts.)
 *
 * Review fixes (round 2):
 *  - an empty body (typical for DELETE/POST success) no longer makes
 *    `res.json()` throw AFTER the call succeeded, which would have
 *    reported a removed row as a failed line;
 *  - every request has a timeout, so a hung call cannot freeze the
 *    sheet forever;
 *  - failures carry the HTTP status (CartApiError) so the page can tell
 *    "not signed in" from "out of stock";
 *  - GETs retry once on 429/5xx. POST/DELETE never retry blindly: a
 *    retried add could double the quantity (apply.ts re-verifies the
 *    cart after each add instead).
 */
import { rialToToman } from '../capture/normalize';
import { readProductPayload } from '../capture/readers/product';
import { extractVariantId } from '../capture/readers/url';
import { cartItemsOf } from '../capture/readers/cart';
import type { CartLine, CartTransport, LiveOffer } from './apply';

const GATEWAY = 'https://api.digikala.com';
const TIMEOUT_MS = 15_000;

/** An HTTP failure from the gateway; `status` drives the page's message. */
export class CartApiError extends Error {
  constructor(
    readonly status: number,
    readonly path: string,
  ) {
    super(`cart API ${status} on ${path}`);
    this.name = 'CartApiError';
  }
}

/**
 * A cart call that never reached an HTTP answer: no digikala tab is
 * open (`NO_TAB`), the worker is unreachable (`RUNTIME`), or the
 * delegation failed (`NETWORK`). The page turns `code` into a
 * specific sentence (D-30).
 */
export class CartTransportError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'CartTransportError';
  }
}

/** The worker's cart responses (the capture contract, narrowed). */
type CartProxyResponse =
  | { ok: true; data?: unknown }
  | { ok: false; errorCode?: string; message?: string; status?: number };

/**
 * One runtime.sendMessage round trip, callback style (the promise
 * form is unreliable across Chrome builds). Never throws: a missing
 * worker or a lost channel becomes an error shape, so the apply
 * sheet always gets an answer instead of hanging.
 */
function askWorker(req: unknown): Promise<CartProxyResponse> {
  return new Promise((resolve) => {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime) {
      resolve({ ok: false, errorCode: 'RUNTIME', message: 'chrome.runtime is unavailable' });
      return;
    }
    try {
      runtime.sendMessage(req, (res: unknown) => {
        void runtime.lastError; // checked implicitly by the shape below
        resolve(
          (res as CartProxyResponse | undefined) ?? {
            ok: false,
            errorCode: 'RUNTIME',
            message: 'no response from the service worker',
          },
        );
      });
    } catch (e) {
      resolve({
        ok: false,
        errorCode: 'RUNTIME',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });
}

/** A cart call through the worker; returns the payload it carried. */
async function cartCall(path: string, req: unknown): Promise<unknown> {
  const res = await askWorker(req);
  if (res.ok) return res.data;
  // 401/403 keep the CartApiError shape so apply.ts's isAuthError
  // (and the sheet's "sign in" message) work unchanged.
  if (res.status === 401 || res.status === 403) throw new CartApiError(res.status, path);
  throw new CartTransportError(
    res.errorCode ?? 'UNKNOWN',
    res.message ?? `the cart call did not complete: ${path}`,
  );
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Returns the parsed JSON body, or null when the body is empty. */
async function gateway<T>(path: string, init?: RequestInit): Promise<T | null> {
  const method = init?.method ?? 'GET';
  const attempts = method === 'GET' ? 2 : 1;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${GATEWAY}${path}`, {
      ...init,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.ok) {
      const body = await res.text();
      return body ? (JSON.parse(body) as T) : null;
    }
    if (attempt < attempts && (res.status === 429 || res.status >= 500)) {
      await sleep(600 * attempt);
      continue;
    }
    throw new CartApiError(res.status, path);
  }
}

function variantIdFromUri(uri: string | undefined): string | null {
  if (!uri) return null;
  try {
    const absolute = new URL(uri, 'https://www.digikala.com').toString();
    return extractVariantId(absolute);
  } catch {
    return null;
  }
}

/**
 * Normalizes the live cart into transport lines. The item list comes
 * from the shared reader (cartItemsOf), so the LIVE
 * data.packages[].cart_items[] shape is found too - a shape-blind
 * read here returned an empty cart, which made every apply a no-op.
 */
export function toCartLines(raw: unknown): CartLine[] {
  const out: CartLine[] = [];
  for (const item of cartItemsOf(raw)) {
    if (!item) continue;
    const productId = item.product?.id !== undefined ? String(item.product.id) : '';
    const seller = item.seller ?? item.variant?.seller;
    const variantId =
      item.variant?.id !== undefined
        ? String(item.variant.id)
        : variantIdFromUri(item.product?.url?.uri);
    if (!productId || !variantId || item.id === undefined) continue;
    out.push({
      cartItemId: String(item.id),
      productId,
      variantId,
      sellerId: seller?.id !== undefined ? String(seller.id) : '',
      sellerName: seller?.title ?? '',
      quantity: typeof item.quantity === 'number' && item.quantity > 0 ? item.quantity : 1,
    });
  }
  return out;
}

/** The transport the apply flow runs on. */
export const cartTransport: CartTransport = {
  async fetchCart(): Promise<CartLine[]> {
    const data = await cartCall('/checkout/v1/carts', { kind: 'capture/cart-read' });
    return toCartLines(data);
  },

  async fetchOffer(
    productId: string,
    variantId: string,
    vendorId: string,
  ): Promise<LiveOffer | null> {
    const url = `/product/v1/products/${encodeURIComponent(productId)}/?variant_id=${encodeURIComponent(variantId)}`;
    const raw = await gateway<unknown>(url, { method: 'GET' });
    if (raw === null) return null;
    const view = readProductPayload(raw);
    // The chosen (variant, seller) pair must still exist
    // and be purchasable.
    for (const variant of view.variants) {
      if (variant.variantId !== variantId) continue;
      if (variant.sellerId !== vendorId) continue;
      if (variant.priceRial === null) return null;
      return {
        vendorId: variant.sellerId,
        price: rialToToman(variant.priceRial),
        stockState: variant.stockState,
      };
    }
    return null;
  },

  /**
   * The discovered endpoint takes variant ids only: there is no quantity
   * field, so this always adds one unit. apply.ts verifies the cart after
   * the add and tops the row up (one add per missing unit); if the site
   * does not increment an existing row, the line fails safe with
   * "quantity not reached" and the add is rolled back.
   */
  async addVariant(variantId: string): Promise<void> {
    await cartCall('/checkout/v1/carts/items', { kind: 'capture/cart-add', variantId });
  },

  async removeCartItem(cartItemId: string): Promise<void> {
    await cartCall('/checkout/v1/carts/items', { kind: 'capture/cart-remove', cartItemId });
  },
};
