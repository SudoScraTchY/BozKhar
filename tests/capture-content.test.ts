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
    document.body.innerHTML = '<form action="/cart"><div data-testid="sellers-cta"></div></form>';
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
    const toast = document.querySelector('.dkopt-toast') as HTMLElement;
    // Toast names the variant and the offer count (D-05, 09 Surface 1).
    expect(toast.textContent).toContain('نسخه ۶۴');
    expect(toast.textContent).toContain('4');
    surface?.destroy();
  });

  it('mounts late (SPA): anchor appearing after hydration still gets the button', async () => {
    // Live smoke finding: Digikala hydrates the buy-box seconds after idle.
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
      document.body.innerHTML = '<div data-testid="buy-box"></div>';
      await vi.advanceTimersByTimeAsync(0);
      const btn = document.querySelector('button.dkopt-btn') as HTMLButtonElement;
      expect(btn).not.toBeNull();
      expect(btn.dataset.state).toBe('idle');
      surface?.destroy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('attaches when the seller panel renders after mount (rate-limit hardened)', async () => {
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

    // The SPA renders the buy-box late: the MutationObserver
    // attaches the button the moment it exists.
    document.body.innerHTML = '<div data-testid="buy-box"></div>';
    await new Promise((r) => setTimeout(r, 0));
    const btn = document.querySelector('button.dkopt-btn') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    expect(btn.dataset.state).toBe('idle');
    surface?.destroy();
    expect(document.querySelector('button.dkopt-btn')).toBeNull();
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
        return { ok: true, kind: 'crawl-start', itemCount: 3 };
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

  it('attaches when the summary card renders after mount (rate-limit hardened)', async () => {
    // Cart page before the SPA hydrates the summary card.
    document.body.innerHTML = '<main></main>';
    const surface = mountCartSurface({
      doc: document,
      location: currentLocation,
      labels: CART_LABELS,
      sendMessage: async () => ({ ok: true, kind: 'crawl-start', itemCount: 0 }),
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
    const sendMessage = vi.fn(async (req: unknown): Promise<CaptureResponse> => {
      const kind = (req as { kind: string }).kind;
      seen.push(kind);
      return kind === 'capture/crawl-abort'
        ? { ok: true, kind: 'crawl-abort' }
        : { ok: true, kind: 'crawl-start', itemCount: 2 };
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
    await vi.waitFor(() => expect(seen).toContain('capture/crawl-abort'));
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
        sendMessage: async () => ({ ok: true, kind: 'crawl-start', itemCount: 1 }),
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
