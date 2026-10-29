/**
 * Content-script entry (manifest content_scripts, isolated world). Detects which
 * surface the current page needs and mounts it. Language: the UI catalog
 * default is fa; the stored setting overrides when present (read
 * fire-and-forget; the button label refreshes when settings arrive late).
 */
import { crawlStartingLines, messages } from '../../shared/i18n/messages';
import { mountPdpSurface } from './pdp';
import { mountCartSurface } from './cart';
import { mountOrdersSurface } from './orders';
import { mountTorobSurface } from './torob';
import { startPathPolling } from './route-watch';
import type { CaptureProgressMessage, CaptureResponse } from '../messaging';

type Lang = 'fa' | 'en';

function currentLang(): Lang {
  // The options page owns uiLanguage; content scripts follow the stored
  // value, defaulting to fa (NFR-08) before settings load.
  return (globalThis as { __dkoptLang?: Lang }).__dkoptLang ?? 'fa';
}

function labels(lang: Lang) {
  const m = messages[lang];
  return {
    addToComparison: m.addToComparison,
    inComparison: m.inComparison,
    capturing: m.capturing,
    captureFailed: m.captureFailed,
    tryAgain: m.tryAgain,
    capturedOffersToast: (count: number, variant: string) =>
      m.capturedOffersToast.replaceAll('{count}', String(count)).replaceAll('{variant}', variant),
    optimizeCart: m.optimizeCart,
    crawlStarting: m.crawlStarting,
    crawlStartingLines: crawlStartingLines[lang],
    crawlRunning: m.crawlRunning,
    crawlStartFailed: m.crawlStartFailed,
    crawlProgress: (done: number, total: number) =>
      m.crawlProgress.replaceAll('{done}', String(done)).replaceAll('{total}', String(total)),
    crawlAborted: m.crawlAborted,
    crawlFinished: (failed: number) => m.crawlFinished.replaceAll('{failed}', String(failed)),
    abort: m.abortCrawl,
    openInsightsFromOrders: m.openInsightsFromOrders,
    torobCta: m.torobCta,
    torobHint: m.torobHint,
    torobLoading: m.torobLoading,
    torobOffersTitle: m.torobOffersTitle,
    torobNoMatch: m.torobNoMatch,
    torobError: m.torobError,
    torobNoOffers: m.torobNoOffers,
    torobSearchOnTorob: m.torobSearchOnTorob,
    torobViewOffer: m.torobViewOffer,
    torobClose: m.torobClose,
    torobCheapest: m.torobCheapest,
    torobShopCount: (count: number) => m.torobShopCount.replaceAll('{count}', String(count)),
    torobPanelNote: m.torobPanelNote,
    torobRangeCta: m.torobRangeCta,
    torobRangeHint: m.torobRangeHint,
    torobRangeTitle: m.torobRangeTitle,
    torobRangeLoading: m.torobRangeLoading,
    torobRangeInstallment: m.torobRangeInstallment,
    torobRangeInstallmentSub: m.torobRangeInstallmentSub,
    torobRangeAny: m.torobRangeAny,
    torobRangeAnySub: m.torobRangeAnySub,
    torobRangeNoListings: m.torobRangeNoListings,
    torobRangeListingCount: (count: number) =>
      m.torobRangeListingCount.replaceAll('{count}', String(count)),
    torobRangeMethod: m.torobRangeMethod,
    torobRangeDeliveryNote: m.torobRangeDeliveryNote,
  };
}

function sendMessage<T = CaptureResponse>(req: unknown): Promise<T> {
  // Sentry-style void: runtime.sendMessage with a callback returns the
  // response; wrapped so errors become { ok:false } shapes, never throws.
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(req, (res: unknown) => {
        void chrome.runtime.lastError; // checked implicitly by shape below
        const fallback = {
          ok: false,
          errorCode: 'UNKNOWN',
          message: 'no response from service worker',
        };
        resolve((res as T) ?? (fallback as T));
      });
    } catch (e) {
      resolve({
        ok: false,
        errorCode: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      } as T);
    }
  });
}

function mount(): void {
  const lang = currentLang();
  const deps = { doc: document, lang, labels: labels(lang), sendMessage };
  // Track mounted surfaces so SPA route changes can destroy them.
  const mounted: Array<{ destroy(): void } | null> = [];
  mounted.push(mountPdpSurface(deps));
  mounted.push(
    mountTorobSurface({
      doc: document,
      lang,
      labels: {
        cta: deps.labels.torobCta,
        hint: deps.labels.torobHint,
        loading: deps.labels.torobLoading,
        offersTitle: deps.labels.torobOffersTitle,
        noMatch: deps.labels.torobNoMatch,
        error: deps.labels.torobError,
        noOffers: deps.labels.torobNoOffers,
        searchOnTorob: deps.labels.torobSearchOnTorob,
        viewOffer: deps.labels.torobViewOffer,
        close: deps.labels.torobClose,
        cheapest: deps.labels.torobCheapest,
        shopCount: deps.labels.torobShopCount,
        note: deps.labels.torobPanelNote,
        rangeCta: deps.labels.torobRangeCta,
        rangeHint: deps.labels.torobRangeHint,
        rangeTitle: deps.labels.torobRangeTitle,
        rangeLoading: deps.labels.torobRangeLoading,
        rangeInstallment: deps.labels.torobRangeInstallment,
        rangeInstallmentSub: deps.labels.torobRangeInstallmentSub,
        rangeAny: deps.labels.torobRangeAny,
        rangeAnySub: deps.labels.torobRangeAnySub,
        rangeNoListings: deps.labels.torobRangeNoListings,
        rangeListingCount: deps.labels.torobRangeListingCount,
        rangeMethod: deps.labels.torobRangeMethod,
        rangeDeliveryNote: deps.labels.torobRangeDeliveryNote,
      },
      sendMessage: deps.sendMessage,
    }),
  );
  mounted.push(
    mountCartSurface({
      ...deps,
      onProgress(cb) {
        const listener = (msg: unknown) => {
          if (
            typeof msg === 'object' &&
            msg !== null &&
            (msg as { kind?: string }).kind === 'capture/progress'
          ) {
            cb(msg as CaptureProgressMessage);
          }
        };
        chrome.runtime.onMessage.addListener(listener);
        return () => chrome.runtime.onMessage.removeListener(listener);
      },
    }),
  );
  mounted.push(
    mountOrdersSurface({
      doc: document,
      lang,
      label: deps.labels.openInsightsFromOrders,
      sendMessage,
    }),
  );
  surfaces = mounted;
}

let surfaces: Array<{ destroy(): void } | null> | null = null;

// D-16: delegated crawl fetches run in this page's
// main world, injected directly by the service
// worker via chrome.scripting.executeScript (see
// fetch/delegate.ts) - the content script only
// mounts surfaces.

mount();

/**
 * SPA route tracking (live site reality): Digikala is a single-page app.
 * The content script runs ONCE at document_idle, but PDP/cart pages render
 * through client-side navigation. On every route change, surfaces must be
 * destroyed and remounted against the new location - otherwise the button
 * only ever appears on the page the user FIRST landed on.
 */
let lastPath = location.pathname;

function remountIfRouteChanged(): void {
  if (location.pathname === lastPath) return;
  lastPath = location.pathname;
  // Destroy the previous page's surfaces (they belong to removed DOM).
  for (const s of surfaces ?? []) s?.destroy();
  surfaces = null;
  // Give the SPA a beat to render the new route, then mount fresh.
  setTimeout(mount, 300);
}

// Patch pushState/replaceState + popstate: the immediate SPA navigation
// signal. Firefox's Xray wrappers can keep a content-script patch invisible
// to the page's own calls (D-46), so the pathname poll below is the
// portable fallback; both paths converge on the same idempotent remount.
for (const name of ['pushState', 'replaceState'] as const) {
  try {
    const original = history[name].bind(history) as (
      ...args: Parameters<typeof history.pushState>
    ) => void;
    Object.defineProperty(history, name, {
      value: (...args: Parameters<typeof history.pushState>) => {
        original(...args);
        remountIfRouteChanged();
      },
      writable: true,
      configurable: true,
    });
  } catch (error) {
    console.warn(
      `[dkopt] history.${name} patch unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
window.addEventListener('popstate', remountIfRouteChanged);
const stopPathPolling = startPathPolling(remountIfRouteChanged, location, 500);
window.addEventListener('pagehide', stopPathPolling, { once: true });
