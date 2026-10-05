/**
 * Content-script entry (manifest content_scripts main world). Detects which
 * surface the current page needs and mounts it. Language: the UI catalog
 * default is fa; the stored setting overrides when present (read
 * fire-and-forget; the button label refreshes when settings arrive late).
 */
import { messages } from '../../shared/i18n/messages';
import { mountPdpSurface } from './pdp';
import { mountCartSurface } from './cart';
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
    crawlProgress: (done: number, total: number) =>
      m.crawlProgress.replaceAll('{done}', String(done)).replaceAll('{total}', String(total)),
    crawlAborted: m.crawlAborted,
    crawlFinished: (failed: number) => m.crawlFinished.replaceAll('{failed}', String(failed)),
    abort: m.abortCrawl,
  };
}

function sendMessage(req: unknown): Promise<CaptureResponse> {
  // Sentry-style void: runtime.sendMessage with a callback returns the
  // response; wrapped so errors become { ok:false } shapes, never throws.
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage(req, (res: unknown) => {
        void chrome.runtime.lastError; // checked implicitly by shape below
        resolve(
          (res as CaptureResponse) ?? {
            ok: false,
            errorCode: 'UNKNOWN',
            message: 'no response from service worker',
          },
        );
      });
    } catch (e) {
      resolve({
        ok: false,
        errorCode: 'UNKNOWN',
        message: e instanceof Error ? e.message : String(e),
      });
    }
  });
}

function mount(): void {
  const lang = currentLang();
  const deps = { doc: document, lang, labels: labels(lang), sendMessage };
  mountPdpSurface(deps);
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
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
