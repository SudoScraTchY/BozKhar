/**
 * Cart surface (09-ui-spec Surface 2): "Optimize this cart" button plus the
 * progress overlay with abort. The crawl itself runs in the service worker
 * (one tab's worth of API fetches, sequential, throttled); this surface only
 * starts it and renders progress (i of N, per-item failures, abort).
 */
import { isCartPage, findMountPoint, CART_SUMMARY_CANDIDATES } from '../dom/selectors';
import {
  mountButton,
  showProgressOverlay,
  showToast,
  type ButtonHandle,
  type ToastHandle,
} from './ui';
import type { CaptureProgressMessage, CaptureResponse } from '../messaging';

export interface CartSurfaceDeps {
  doc: Document;
  /** Page location override (tests); defaults to doc.location. */
  location?: { href: string; pathname: string };
  labels: {
    optimizeCart: string;
    crawlStarting: string;
    /** Button label while the crawl runs (the button is locked). */
    crawlRunning: string;
    crawlStartFailed: string;
    crawlProgress: (done: number, total: number) => string;
    crawlAborted: string;
    crawlFinished: (failed: number) => string;
    abort: string;
  };
  sendMessage(req: unknown): Promise<CaptureResponse>;
  /** Subscribe to broadcast progress from the service worker. */
  onProgress(cb: (msg: CaptureProgressMessage) => void): () => void;
}

export interface CartSurface {
  destroy(): void;
}

/** How long to wait for the worker's answer
 * before re-sending the crawl-start (D-21). */
const CRAWL_START_TIMEOUT_MS = 35_000;

/**
 * Sends the crawl-start, re-sending once when
 * the worker never answers. Live finding
 * 2026-10-09: a COLD MV3 worker woken by a
 * runtime message can hang on its first chrome
 * API call - or finish the crawl and die before
 * the response is delivered - so the start
 * promise never settles and the overlay sits on
 * "starting..." forever. Chrome terminates a
 * wedged worker after ~30s; a re-send reaches a
 * fresh worker whose in-flight latch is reset
 * (module state), so the retry starts a clean
 * crawl. Worst case the crawl runs twice (its
 * captures are idempotent re-snapshots).
 */
function sendCrawlStart(
  sendMessage: (req: unknown) => Promise<CaptureResponse>,
): Promise<CaptureResponse> {
  const first = new Promise<CaptureResponse>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('crawl-start response timeout')),
      CRAWL_START_TIMEOUT_MS,
    );
    sendMessage({ kind: 'capture/crawl-start' }).then(
      (res) => {
        clearTimeout(timer);
        resolve(res);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
  return first.catch(() => sendMessage({ kind: 'capture/crawl-start' }));
}

export function mountCartSurface(deps: CartSurfaceDeps): CartSurface | null {
  const { doc } = deps;
  const loc = deps.location ?? doc.location;
  if (!isCartPage(loc.pathname)) return null;

  let button: ButtonHandle | null = null;
  let overlay: { setText(t: string): void; remove(): void } | null = null;
  let toast: ToastHandle | null = null;
  let unsub: (() => void) | null = null;

  const start = async () => {
    if (overlay) return; // a crawl UI is already up
    overlay = showProgressOverlay(doc, { abort: deps.labels.abort }, () => {
      void deps.sendMessage({ kind: 'capture/crawl-abort' });
    });
    overlay.setText(deps.labels.crawlStarting);
    unsub = deps.onProgress((msg) => {
      overlay?.setText(deps.labels.crawlProgress(msg.done, msg.total));
      if (msg.finished) {
        overlay?.remove();
        overlay = null;
        unsub?.();
        unsub = null;
        toast?.remove();
        toast = showToast(
          doc,
          msg.aborted ? deps.labels.crawlAborted : deps.labels.crawlFinished(msg.failed),
          6000,
        );
      }
    });
    let res: Awaited<ReturnType<typeof deps.sendMessage>>;
    try {
      res = await sendCrawlStart(deps.sendMessage);
    } catch {
      // No service worker answered (sw crashed or not yet
      // registered). Fail loudly instead of leaving the
      // overlay up forever (live report 2026-10-08: the
      // overlay sat on "starting..." with nothing happening).
      overlay?.remove();
      overlay = null;
      unsub?.();
      unsub = null;
      toast?.remove();
      toast = showToast(doc, deps.labels.crawlStartFailed, 6000);
      return;
    }
    if (!res.ok) {
      overlay?.remove();
      overlay = null;
      unsub?.();
      unsub = null;
      toast?.remove();
      toast = showToast(doc, `${res.errorCode}: ${res.message}`, 6000);
      return;
    }
    if (overlay) {
      // The crawl finished, but the final progress broadcast
      // never reached this surface (SW restart, messaging
      // miss - live report 2026-10-08: the overlay outlived
      // a completed crawl). The response carries the final
      // counts, so close the overlay here instead of leaving
      // it up forever. Unsubscribing makes a late broadcast
      // a no-op, so the finished toast never doubles.
      overlay.remove();
      overlay = null;
      unsub?.();
      unsub = null;
      toast?.remove();
      toast = showToast(doc, deps.labels.crawlFinished((res as { failed: number }).failed), 6000);
    }
  };

  // SPA reality (same finding as the PDP surface): the cart
  // summary hydrates after document_idle - seconds later on a
  // healthy network, MINUTES later when the site rate-limits
  // its CDN (live smoke 2026-10-07: a 30s poll expired before
  // the summary card rendered and the button never appeared).
  // A MutationObserver attaches the instant the anchor exists;
  // the deadline is only a safety valve so a page that never
  // hydrates eventually stops watching.
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
    const anchor = findMountPoint(doc, CART_SUMMARY_CANDIDATES);
    if (anchor) {
      stopWatching();
      button = mountButton(doc, anchor, deps.labels.optimizeCart, () => void start());
      return;
    }
    if (Date.now() - startedAt >= ATTACH_DEADLINE_MS) return; // give up quietly
    if (doc.body) {
      if (!observer) {
        observer = new MutationObserver(() => tryAttach());
        observer.observe(doc.body, { childList: true, subtree: true });
      }
    } else {
      // No body yet: re-arm until the DOM exists.
      pollTimer = setTimeout(tryAttach, 500);
    }
  };
  tryAttach();

  return {
    destroy() {
      destroyed = true;
      stopWatching();
      button?.remove();
      overlay?.remove();
      toast?.remove();
      unsub?.();
    },
  };
}
