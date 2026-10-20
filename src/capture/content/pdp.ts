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

/** Balance-scales icon: comparison without another image asset. */
function compareIcon(doc: Document): SVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(NS, 'svg') as SVGElement;
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  for (const d of [
    'M12 3v18',
    'M5 7h14',
    'M7 7l-3 6a3 3 0 0 0 6 0L7 7',
    'M17 7l-3 6a3 3 0 0 0 6 0L17 7',
  ]) {
    const path = doc.createElementNS(NS, 'path') as SVGPathElement;
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
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
  let actions: HTMLElement | null = null;

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
  // usually NOT rendered yet - Digikala hydrates it seconds later (minutes
  // under site rate-limiting). A MutationObserver attaches the instant the
  // anchor exists; the deadline is only a safety valve.
  let pollTimer: ReturnType<typeof setTimeout> | null = null;
  let observer: MutationObserver | null = null;
  let destroyed = false;
  const ATTACH_DEADLINE_MS = 300_000;
  const startedAt = Date.now();

  const stopWatching = () => {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = null;
    observer?.disconnect();
    observer = null;
  };

  const tryAttach = () => {
    if (destroyed || button) return;
    const anchor = findMountPoint(doc, PDP_SELLER_PANEL_CANDIDATES);
    if (anchor) {
      stopWatching();
      // A narrow buy row cannot host a third control without wrapping
      // ugly (live 2026-10-20). Both BozKhar actions get their own stack
      // below the row, styled as one intentional feature block.
      actions = doc.createElement('div');
      actions.className = 'dkopt-pdp-actions';
      const row = anchor.parentElement;
      const host = row && row !== doc.body ? row : anchor;
      host.insertAdjacentElement('afterend', actions);
      button = mountButton(doc, anchor, deps.labels.addToComparison, click, {
        icon: compareIcon(doc),
        className: 'dkopt-btn-pdp',
        host: actions,
      });
      // The Torob surface may have mounted first and parked its trigger
      // in the buy row; move it into this stack.
      const torob = doc.getElementById('dkopt-torob');
      if (torob) actions.append(torob);
      return;
    }
    if (Date.now() - startedAt >= ATTACH_DEADLINE_MS) return; // give up quietly
    if (doc.body) {
      if (!observer) {
        observer = new MutationObserver(() => tryAttach());
        observer.observe(doc.body, { childList: true, subtree: true });
      }
    } else {
      pollTimer = setTimeout(tryAttach, 500);
    }
  };
  tryAttach();

  return {
    destroy() {
      destroyed = true;
      stopWatching();
      button?.remove();
      actions?.remove();
      actions = null;
      toast?.remove();
    },
  };
}
