/**
 * PDP surface (09-ui-spec Surface 1): "Add to comparison" button.
 *
 * Flow: click -> idle/capturing state -> message the service worker, which
 * fetches the product JSON API with the user's session, normalizes, and
 * appends the snapshot. The DOM never extracts offers (post-S-7); the
 * content script only supplies the page-context facts (product/variant ids)
 * and renders the outcome: toast with offer count + variant label (D-05),
 * inline error with a retry action (NFR-05).
 */
import {
  isProductPage,
  findMountPoint,
  PDP_SELLER_PANEL_CANDIDATES,
  readVariantIdFromLocation,
} from '../dom/selectors';
import { extractProductId, extractVariantId } from '../readers/url';
import { mountButton, showToast, type ButtonHandle, type ToastHandle } from './ui';
import type { CaptureResponse } from '../messaging';

export interface PdpSurfaceDeps {
  doc: Document;
  /** Page location override (tests); defaults to doc.location. */
  location?: { href: string; pathname: string };
  lang: 'fa' | 'en';
  /** Catalog strings (injected so tests assert wording without i18n). */
  labels: {
    addToComparison: string;
    inComparison: string;
    capturing: string;
    captureFailed: string;
    tryAgain: string;
    capturedOffersToast: (count: number, variant: string) => string;
  };
  sendMessage(req: unknown): Promise<CaptureResponse>;
  /** Existing snapshot age for the in-comparison state, if any. */
  getExistingAgeHours?: (productId: string, variantId: string) => number | null;
}

export interface PdpSurface {
  destroy(): void;
}

/** Resolves the product/variant identity from the page location. */
export function resolvePdpIdentity(
  href: string,
): { productId: string; variantId: string | null } | null {
  const productId = extractProductId(href);
  if (!productId) return null;
  const variantId =
    readVariantIdFromLocation(href) ??
    (extractVariantId(href) === undefined ? null : extractVariantId(href));
  return { productId, variantId };
}

export function mountPdpSurface(deps: PdpSurfaceDeps): PdpSurface | null {
  const { doc } = deps;
  const loc = deps.location ?? doc.location;
  if (!isProductPage(loc.pathname)) return null;

  const identity = resolvePdpIdentity(loc.href);
  if (!identity) return null;

  const anchor = findMountPoint(doc, PDP_SELLER_PANEL_CANDIDATES);
  if (!anchor) return null; // no anchor: not injected, never mis-mounted

  let button: ButtonHandle | null = null;
  let toast: ToastHandle | null = null;

  const click = async () => {
    if (!button || !identity.variantId) return;
    button.setState('capturing', deps.labels.capturing);
    try {
      const res = await deps.sendMessage({
        kind: 'capture/pdp',
        productId: identity.productId,
        variantId: identity.variantId,
      });
      if (res.ok && res.kind === 'pdp') {
        const variantLabel = res.variantLabel || identity.variantId;
        button.setState('added', deps.labels.inComparison);
        toast?.remove();
        toast = showToast(doc, deps.labels.capturedOffersToast(res.offerCount, variantLabel));
      } else if (!res.ok) {
        button.setState('failed', deps.labels.captureFailed);
        // Inline retry: the failed button itself is the retry affordance
        // (NFR-05: never a silent no-op).
        showToast(doc, `${deps.labels.captureFailed}: ${res.message}`);
      }
    } catch {
      button.setState('failed', deps.labels.captureFailed);
    }
    // Back to idle after a short linger so re-capture is one click away
    // (FR-01: re-capture refreshes the snapshot).
    setTimeout(() => button?.setState('idle', deps.labels.addToComparison), 4000);
  };

  button = mountButton(doc, anchor, deps.labels.addToComparison, click);
  return {
    destroy() {
      button?.remove();
      toast?.remove();
    },
  };
}
