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
import { isProductPage, findMountPoint, PDP_SELLER_PANEL_CANDIDATES } from '../dom/selectors';
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
  // A missing ?variant_id= is NOT a blocker (live smoke finding): the SW
  // resolves the selected/default variant from the product payload (S-2/S-7
  // - the API is the source of variant truth). null flows through and the
  // toast labels the variant the SW resolved.
  return { productId, variantId: extractVariantId(href) };
}

export function mountPdpSurface(deps: PdpSurfaceDeps): PdpSurface | null {
  const { doc } = deps;
  const loc = deps.location ?? doc.location;
  if (!isProductPage(loc.pathname)) return null;

  const identity = resolvePdpIdentity(loc.href);
  if (!identity) return null;

  let button: ButtonHandle | null = null;
  let toast: ToastHandle | null = null;

  const click = async () => {
    if (!button) return;
    button.setState('capturing', deps.labels.capturing);
    try {
      const res = await deps.sendMessage({
        kind: 'capture/pdp',
        productId: identity.productId,
        // Empty variant id => the SW resolves the variant from the payload
        // (the API is the source of variant truth, S-2/S-7).
        variantId: identity.variantId ?? '',
      });
      if (res.ok && res.kind === 'pdp') {
        const variantLabel = res.variantLabel || identity.variantId || '';
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

  // SPA reality (live smoke finding): at document_idle the seller panel is
  // usually NOT rendered yet - Digikala hydrates it seconds later. Retry
  // anchor discovery on a bounded schedule instead of never mounting.
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let destroyed = false;
  const ATTACH_DEADLINE_MS = 30_000;
  const ATTACH_INTERVAL_MS = 1_000;
  const startedAt = Date.now();

  const tryAttach = () => {
    if (destroyed || button) return;
    const anchor = findMountPoint(doc, PDP_SELLER_PANEL_CANDIDATES);
    if (anchor) {
      button = mountButton(doc, anchor, deps.labels.addToComparison, click);
    } else if (Date.now() - startedAt < ATTACH_DEADLINE_MS) {
      pollTimer = setTimeout(tryAttach, ATTACH_INTERVAL_MS);
    }
    // Past the deadline with no anchor: give up quietly - no wrong mount.
  };
  tryAttach();

  return {
    destroy() {
      destroyed = true;
      if (pollTimer) clearTimeout(pollTimer);
      button?.remove();
      toast?.remove();
    },
  };
}
