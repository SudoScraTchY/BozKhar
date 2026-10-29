/**
 * @vitest-environment jsdom
 *
 * Content-script surface tests with DOM fakes (no real browser, per the
 * task note). Covers the PDP button state machine + toast wording, and the
 * cart button + progress overlay + abort control.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mountPdpSurface } from '../src/capture/content/pdp';
import { mountCartSurface } from '../src/capture/content/cart';
import { mountOrdersSurface } from '../src/capture/content/orders';
import {
  mountTorobSurface,
  torobQueryFromPage,
  torobSearchUrl,
} from '../src/capture/content/torob';
import type { TorobRangeResponse, TorobResponse } from '../src/torob/api';
import type { CaptureProgressMessage, CaptureResponse } from '../src/capture/messaging';

const PDP_LABELS = {
  addToComparison: 'افزودن به مقایسه',
  inComparison: 'در مقایسه',
  capturing: 'در حال دریافت…',
  captureFailed: 'دریافت ناموفق بود',
  tryAgain: 'تلاش دوباره',
  capturedOffersToast: (count: number, variant: string) =>
    `برای «${variant}»، ${count} فروشنده ثبت شد.`,
};

const CART_LABELS = {
  optimizeCart: 'بهینه‌سازی سبد خرید',
  crawlStarting: 'در حال شروع…',
  crawlStartingLines: ['یک…', 'دو…', 'سه…'],
  crawlRunning: 'در حال بررسی…',
  crawlStartFailed: 'ارتباط با سرویس‌دهنده برقرار نشد',
  crawlProgress: (done: number, total: number) => `بررسی ${done} از ${total}…`,
  crawlAborted: 'متوقف شد',
  crawlFinished: (failed: number) => `کامل شد؛ ${failed} ناموفق`,
  abort: 'توقف',
};

const PDP_URL = 'https://www.digikala.com/product/dkp-1001/?variant_id=2001';
const PDP_PATH = '/product/dkp-1001/x/';
const CART_URL = 'https://www.digikala.com/cart/';
const CART_PATH = '/cart/';

let currentLocation = { href: PDP_URL, pathname: PDP_PATH };
function setLocation(href: string, pathname: string): void {
  // The surfaces read location via the injected deps object, so a plain
  // mutable holder is enough - no jsdom location redefinition needed.
  currentLocation = { href, pathname };
}

describe('PDP surface (T03.4)', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<div class="title-block"><div class="title-row"><h1>گوشی موبایل سامسونگ</h1></div></div>';
    setLocation(PDP_URL, PDP_PATH);
  });

  it('mounts the button and walks idle -> capturing -> added, showing the toast', async () => {
    let resolveMsg: (r: CaptureResponse) => void = () => {};
    const sendMessage = vi.fn(() => new Promise<CaptureResponse>((res) => (resolveMsg = res)));
    const surface = mountPdpSurface({
      doc: document,
      location: currentLocation,
      lang: 'fa',
      labels: PDP_LABELS,
      sendMessage,
    });
    expect(surface).not.toBeNull();

    const btn = document.querySelector('button.dkopt-btn') as HTMLButtonElement;
    expect(btn.textContent).toBe('افزودن به مقایسه');
    expect(btn.dataset.state).toBe('idle');

    btn.click();
    expect(btn.dataset.state).toBe('capturing');
    expect(sendMessage).toHaveBeenCalledWith({
      kind: 'capture/pdp',
      productId: '1001',
      variantId: '2001',
    });
    resolveMsg({ ok: true, kind: 'pdp', snapshotId: 's1', offerCount: 4, variantLabel: 'نسخه ۶۴' });
    await vi.waitFor(() => expect(btn.dataset.state).toBe('added'));
    expect(btn.textContent).toBe('در مقایسه');
    // The icon is part of the button chrome; a state label change must not
    // wipe it (setState updates only the label span).
    expect(btn.querySelector('.dkopt-btn-icon svg')).not.toBeNull();
    const toast = document.querySelector('.dkopt-toast') as HTMLElement;
    // Toast names the variant and the offer count (D-05, 09 Surface 1).
    expect(toast.textContent).toContain('نسخه ۶۴');
    expect(toast.textContent).toContain('4');
    surface?.destroy();
  });

  it('mounts late (SPA): anchor appearing after hydration still gets the button', async () => {
    // Live smoke finding: Digikala hydrates the product title seconds after idle.
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<div></div>'; // no anchor yet
      const surface = mountPdpSurface({
        doc: document,
        location: currentLocation,
        lang: 'fa',
        labels: PDP_LABELS,
        sendMessage: async () => ({
          ok: true,
          kind: 'pdp',
          snapshotId: 's',
          offerCount: 1,
          variantLabel: 'v',
        }),
      });
      expect(surface).not.toBeNull();
      expect(document.querySelector('button.dkopt-btn')).toBeNull();

      // anchor appears: the MutationObserver attaches on the
      // mutation itself (async advance flushes the observer task).
      document.body.innerHTML = '<h1>گوشی موبایل سامسونگ</h1>';
      await vi.advanceTimersByTimeAsync(0);
      const btn = document.querySelector('button.dkopt-btn') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.dataset.state).toBe('idle');
      surface?.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('attaches when the product title renders after mount (rate-limit hardened)', async () => {
    // No anchor at document_idle (SPA not hydrated yet - the
    // 2026-10-07 live smoke: hydration can take minutes under
    // site rate-limiting; the old 30s poll expired first).
    document.body.innerHTML = '<main></main>';
    const surface = mountPdpSurface({
      doc: document,
      location: currentLocation,
      lang: 'fa',
      labels: PDP_LABELS,
      sendMessage: async () => ({ ok: false, errorCode: 'UNUSED', message: 'x' }),
    });
    expect(document.querySelector('button.dkopt-btn')).toBeNull();

    // The SPA renders the title late: the MutationObserver
    // attaches the button the moment it exists.
    document.body.innerHTML = '<h1>گوشی موبایل سامسونگ</h1>';
    await new Promise((r) => setTimeout(r, 0));
    const btn = document.querySelector('button.dkopt-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.dataset.state).toBe('idle');
    surface?.destroy();
    expect(document.querySelector('button.dkopt-btn')).toBeNull();
  });

  it('mounts the action row under the title, not in the buy box', () => {
    document.body.innerHTML =
      '<div class="title-block"><div class="title-row"><h1 data-testid="pdp-title">گوشی موبایل سامسونگ</h1></div></div>' +
      '<div data-testid="buy-box"></div>';
    const surface = mountPdpSurface({
      doc: document,
      location: currentLocation,
      lang: 'fa',
      labels: PDP_LABELS,
      sendMessage: vi.fn(async (): Promise<CaptureResponse> => ({
        ok: true,
        kind: 'pdp',
        snapshotId: 's',
        offerCount: 1,
        variantLabel: 'v',
      })),
    });
    const actions = document.querySelector('.dkopt-pdp-actions') as HTMLElement;
    expect(actions).not.toBeNull();
    expect(actions.previousElementSibling).toBe(document.querySelector('.title-row'));
    expect(actions.closest('.title-block')).not.toBeNull();
    expect(document.querySelector('[data-testid="buy-box"]')?.contains(actions)).toBe(false);
    surface?.destroy();
    expect(document.querySelector('.dkopt-pdp-actions')).toBeNull();
  });

  it('sends empty variantId when the URL has none (SW resolves from payload)', async () => {
    setLocation('https://www.digikala.com/product/dkp-1001/', '/product/dkp-1001/');
    const sendMessage = vi.fn(async (): Promise<CaptureResponse> => ({
      ok: true,
      kind: 'pdp',
      snapshotId: 's2',
      offerCount: 2,
      variantLabel: 'resolved-variant',
    }));
    const surface = mountPdpSurface({
      doc: document,
      location: currentLocation,
      lang: 'fa',
      labels: PDP_LABELS,
      sendMessage,
    });
    const btn = document.querySelector('button.dkopt-btn') as HTMLButtonElement;
    btn.click();
    await vi.waitFor(() =>
      expect(sendMessage).toHaveBeenCalledWith({
        kind: 'capture/pdp',
        productId: '1001',
        variantId: '',
      }),
    );
    surface?.destroy();
  });

  it('shows a failed state + inline message on error, never a silent no-op', async () => {
    const surface = mountPdpSurface({
      doc: document,
      location: currentLocation,
      lang: 'fa',
      labels: PDP_LABELS,
      sendMessage: async () => ({ ok: false, errorCode: 'HTTP_STATUS', message: 'HTTP 403' }),
    });
    const btn = document.querySelector('button.dkopt-btn') as HTMLButtonElement;
    btn.click();
    await vi.waitFor(() => expect(btn.dataset.state).toBe('failed'));
    expect(document.querySelector('.dkopt-toast')?.textContent).toContain('HTTP 403');
    surface?.destroy();
  });

  it('does not mount off a PDP path', () => {
    setLocation(CART_URL, CART_PATH);
    const surface = mountPdpSurface({
      doc: document,
      location: currentLocation,
      lang: 'fa',
      labels: PDP_LABELS,
      sendMessage: vi.fn(),
    });
    expect(surface).toBeNull();
    expect(document.querySelector('button.dkopt-btn')).toBeNull();
  });
});

describe('Cart surface (T03.5)', () => {
  beforeEach(() => {
    document.body.innerHTML =
      '<section class="cart-summary"><div class="cart-summary"></div></section>';
    setLocation(CART_URL, CART_PATH);
  });

  it('starts the crawl, renders progress, and clears on finish', async () => {
    let progressCb: ((m: CaptureProgressMessage) => void) | null = null;
    const sendMessage = vi.fn(async (req: unknown): Promise<CaptureResponse> => {
      if ((req as { kind: string }).kind === 'capture/crawl-start') {
        progressCb?.({ kind: 'capture/progress', step: 1, total: 3, done: 1, failed: 0 });
        progressCb?.({
          kind: 'capture/progress',
          step: 3,
          total: 3,
          done: 2,
          failed: 1,
          finished: true,
          aborted: false,
        });
        return { ok: true, kind: 'crawl-start', itemCount: 3, done: 2, failed: 1 };
      }
      return { ok: true, kind: 'crawl-abort' };
    });

    const surface = mountCartSurface({
      doc: document,
      location: currentLocation,
      labels: CART_LABELS,
      sendMessage,
      onProgress(cb) {
        progressCb = cb;
        return () => (progressCb = null);
      },
    });
    const btn = document.querySelector('button.dkopt-btn') as HTMLButtonElement;
    expect(btn.textContent).toBe('بهینه‌سازی سبد خرید');
    btn.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.dkopt-toast')?.textContent).toContain('کامل شد؛ 1 ناموفق'),
    );
    expect(document.querySelector('.dkopt-progress')).toBeNull();
    surface?.destroy();
  });

  it('fails loudly when the service worker does not answer (no eternal overlay)', async () => {
    // Live report 2026-10-08: the overlay sat on
    // "starting..." forever when no service worker
    // answered the crawl-start message.
    const sendMessage = vi.fn(async (): Promise<CaptureResponse> => {
      throw new Error('Could not establish connection. Receiving end does not exist.');
    });
    const surface = mountCartSurface({
      doc: document,
      location: currentLocation,
      labels: CART_LABELS,
      sendMessage,
      onProgress() {
        return () => undefined;
      },
    });
    const btn = document.querySelector('button.dkopt-btn') as HTMLButtonElement;
    btn.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.dkopt-toast')?.textContent).toContain(
        'ارتباط با سرویس‌دهنده برقرار نشد',
      ),
    );
    expect(document.querySelector('.dkopt-progress')).toBeNull();
    surface?.destroy();
  });

  it('re-sends the crawl-start when the cold worker never answers (D-21)', async () => {
    // Live finding 2026-10-09: a cold MV3
    // worker woken by the message can hang on
    // its first chrome API call - the start
    // promise never settles. The surface
    // re-sends after the response timeout and
    // the fresh worker (Chrome kills the
    // wedged one after ~30s) answers.
    vi.useFakeTimers();
    let progressCb: ((m: CaptureProgressMessage) => void) | null = null;
    let starts = 0;
    const sendMessage = vi.fn(async (req: unknown): Promise<CaptureResponse> => {
      if ((req as { kind: string }).kind === 'capture/crawl-start') {
        starts += 1;
        if (starts === 1) {
          // Wedged cold worker: never answers.
          return new Promise<CaptureResponse>(() => {});
        }
        progressCb?.({
          kind: 'capture/progress',
          step: 1,
          total: 1,
          done: 1,
          failed: 0,
          finished: true,
          aborted: false,
        });
        return {
          ok: true,
          kind: 'crawl-start',
          itemCount: 1,
          done: 1,
          failed: 0,
        };
      }
      return { ok: true, kind: 'crawl-abort' };
    });
    const surface = mountCartSurface({
      doc: document,
      location: currentLocation,
      labels: CART_LABELS,
      sendMessage,
      onProgress(cb) {
        progressCb = cb;
        return () => (progressCb = null);
      },
    });
    const btn = document.querySelector('button.dkopt-btn') as HTMLButtonElement;
    btn.click();
    expect(starts).toBe(1);

    // Past the 35s response timeout the start
    // is re-sent; the fresh worker answers and
    // the finish toast renders (overlay gone).
    await vi.advanceTimersByTimeAsync(38_000);
    expect(starts).toBe(2);
    expect(document.querySelector('.dkopt-toast')?.textContent).toContain('کامل شد');
    expect(document.querySelector('.dkopt-progress')).toBeNull();
    surface?.destroy();
    vi.useRealTimers();
  });

  it('attaches when the summary card renders after mount (rate-limit hardened)', async () => {
    // Cart page before the SPA hydrates the summary card.
    document.body.innerHTML = '<main></main>';
    const surface = mountCartSurface({
      doc: document,
      location: currentLocation,
      labels: CART_LABELS,
      sendMessage: async () => ({
        ok: true,
        kind: 'crawl-start',
        itemCount: 0,
        done: 0,
        failed: 0,
      }),
      onProgress() {
        return () => {};
      },
    });
    expect(document.querySelector('button.dkopt-btn')).toBeNull();

    // The summary card renders late: attach on the mutation.
    const card = document.createElement('div');
    card.className = 'bg-neutral-000 rounded shadow-3-bottom';
    document.body.appendChild(card);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.querySelector('button.dkopt-btn')).not.toBeNull();
    surface?.destroy();
    expect(document.querySelector('button.dkopt-btn')).toBeNull();
  });

  it('the overlay abort control sends crawl-abort', async () => {
    const seen: string[] = [];
    let crawlSettled = false;
    const sendMessage = vi.fn(async (req: unknown): Promise<CaptureResponse> => {
      const kind = (req as { kind: string }).kind;
      seen.push(kind);
      if (kind === 'capture/crawl-abort') return { ok: true, kind: 'crawl-abort' };
      // Hold the crawl-start response until the abort click
      // has been observed: the response now closes the
      // overlay (it carries the final counts), so a
      // synchronous return would race the abort button.
      await vi.waitFor(() => expect(crawlSettled).toBe(true));
      return { ok: true, kind: 'crawl-start', itemCount: 2, done: 0, failed: 0 };
    });
    const surface = mountCartSurface({
      doc: document,
      location: currentLocation,
      labels: CART_LABELS,
      sendMessage,
      onProgress: () => () => {},
    });
    (document.querySelector('button.dkopt-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('.dkopt-progress')).not.toBeNull());
    const abortBtn = document.querySelector('.dkopt-progress button') as HTMLButtonElement;
    expect(abortBtn.textContent).toBe('توقف');
    abortBtn.click();
    crawlSettled = true;
    await vi.waitFor(() => expect(seen).toContain('capture/crawl-abort'));
    surface?.destroy();
  });

  it('cycles the opening lines until real progress arrives (D-36)', async () => {
    vi.useFakeTimers();
    try {
      // Deterministic "random": the pick walks 0 -> 1 -> ... and the delay
      // sits at its 1.4s floor.
      vi.spyOn(Math, 'random').mockReturnValue(0);
      let progressCb: ((m: CaptureProgressMessage) => void) | null = null;
      const emitProgress = (m: CaptureProgressMessage) => progressCb?.(m);
      const sendMessage = vi.fn(async (_req: unknown): Promise<CaptureResponse> => {
        return new Promise<CaptureResponse>(() => {}); // a crawl that stays open
      });
      const surface = mountCartSurface({
        doc: document,
        location: currentLocation,
        labels: CART_LABELS,
        sendMessage,
        onProgress(cb) {
          progressCb = cb;
          return () => (progressCb = null);
        },
      });
      (document.querySelector('button.dkopt-btn') as HTMLButtonElement).click();
      const overlayText = () => document.querySelector('.dkopt-progress span')?.textContent;
      expect(overlayText()).toBe('در حال شروع…');

      await vi.advanceTimersByTimeAsync(1400);
      expect(CART_LABELS.crawlStartingLines).toContain(overlayText() as string);
      const first = overlayText();
      await vi.advanceTimersByTimeAsync(1400);
      expect(overlayText()).not.toBe(first);

      // Real progress wins, and the loop never speaks again.
      emitProgress({ kind: 'capture/progress', step: 1, total: 2, done: 1, failed: 0 });
      expect(overlayText()).toBe('بررسی 1 از 2…');
      await vi.advanceTimersByTimeAsync(10_000);
      expect(overlayText()).toBe('بررسی 1 از 2…');
      surface?.destroy();
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it('keeps the background alive while the crawl response is pending (D-46)', async () => {
    vi.useFakeTimers();
    try {
      let settle: (res: CaptureResponse) => void = () => {};
      const sendMessage = vi.fn((req: unknown): Promise<CaptureResponse> => {
        if ((req as { kind: string }).kind === 'capture/crawl-start') {
          return new Promise<CaptureResponse>((resolve) => {
            settle = resolve;
          });
        }
        return Promise.resolve({ ok: true, kind: 'crawl-abort' });
      });
      const surface = mountCartSurface({
        doc: document,
        location: currentLocation,
        labels: CART_LABELS,
        sendMessage,
        onProgress: () => () => {},
      });
      (document.querySelector('button.dkopt-btn') as HTMLButtonElement).click();

      const keepalives = () =>
        sendMessage.mock.calls.filter(
          ([req]) => (req as { kind?: string }).kind === 'runtime/keepalive',
        ).length;

      await vi.advanceTimersByTimeAsync(30_000);
      expect(keepalives()).toBe(3);

      settle({ ok: true, kind: 'crawl-start', itemCount: 1, done: 1, failed: 0 });
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector('.dkopt-progress')).toBeNull();
      await vi.advanceTimersByTimeAsync(20_000);
      expect(keepalives()).toBe(3);
      surface?.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('closes the overlay from the response when the finished broadcast is missed', async () => {
    // Live report 2026-10-08: the crawl completed but
    // the final progress broadcast never reached the
    // content script, leaving the overlay up forever.
    // The crawl-start response now carries the final
    // counts and closes the overlay itself.
    const surface = mountCartSurface({
      doc: document,
      location: currentLocation,
      labels: CART_LABELS,
      sendMessage: async () => ({
        ok: true,
        kind: 'crawl-start',
        itemCount: 2,
        done: 2,
        failed: 0,
      }),
      onProgress: () => () => {},
    });
    (document.querySelector('button.dkopt-btn') as HTMLButtonElement).click();
    await vi.waitFor(() => expect(document.querySelector('.dkopt-progress')).not.toBeNull());
    // The response resolves: the overlay must close and
    // the finished toast must appear - no eternal overlay.
    await vi.waitFor(() => expect(document.querySelector('.dkopt-progress')).toBeNull());
    expect(document.body.textContent).toContain('کامل شد؛ 0 ناموفق');
    surface?.destroy();
  });

  it('mounts late (SPA): cart summary hydrating after idle still gets the button', async () => {
    vi.useFakeTimers();
    try {
      document.body.innerHTML = '<main></main>'; // no anchor yet
      const surface = mountCartSurface({
        doc: document,
        location: currentLocation,
        labels: CART_LABELS,
        sendMessage: async () => ({
          ok: true,
          kind: 'crawl-start',
          itemCount: 1,
          done: 0,
          failed: 0,
        }),
        onProgress: () => () => {},
      });
      expect(surface).not.toBeNull();
      expect(document.querySelector('button.dkopt-btn')).toBeNull();

      // summary card appears: the MutationObserver attaches on
      // the mutation itself (async advance flushes the task).
      document.body.innerHTML = '<section class="cart-summary"></section>';
      await vi.advanceTimersByTimeAsync(0);
      expect(document.querySelector('button.dkopt-btn')).not.toBeNull();
      surface?.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not mount off the cart path', () => {
    setLocation(PDP_URL, PDP_PATH);
    const surface = mountCartSurface({
      doc: document,
      location: currentLocation,
      labels: CART_LABELS,
      sendMessage: vi.fn(),
      onProgress: () => () => {},
    });
    expect(surface).toBeNull();
  });
});

describe('Torob surface', () => {
  const TOROB_LABELS = {
    cta: 'مقایسه قیمت در ترب',
    hint: 'ارزان‌ترین فروشنده‌ها را ببینید',
    loading: 'در حال گرفتن قیمت‌ها…',
    offersTitle: 'ارزان‌ترین فروشنده‌های ترب',
    noMatch: 'محصولی پیدا نشد',
    error: 'دریافت قیمت ناموفق بود',
    noOffers: 'فروشندهٔ فعالی نیست',
    searchOnTorob: 'جست‌وجو در ترب',
    viewOffer: 'مشاهده',
    close: 'بستن',
    cheapest: 'کمترین قیمت',
    shopCount: (count: number) => `${count} فروشنده`,
    note: 'قیمت‌ها از ترب',
    rangeCta: 'بازه قیمت در ترب',
    rangeHint: 'بازه قیمت همه لیستینگ‌ها',
    rangeTitle: 'بازه قیمت در ترب',
    rangeLoading: 'در حال حساب کردن بازه…',
    rangeInstallment: 'قسطی',
    rangeInstallmentSub: 'فقط خرید قسطی ترب‌پی',
    rangeAny: 'بدون فیلتر',
    rangeAnySub: 'همه لیستینگ‌های هم‌مدل',
    rangeNoListings: 'لیستینگی در این دسته پیدا نشد.',
    rangeListingCount: (count: number) => `${count} لیستینگ`,
    rangeMethod: 'کمینه تا سومین قیمت ارزان‌تر',
    rangeDeliveryNote: 'هزینه ارسال قابل محاسبه نیست؛ این بازه فقط قیمت کالاست.',
  };

  const COMPARISON = {
    query: 'گوشی موبایل سامسونگ',
    searchUrl: torobSearchUrl('گوشی موبایل سامسونگ'),
    productName: 'گوشی سامسونگ',
    productUrl: 'https://torob.com/p/product/',
    offers: [
      {
        shopName: 'فروشگاه الف',
        city: 'تهران',
        priceToman: 1_000_000,
        url: 'https://api.torob.com/v4/product-page/redirect/?prk=a',
        scoreText: '★۵',
        postage: null,
      },
      {
        shopName: 'فروشگاه ب',
        city: null,
        priceToman: 2_000_000,
        url: null,
        scoreText: null,
        postage: 'هزینه ارسال ۵۰٬۰۰۰ تومان',
      },
    ],
    shopCount: 12,
  };

  const RANGE: TorobRangeResponse = {
    ok: true,
    kind: 'torob/range',
    range: {
      query: 'گوشی موبایل سامسونگ',
      searchUrl: torobSearchUrl('گوشی موبایل سامسونگ'),
      categories: [
        {
          category: 'installment',
          minToman: 1_200_000,
          upperToman: 1_500_000,
          upperBasis: 3,
          pricesToman: [1_200_000, 1_350_000, 1_500_000],
          listingCount: 5,
          listings: [],
        },
        {
          category: 'any',
          minToman: 1_000_000,
          upperToman: 1_000_000,
          upperBasis: 1,
          pricesToman: [1_000_000],
          listingCount: 1,
          listings: [],
        },
      ],
    },
  };

  function torobDeps(sendMessage: (req: unknown) => Promise<TorobResponse | TorobRangeResponse>) {
    return {
      doc: document,
      location: currentLocation,
      lang: 'fa' as const,
      labels: TOROB_LABELS,
      sendMessage,
    };
  }

  beforeEach(() => {
    document.body.innerHTML = '<h1>گوشی موبایل سامسونگ</h1>';
    document.title = '';
    setLocation(PDP_URL, PDP_PATH);
  });

  it('builds an encoded Torob search URL', () => {
    expect(torobSearchUrl('گوشی سامسونگ')).toBe(
      `https://torob.com/search/?query=${encodeURIComponent('گوشی سامسونگ')}`,
    );
  });

  it('reads the heading first and falls back to the URL slug', () => {
    expect(torobQueryFromPage(document, PDP_URL)).toBe('گوشی موبایل سامسونگ');
    document.body.innerHTML = '';
    document.title = 'عنوان نامطمئن صفحه';
    expect(torobQueryFromPage(document, 'https://www.digikala.com/product/dkp-1/cool-phone/')).toBe(
      'cool phone',
    );
    // A bare dkp path has no query; the trigger waits for the heading
    // instead of trusting document.title.
    expect(torobQueryFromPage(document, 'https://www.digikala.com/product/dkp-1/')).toBeNull();
  });

  it('waits for a late heading on a bare dkp URL before mounting', async () => {
    document.body.innerHTML = '';
    setLocation('https://www.digikala.com/product/dkp-1001/', '/product/dkp-1001/');
    const surface = mountTorobSurface(
      torobDeps(async () => ({ ok: true, kind: 'torob/compare', comparison: COMPARISON })),
    );
    expect(surface).not.toBeNull();
    expect(document.getElementById('dkopt-torob')).toBeNull();

    const heading = document.createElement('h1');
    heading.textContent = 'گوشی سامسونگ گلکسی';
    document.body.appendChild(heading);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const link = document.getElementById('dkopt-torob') as HTMLAnchorElement;
    expect(link).not.toBeNull();
    expect(link.getAttribute('href')).toBe(torobSearchUrl('گوشی سامسونگ گلکسی'));
    surface?.destroy();
  });

  it('mounts a safe trigger and renders the top Torob sellers on click', async () => {
    const sendMessage = vi.fn(async (): Promise<TorobResponse> => ({
      ok: true,
      kind: 'torob/compare',
      comparison: COMPARISON,
    }));
    const surface = mountTorobSurface(torobDeps(sendMessage));
    expect(surface).not.toBeNull();

    const link = document.getElementById('dkopt-torob') as HTMLAnchorElement;
    expect(link.textContent).toBe('مقایسه قیمت در ترب');
    expect(link.getAttribute('href')).toBe(torobSearchUrl('گوشی موبایل سامسونگ'));
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');

    link.click();
    expect(sendMessage).toHaveBeenCalledWith({
      kind: 'torob/compare',
      query: 'گوشی موبایل سامسونگ',
    });
    await vi.waitFor(() => expect(document.querySelector('.dkopt-torob-panel')).not.toBeNull());

    const panel = document.querySelector('.dkopt-torob-panel') as HTMLElement;
    expect(panel.textContent).toContain('ارزان‌ترین فروشنده‌های ترب');
    expect(panel.textContent).toContain('فروشگاه الف');
    expect(panel.textContent).toContain('کمترین قیمت');
    expect(panel.textContent).toContain('هزینه ارسال');
    expect(panel.querySelectorAll('.dkopt-torob-offer')).toHaveLength(2);
    expect(link.getAttribute('aria-expanded')).toBe('true');

    surface?.destroy();
    expect(document.getElementById('dkopt-torob')).toBeNull();
    expect(document.querySelector('.dkopt-torob-panel')).toBeNull();
  });

  it('renders both Torob range categories and states delivery cannot be calculated', async () => {
    const sendMessage = vi.fn(async (): Promise<TorobResponse | TorobRangeResponse> => RANGE);
    const surface = mountTorobSurface(torobDeps(sendMessage));
    expect(surface).not.toBeNull();

    const rangeButton = document.getElementById('dkopt-torob-range') as HTMLButtonElement;
    expect(rangeButton.textContent).toBe('بازه قیمت در ترب');
    rangeButton.click();
    expect(sendMessage).toHaveBeenCalledWith({
      kind: 'torob/range',
      query: 'گوشی موبایل سامسونگ',
    });
    await vi.waitFor(() => expect(document.querySelector('.dkopt-range-cat')).not.toBeNull());

    const panel = document.querySelector('.dkopt-torob-panel') as HTMLElement;
    const categories = panel.querySelectorAll('.dkopt-range-cat');
    expect(categories).toHaveLength(2);
    expect(categories[0]!.textContent).toContain('قسطی');
    expect(categories[1]!.textContent).toContain('بدون فیلتر');

    const fmt = new Intl.NumberFormat('fa-IR');
    expect(panel.textContent).toContain(`${fmt.format(1_200_000)} تومان`);
    expect(panel.textContent).toContain(`${fmt.format(1_500_000)} تومان`);
    expect(panel.textContent).toContain('هزینه ارسال قابل محاسبه نیست');
    expect(panel.textContent).toContain('5 لیستینگ');
    expect(rangeButton.getAttribute('aria-expanded')).toBe('true');

    const compareLink = document.getElementById('dkopt-torob') as HTMLAnchorElement;
    compareLink.click();
    await vi.waitFor(() =>
      expect(document.querySelector('.dkopt-torob-panel')?.textContent).toContain(
        'ارزان‌ترین فروشنده‌های ترب',
      ),
    );
    expect(sendMessage).toHaveBeenCalledWith({
      kind: 'torob/compare',
      query: 'گوشی موبایل سامسونگ',
    });

    surface?.destroy();
    expect(document.getElementById('dkopt-torob-range')).toBeNull();
  });

  it('keeps the search link when the comparison fails', async () => {
    const surface = mountTorobSurface(
      torobDeps(async () => ({ ok: false, errorCode: 'NETWORK', message: 'offline' })),
    );
    (document.getElementById('dkopt-torob') as HTMLAnchorElement).click();
    await vi.waitFor(() =>
      expect(document.querySelector('.dkopt-torob-panel')?.textContent).toContain(
        'دریافت قیمت ناموفق بود',
      ),
    );
    const search = document.querySelector('.dkopt-torob-search') as HTMLAnchorElement;
    expect(search.href).toBe(torobSearchUrl('گوشی موبایل سامسونگ'));
    surface?.destroy();
  });

  it('mounts under the product title, not in the buy row', () => {
    document.body.innerHTML =
      '<h1>گوشی موبایل سامسونگ</h1><div class="buy-row"><div data-testid="buy-box"></div></div>';
    const surface = mountTorobSurface(
      torobDeps(async () => ({ ok: true, kind: 'torob/compare', comparison: COMPARISON })),
    );
    const link = document.getElementById('dkopt-torob') as HTMLAnchorElement;
    const actions = document.querySelector('.dkopt-pdp-actions') as HTMLElement;
    expect(actions.previousElementSibling).toBe(document.querySelector('h1'));
    expect(actions.contains(link)).toBe(true);
    expect(document.querySelector('.buy-row')?.contains(link)).toBe(false);
    surface?.destroy();
  });

  it('places the trigger inside the desktop title section, above the buy box', () => {
    document.body.innerHTML =
      '<div class="InfoSection__title"><div class="title-row"><h1 data-testid="pdp-title">گوشی موبایل سامسونگ</h1></div></div>' +
      '<div data-testid="buy-box"></div>';
    const surface = mountTorobSurface(
      torobDeps(async () => ({ ok: true, kind: 'torob/compare', comparison: COMPARISON })),
    );
    const link = document.getElementById('dkopt-torob') as HTMLAnchorElement;
    const actions = document.querySelector('.dkopt-pdp-actions') as HTMLElement;
    expect(actions.previousElementSibling).toBe(document.querySelector('.title-row'));
    expect(actions.closest('.InfoSection__title')).not.toBeNull();
    expect(actions.contains(link)).toBe(true);
    expect(document.querySelector('[data-testid="buy-box"]')?.contains(link)).toBe(false);
    surface?.destroy();
  });

  it('keeps both BozKhar actions in the title row', () => {
    document.body.innerHTML =
      '<div class="title-block"><div class="title-row"><h1>گوشی موبایل سامسونگ</h1></div></div>' +
      '<div class="buy-row"><div data-testid="sellers-cta"></div></div>';
    const torob = mountTorobSurface(
      torobDeps(async () => ({ ok: true, kind: 'torob/compare', comparison: COMPARISON })),
    );
    const pdp = mountPdpSurface({
      doc: document,
      location: currentLocation,
      lang: 'fa',
      labels: PDP_LABELS,
      sendMessage: vi.fn(async (): Promise<CaptureResponse> => ({
        ok: true,
        kind: 'pdp',
        snapshotId: 's',
        offerCount: 1,
        variantLabel: 'v',
      })),
    });

    const actions = document.querySelector('.dkopt-pdp-actions') as HTMLElement;
    expect(actions).not.toBeNull();
    const button = actions.querySelector('button.dkopt-btn') as HTMLButtonElement;
    const link = document.getElementById('dkopt-torob') as HTMLAnchorElement;
    expect(button).not.toBeNull();
    expect(button.classList.contains('dkopt-btn-pdp')).toBe(true);
    expect(button.querySelector('.dkopt-btn-icon svg')).not.toBeNull();
    expect(actions.firstElementChild).toBe(button);
    expect(button.nextElementSibling).toBe(link);
    expect(actions.previousElementSibling).toBe(document.querySelector('.title-row'));
    expect(document.querySelector('.buy-row')?.contains(actions)).toBe(false);

    pdp?.destroy();
    torob?.destroy();
  });

  it('does not mount off a product page', () => {
    setLocation(CART_URL, CART_PATH);
    expect(
      mountTorobSurface(
        torobDeps(async () => ({ ok: true, kind: 'torob/compare', comparison: COMPARISON })),
      ),
    ).toBeNull();
  });
});

describe('orders surface', () => {
  beforeEach(() => {
    document.body.innerHTML = '<main></main>';
    setLocation('https://www.digikala.com/profile/orders/', '/profile/orders/');
  });

  it('mounts a discovery button on the orders tab and asks the worker to open insights', async () => {
    const sendMessage = vi.fn(async () => ({ ok: true }));
    const surface = mountOrdersSurface({
      doc: document,
      location: currentLocation,
      lang: 'fa',
      label: 'خریدهای من با افزونه بُزخَر',
      sendMessage,
    });
    expect(surface).not.toBeNull();

    const button = document.getElementById('dkopt-insights-fab') as HTMLButtonElement;
    expect(button.textContent).toBe('خریدهای من با افزونه بُزخَر');
    button.click();
    expect(sendMessage).toHaveBeenCalledWith({ kind: 'insights/open' });
    await vi.waitFor(() => expect(button.disabled).toBe(false));

    surface?.destroy();
    expect(document.getElementById('dkopt-insights-fab')).toBeNull();
  });

  it('does not mount on other pages', () => {
    setLocation(CART_URL, CART_PATH);
    const surface = mountOrdersSurface({
      doc: document,
      location: currentLocation,
      lang: 'fa',
      label: 'x',
      sendMessage: vi.fn(),
    });
    expect(surface).toBeNull();
  });
});
