/**
 * MV3 service worker: owns capture I/O (SDD 06 component 3).
 *
 * Wires the messaging contract to the capture controller:
 * - capture/pdp: fetch product API with the user's session, normalize,
 *   append the snapshot (db.addSnapshot semantics: append-only).
 * - capture/crawl-start | capture/crawl-abort: the cart crawl lifecycle.
 * - capture/badge-sync: toolbar badge = comparison-list size.
 * - capture/progress: broadcast to every open surface.
 * - update/check: the popup's one-shot release check on GitHub (D-44).
 *   No polling and no storage; the request happens only when the popup
 *   opens and reads nothing but the latest tag name.
 *
 * D-01: GET-only everywhere, except the sanctioned POSTs recorded
 * in the decision log: D-19's fixed shipment quote and D-30's two
 * cart writes (POST/DELETE /checkout/v1/carts/items) that serve the
 * user-initiated apply flow. D-02: fetch targets are guarded to
 * *.digikala.com inside digikalaFetchJson (and inside every
 * injected func).
 */
import type { CaptureRequest, CaptureResponse } from '../capture/messaging';
import { isCaptureRequest } from '../capture/messaging';
import { isInsightsRequest, type InsightsResponse } from '../insights/api';
import { handleInsightsRequest } from '../insights/sw';
import { isTorobRequest, type TorobResponse } from '../torob/api';
import { handleTorobCompare } from '../torob/handler';
import {
  handleUpdateCheck,
  isUpdateCheckRequest,
  type UpdateCheckResponse,
} from '../shared/update';
import {
  handleCapturePdp,
  handleCrawlStart,
  handleCrawlAbort,
  handleCartAdd,
  handleCartRead,
  handleCartRemove,
  pickDigikalaTab,
  syncBadge,
} from '../capture/sw-controller';
import {
  delegateCartAdd,
  delegateCartRemove,
  delegateFetchJson,
  delegateFetchJsonBare,
  delegateShipmentQuote,
  SHIPMENT_API_BODY,
  SHIPMENT_API_URL,
} from '../capture/fetch/delegate';

function broadcast(msg: unknown): void {
  // No tab filtering on purpose: progress is relevant on any open surface
  // (cart page overlay now, results page later in T05).
  void chrome.runtime.sendMessage(msg, () => void chrome.runtime.lastError);
}

type WorkerResponse =
  | CaptureResponse
  | InsightsResponse
  | TorobResponse
  | UpdateCheckResponse
  | { ok: true; kind: 'insights-open' };

chrome.runtime.onMessage.addListener(
  (raw: unknown, sender, sendResponse: (res: WorkerResponse) => void) => {
    // The orders-tab button asks the worker to open the insights page.
    // Content scripts cannot call chrome.tabs, and this keeps the open
    // action tied to an explicit user click (D-30).
    if (
      typeof raw === 'object' &&
      raw !== null &&
      (raw as { kind?: unknown }).kind === 'insights/open'
    ) {
      chrome.tabs.create(
        { url: chrome.runtime.getURL('src/insights/index.html') },
        () => void chrome.runtime.lastError,
      );
      sendResponse({ ok: true, kind: 'insights-open' });
      return false;
    }

    // Release check (D-44): the popup opens, the worker asks GitHub for
    // the latest tag. GET only; credentials and referrer are omitted.
    if (isUpdateCheckRequest(raw)) {
      void handleUpdateCheck(
        (url, init) => globalThis.fetch(url, init),
        chrome.runtime.getManifest().version,
      ).then(sendResponse);
      return true;
    }

    // Order Insights (D-39): on-demand reads of the user's own order
    // history, routed before the capture guard. The handler normalizes
    // and strips sensitive fields inside the worker.
    if (isInsightsRequest(raw)) {
      void handleInsightsRequest(insightsDeps(), raw).then(sendResponse);
      return true;
    }

    // Torob comparison (D-42): one click on the PDP trigger sends the
    // public product title to Torob's API. The worker is the only place
    // that talks to Torob, so the page never sees a cross-origin request.
    if (isTorobRequest(raw)) {
      void handleTorobCompare((url, init) => globalThis.fetch(url, init), raw.query).then(
        sendResponse,
      );
      return true;
    }

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
    if (req.kind === 'capture/cart-read') {
      void handleCartRead(deps()).then(sendResponse);
      return true; // async response
    }
    if (req.kind === 'capture/cart-add') {
      void handleCartAdd(deps(), req.variantId).then(sendResponse);
      return true; // async response
    }
    if (req.kind === 'capture/cart-remove') {
      void handleCartRemove(deps(), req.cartItemId).then(sendResponse);
      return true; // async response
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
    // D-19: the fixed shipment-quote POST (the
    // extension's only POST - read-only quote).
    shipmentQuote: (tabId: number) =>
      delegateShipmentQuote(tabId, SHIPMENT_API_URL, SHIPMENT_API_BODY),
    // D-30: the apply flow's cart calls run in an open digikala tab.
    // `sender.tab` is deliberately NOT used: it is unset for
    // messages from the results extension page, and even when a
    // Chrome build sets it, it names that page, not a digikala tab.
    findCartTab: async () => {
      try {
        const tabs = await chrome.tabs.query({ url: ['https://*.digikala.com/*'] });
        return pickDigikalaTab(tabs);
      } catch {
        return undefined;
      }
    },
    cartAdd: delegateCartAdd,
    cartRemove: delegateCartRemove,
    onProgress: broadcast,
    badge: chrome.action,
  };
}

/**
 * Insights deps: the same session fetch and main-world delegation the
 * crawl uses, plus the bare-header retry (profile endpoints reject the
 * checkout routing headers at the preflight) and the open-tab picker.
 * The worker never opens a tab on its own (D-30).
 */
function insightsDeps() {
  return {
    fetch: (url: string, init?: RequestInit) => globalThis.fetch(url, init),
    delegate: delegateFetchJson,
    delegateBare: delegateFetchJsonBare,
    findTab: async () => {
      try {
        const tabs = await chrome.tabs.query({ url: ['https://*.digikala.com/*'] });
        return pickDigikalaTab(tabs);
      } catch {
        return undefined;
      }
    },
  };
}

chrome.runtime.onInstalled.addListener(() => {
  // Intentionally minimal beyond badge priming: no alarms, no fetches.
});

export {};
