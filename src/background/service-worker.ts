/**
 * MV3 service worker: owns capture I/O (SDD 06 component 3).
 *
 * Wires the messaging contract to the capture controller:
 * - capture/pdp: fetch product API with the user's session, normalize,
 *   append the snapshot (db.addSnapshot semantics: append-only).
 * - capture/crawl-start | capture/crawl-abort: the cart crawl lifecycle.
 * - capture/badge-sync: toolbar badge = comparison-list size.
 * - capture/progress: broadcast to every open surface.
 *
 * D-01: GET-only everywhere. D-02: fetch targets are guarded to
 * *.digikala.com inside digikalaFetchJson.
 */
import type { CaptureRequest, CaptureResponse } from '../capture/messaging';
import { isCaptureRequest } from '../capture/messaging';
import {
  handleCapturePdp,
  handleCrawlStart,
  handleCrawlAbort,
  syncBadge,
} from '../capture/sw-controller';
import { delegateFetchJson } from '../capture/fetch/delegate';

function broadcast(msg: unknown): void {
  // No tab filtering on purpose: progress is relevant on any open surface
  // (cart page overlay now, results page later in T05).
  void chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
}

chrome.runtime.onMessage.addListener(
  (raw: unknown, sender, sendResponse: (res: CaptureResponse) => void) => {
    if (!isCaptureRequest(raw)) return false; // not ours: leave channel free
    const req = raw as CaptureRequest;

    if (req.kind === 'capture/pdp') {
      void handleCapturePdp(deps(), req.productId, req.variantId).then(sendResponse);
      return true; // async response
    }
    if (req.kind === 'capture/crawl-start') {
      // The requesting tab's content script executes the
      // delegated crawl fetches (D-16); sender.tab is set for
      // content-script messages (options-page starts have none).
      void handleCrawlStart(deps(), sender.tab?.id).then((res) => {
        // 09-ui-spec Surface 3: on completion the results
        // page opens automatically - failed items included,
        // with the gaps honestly listed. Partial and aborted
        // crawls open it too (everything so far is kept).
        if (res.ok) {
          chrome.tabs.create(
            { url: chrome.runtime.getURL('src/results/index.html') },
            () => void chrome.runtime.lastError,
          );
        }
        sendResponse(res);
      });
      return true; // async response
    }
    if (req.kind === 'capture/crawl-abort') {
      sendResponse(handleCrawlAbort());
      return false;
    }
    if (req.kind === 'capture/badge-sync') {
      void syncBadge(deps()).then((count) => sendResponse({ ok: true, kind: 'badge-sync', count }));
      return true;
    }
    return false;
  },
);

/**
 * Deps are built lazily so the worker module loads even before any
 * storage/indexedDB is available (MV3 workers wake cold on any event).
 */
function deps() {
  return {
    dbFactory: globalThis.indexedDB,
    settingsArea: chrome.storage.local,
    stateArea: chrome.storage.local,
    // Bind fetch: passing the bare function loses `this` and Chromium throws
    // "Illegal invocation" in the worker scope (live smoke finding).
    fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init),
    // D-16: crawl fetches are delegated to the content script on
    // the requesting tab (the checkout API requires the site's
    // routing header set, which only the page context sends).
    delegateFetch: delegateFetchJson,
    onProgress: broadcast,
    badge: chrome.action,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  // Intentionally minimal beyond badge priming: no alarms, no fetches.
});

export {};
