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

function broadcast(msg: unknown): void {
  // No tab filtering on purpose: progress is relevant on any open surface
  // (cart page overlay now, results page later in T05).
  void chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
}

chrome.runtime.onMessage.addListener(
  (raw: unknown, _sender, sendResponse: (res: CaptureResponse) => void) => {
    if (!isCaptureRequest(raw)) return false; // not ours: leave channel free
    const req = raw as CaptureRequest;

    if (req.kind === 'capture/pdp') {
      void handleCapturePdp(deps(), req.productId, req.variantId).then(sendResponse);
      return true; // async response
    }
    if (req.kind === 'capture/crawl-start') {
      void handleCrawlStart(deps()).then(sendResponse);
      return true;
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
    fetch: globalThis.fetch,
    onProgress: broadcast,
    badge: chrome.action,
  };
}

chrome.runtime.onInstalled.addListener(() => {
  // Intentionally minimal beyond badge priming: no alarms, no fetches.
});

export {};
