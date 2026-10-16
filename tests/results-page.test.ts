/**
 * @vitest-environment jsdom
 *
 * Results page tests (D-27 redesign): the settled
 * bill — hero, parcels (totals include shipping),
 * ledger and action bar agree, the seller control
 * replaces the old dropdown, the why-disclosure,
 * hints, staleness and the empty/optimal states.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReportPage } from '../src/results/page';
import { appendSnapshot, getAllItems, putItem } from '../src/shared/storage/db';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import { CartApiError, CartTransportError } from '../src/results/cart-transport';
import type { CartTransport } from '../src/results/apply';
import type { ComparisonItem, Snapshot } from '../src/shared/types';

const IDB = () => globalThis.indexedDB;

function item(
  productId: string,
  variantId: string,
  extra: Partial<ComparisonItem> = {},
): ComparisonItem {
  return {
    itemId: { productId, variantId },
    product: { id: productId, title: `محصول ${productId}` },
    variant: { id: variantId, label: `گونه ${variantId}` },
    quantity: 1,
    lock: { mode: 'none', vendorIds: [] },
    addedAt: '2026-10-09T10:00:00Z',
    sellerId: 'vend-a',
    sellerName: 'فروشنده الف',
    ...extra,
  };
}

function snapshot(
  productId: string,
  variantId: string,
  vendorId: string,
  vendorName: string,
  price: number,
  fee: number,
  extra: Partial<Snapshot> & { plus?: boolean } = {},
): Snapshot {
  const capturedAt = extra.capturedAt ?? '2026-10-09T12:00:00Z';
  const { plus: _plus, ...rest } = extra;
  return {
    ...rest,
    snapshotId: `${productId}::${variantId}::${vendorId}::${capturedAt}`,
    itemId: { productId, variantId },
    offers: [
      {
        vendor: { id: vendorId, name: vendorName },
        price,
        stockState: 'in-stock',
        isLargeItem: false,
        delivery: {
          feeAmount: fee,
          provenance: 'page-visible',
          plusApplies: extra.plus ?? false,
        },
        promoIds: [],
        capturedAt,
        extractorVersion: '0.3.0-t03',
        sourceUrl: `https://api.digikala.com/product/v1/products/${productId}/`,
      },
    ],
    promos: [],
    capturedAt,
    extractorVersion: '0.3.0-t03',
    ...extra,
  };
}

function mountShell(): void {
  document.body.innerHTML =
    '<main id="app"><header><h1 class="title" id="h-title"></h1></header><div id="content" aria-live="polite"></div></main>';
}

/** Real deps over the fake-indexeddb global. */
function pageDeps(transport?: CartTransport) {
  return {
    getItems: () => getAllItems(IDB()),
    getSnapshots: () => import('../src/shared/storage/db').then((m) => m.getAllSnapshots(IDB())),
    putItem: (it: ComparisonItem) => putItem(IDB(), it),
    // A fresh copy per call: the page mutates the settings it is
    // handed (the Plus switch), and DEFAULT_SETTINGS is shared.
    loadSettings: () => Promise.resolve({ ...DEFAULT_SETTINGS }),
    ...(transport ? { transport } : {}),
  };
}

/** The bill's single source of truth: the payable total. */
function totals(): {
  hero: string | null;
  ledger: string | null;
  bar: string | null;
  parcels: string[];
} {
  const hero = document.querySelector('.bk-hero-total')?.textContent ?? null;
  const ledger = document.querySelector('.bk-ledger-payable .bk-num')?.textContent ?? null;
  const bar = document.querySelector('.bk-actionbar-total')?.textContent ?? null;
  const parcels = [...document.querySelectorAll('.bk-parcel-total .bk-num')].map(
    (n) => n.textContent ?? '',
  );
  return { hero, ledger, bar, parcels };
}

/** Wipes every database and remounts the page shell. */
async function freshIndexedDbAndShell(): Promise<void> {
  for (const { name } of await IDB().databases()) {
    if (!name) continue;
    await new Promise<void>((res, rej) => {
      const rq = IDB().deleteDatabase(name);
      rq.onsuccess = () => res();
      rq.onerror = () => rej(rq.error);
    });
  }
  mountShell();
}

describe('results page — the settled bill (D-27)', () => {
  beforeEach(freshIndexedDbAndShell);

  it('renders the hero: savings title, price bar, plan vs current totals, pct chip, counts', async () => {
    // Cart holds p1/v1 at vend-a (100 + 10 fee = 110).
    // The plan switches to p1/v2 at vend-b (60 + 20 = 80):
    // a 30-toman saving that includes shipping. The cart's
    // own offer must be the LATEST capture for the item.
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-b', 'فروشنده ب', 80, 20));
    await appendSnapshot(IDB(), snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 60, 20));

    const page = createReportPage(pageDeps());
    await page.run();

    const title = document.querySelector('.bk-hero-title');
    expect(title?.textContent).toBe('با این برنامه ۳۰ تومان کمتر می‌پردازید');
    // Plan total (solid) and the struck current total.
    expect(document.querySelector('.bk-hero-total')?.textContent).toContain('۸۰');
    expect(document.querySelector('.bk-hero-total-current')?.textContent).toContain('۱۱۰');
    // The saving share: 30/110 = 27%.
    expect(document.querySelector('.bk-chip-saving')?.textContent).toContain('۲۷٪ کمتر');
    // Counts line, shipping included.
    expect(document.querySelector('.bk-hero-counts')?.textContent).toBe(
      '۱ کالا در ۱ مرسوله، با هزینهٔ ارسال',
    );
    // The price bar has both segments.
    expect(document.querySelector('.bk-pricebar-plan')).not.toBeNull();
    expect(document.querySelector('.bk-pricebar-saved')).not.toBeNull();
  });

  it('the bill agrees everywhere: hero = ledger = action bar = Σ parcels (brief §11)', async () => {
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-b', 'فروشنده ب', 80, 20));
    await appendSnapshot(IDB(), snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 60, 20));
    const page = createReportPage(pageDeps());
    await page.run();

    const t = totals();
    expect(t.hero).toContain('۸۰');
    expect(t.ledger).toContain('۸۰');
    expect(t.bar).toContain('۸۰');
    // One parcel: 60 items + 20 shipping = 80 — the
    // parcel total INCLUDES shipping (brief §2 P0.2).
    expect(t.parcels).toEqual(['۸۰ تومان']);
    // The ledger splits the same bill.
    expect(document.querySelector('.bk-ledger-row .bk-num')?.textContent).toContain('۶۰');
    expect(document.querySelectorAll('.bk-ledger-row .bk-num')[1]?.textContent).toContain('۲۰');
  });

  it('shows the parcel with seller, variant, qty, unit, line total and the shipping row', async () => {
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-b', 'فروشنده ب', 80, 20));
    await appendSnapshot(IDB(), snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 60, 20));
    const page = createReportPage(pageDeps());
    await page.run();

    expect(document.querySelector('.bk-seller-name')?.textContent).toBe('فروشنده ب');
    // The plan switched variants: the row names گونه v2.
    expect(document.querySelector('.bk-item-variant')?.textContent).toBe('گونهٔ v2');
    expect(document.querySelector('.bk-item-qty')?.textContent).toBe('۱');
    expect(document.querySelector('.bk-item-unit')?.textContent).toContain('۶۰');
    expect(document.querySelector('.bk-item-total')?.textContent).toContain('۶۰');
    // Shipping row: fee 20, inside the parcel.
    expect(document.querySelector('.bk-ship-value')?.textContent).toContain('۲۰');
    // The "was" disclosure: the cart's seller and price.
    expect(document.querySelector('.bk-item-was')?.textContent).toBe(
      'قبلاً: فروشنده الف، ۱۰۰ تومان',
    );
    expect(document.querySelector('.bk-item-change .bk-chip-saving')?.textContent).toContain('۴۰');
  });

  it('the seller control replaces the dropdown: auto plus every in-stock seller, pinning persists', async () => {
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10));
    await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-b', 'فروشنده ب', 80, 20));
    const page = createReportPage(pageDeps());
    await page.run();

    const btn = document.querySelector('.bk-seller-btn');
    expect(btn?.textContent).toBe('پیشنهاد بز خر');
    btn?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    const options = [...document.querySelectorAll('.bk-popover-option')];
    // Automatic first, then sellers cheapest-first.
    expect(options).toHaveLength(3);
    expect(options[0]?.textContent).toContain('پیشنهاد بز خر');
    // فروشنده ب (80) before فروشنده الف (100).
    expect(options[1]?.textContent).toContain('فروشنده ب');
    expect(options[1]?.textContent).toContain('۸۰');
    expect(options[2]?.textContent).toContain('فروشنده الف');

    // Pin to the pricier seller: persists and re-solves.
    options[2]?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const stored = await vi.waitFor(async () => {
      const items = await getAllItems(IDB());
      expect(items[0]?.lock).toEqual({
        mode: 'pin',
        vendorIds: ['vend-a'],
      });
      return items;
    });
    expect(stored[0]?.lock.mode).toBe('pin');
    // The pinned row is labelled locked.
    await vi.waitFor(() => {
      expect(document.querySelectorAll('.bk-item-locked')).toHaveLength(1);
      expect(document.querySelector('.bk-chip-locked')?.textContent).toContain('قفل‌شده');
    });
  });

  it('the why-disclosure lists the alternative seller with its price and the exact effect', async () => {
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-b', 'فروشنده ب', 80, 20));
    await appendSnapshot(IDB(), snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 60, 20));
    const page = createReportPage(pageDeps());
    await page.run();

    const why = document.querySelector('.bk-why-btn');
    expect(why?.getAttribute('aria-expanded')).toBe('false');
    why?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(why?.getAttribute('aria-expanded')).toBe('true');

    await vi.waitFor(() => {
      const table = document.querySelector('.bk-why-table');
      expect(table).not.toBeNull();
      // The unchosen vendor appears with its unit price.
      const rows = [...table!.querySelectorAll('.bk-why-seller')];
      expect(rows.some((r) => r.textContent === 'فروشنده الف')).toBe(true);
    });
  });

  it('extra-unit hints render with the sentence, the outcome and both actions', async () => {
    // The plan splits: p1 rides vend-b (20 + 60 fee),
    // p2 stays at vend-a (200 + 10). All-vend-b would
    // satisfy the promo and waive its fee (20 + 280),
    // but the split (290) still beats it (300).
    // vend-b holds exactly one unit — one short of
    // the vendor-count promo (2) that waives its
    // 60-toman fee. Buying one more p1 at vend-b
    // removes 60 for a 20-toman unit: a 40-toman
    // net saving.
    await putItem(IDB(), item('p1', 'v1'));
    await putItem(IDB(), item('p2', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(
      IDB(),
      snapshot('p2', 'v1', 'vend-a', 'فروشنده الف', 200, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(IDB(), snapshot('p2', 'v1', 'vend-b', 'فروشنده ب', 280, 60));
    // The vend-b capture carries the vendor-count
    // promo (one snapshot per capture).
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-b', 'فروشنده ب', 20, 60, {
        snapshotId: 'p1::v1::vend-b::promo',
        promos: [
          {
            promoId: 'promo1',
            vendorId: 'vend-b',
            type: 'vendor-count',
            thresholdValue: 2,
            effect: 'free-delivery',
            detectedAt: '2026-10-09T13:00:00Z',
            rawText: 'ارسال رایگان با خرید ۲ عدد',
          },
        ],
      }),
    );

    const page = createReportPage(pageDeps());
    await page.run();

    const hint = document.querySelector('.bk-hint');
    expect(hint).not.toBeNull();
    expect(document.querySelector('.bk-hint-sentence')?.textContent).toBe(
      '«محصول p1» را ۱ عدد بیشتر بخرید تا ارسال «فروشنده ب» رایگان شود.',
    );
    // feeRemoved 60 - extra unit 20 = 40 toman saved.
    expect(document.querySelector('.bk-hint-saving')?.textContent).toBe(
      'جمع سبد ۴۰ تومان کمتر می‌شود',
    );

    // Add-to-plan raises the quantity and re-solves: the
    // fee is waived and the parcel shipping reads free.
    document
      .querySelector('.bk-hint-actions .bk-btn-primary')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await vi.waitFor(async () => {
      const items = await getAllItems(IDB());
      const p1 = items.find((i) => i.itemId.productId === 'p1');
      expect(p1?.quantity).toBe(2);
      return items;
    });
    await vi.waitFor(() => {
      // The vend-b parcel ships free with the
      // reason chip; the vend-a parcel keeps its fee.
      const ships = [...document.querySelectorAll('.bk-ship-value')].map(
        (n) => n.textContent ?? '',
      );
      expect(ships.some((s) => s.includes('رایگان'))).toBe(true);
      const chips = [...document.querySelectorAll('.bk-chip-reason')].map(
        (n) => n.textContent ?? '',
      );
      expect(chips).toContain('خرید ۲ عدد از این فروشنده');
    });
  });

  it('staleness past the configured threshold is disclosed with both refresh actions', async () => {
    // The threshold is the user's setting (stalenessWarnHours, default
    // 24h), not a constant, so 30 hours old is stale and 45 minutes is not.
    const old = new Date(Date.now() - 30 * 60 * 60_000).toISOString().slice(0, 19) + 'Z';
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: old,
      }),
    );
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-b', 'فروشنده ب', 80, 20, {
        capturedAt: old,
      }),
    );
    const page = createReportPage(pageDeps());
    await page.run();

    const notice = document.querySelector('.bk-notice-caution');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('پیش');
    // Whole-list re-crawl, and one button per stale line next to it.
    expect(notice?.textContent).toContain('به‌روزرسانی قیمت‌ها');
    expect(notice?.textContent).toContain('به‌روزرسانی این کالا');
    expect(document.querySelectorAll('.bk-stale-row').length).toBeGreaterThan(0);
  });

  it('an already-optimal cart shows the optimal state: no hero, no action bar', async () => {
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10));
    const page = createReportPage(pageDeps());
    await page.run();

    expect(document.querySelector('.bk-optimal')).not.toBeNull();
    expect(document.querySelector('.bk-optimal p')?.textContent).toBe(
      'سبد شما از قبل بهینه است. با قیمت‌های فعلی، ترکیب ارزان‌تری پیدا نشد.',
    );
    expect(document.querySelector('.bk-hero')).toBeNull();
    expect(document.querySelector('.bk-actionbar')).toBeNull();
  });

  it('an empty cart shows the empty state', async () => {
    const page = createReportPage(pageDeps());
    await page.run();
    expect(document.querySelector('.bk-state')?.textContent).toBe('سبد خرید شما خالی است.');
  });

  it('a seller-only saving leaves the Apply button disabled (the API transport adds by variant)', async () => {
    // The cheaper arrangement only switches the seller on
    // the same variant — the add endpoint takes no seller.
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-b', 'فروشنده ب', 80, 20));
    const page = createReportPage(pageDeps());
    await page.run();

    // Savings exist (110 -> 100)…
    expect(document.querySelector('.bk-hero')).not.toBeNull();
    // …but nothing is applyable: the button is disabled
    // with the reason in its title.
    const apply = document.querySelector<HTMLButtonElement>('.bk-apply-btn');
    expect(apply?.disabled).toBe(true);
    expect(apply?.title).toContain('از قبل بهینه');
    // …and the reason is on the page, not only in the tooltip.
    expect(document.querySelector('.bk-apply-note')?.textContent).toContain('فروشنده');
  });

  it('the Plus switch re-solves and flips the fee flag (issue: toggle "does not even work")', async () => {
    // Cart holds p1/v1 at vend-a: 100 + 10 fee = 110.
    // vend-b has p1/v2 at 60 with a 20 fee, but Plus
    // covers that fee. Turning Plus on must change the
    // plan's fee flag from 'regular' to 'plus-covered'.
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 60, 20, {
        plus: true,
      }),
    );
    const page = createReportPage(pageDeps());
    await page.run();

    const toggle = document.querySelector<HTMLInputElement>('.bk-switch-input');
    expect(toggle).not.toBeNull();
    // Default settings: hasPlus is false.
    expect(toggle?.checked).toBe(false);

    toggle?.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    // After the toggle: the switch is on, the note is shown,
    // and the re-solve flagged the fee as Plus-covered.
    expect(document.querySelector<HTMLInputElement>('.bk-switch-input')?.checked).toBe(true);
    expect(document.querySelector('.bk-plus-note')).not.toBeNull();
    const flags = [...document.querySelectorAll('.bk-chip-reason')].map((n) => n.textContent);
    expect(flags.join(' ')).toContain('پلاس');
  });

  it('the Plus switch shows on an already-optimal cart and says when Plus changes nothing', async () => {
    // One vendor, one offer: nothing to save. The row used to be
    // hidden in this state, which is what made the toggle look dead.
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10));

    const page = createReportPage(pageDeps());
    await page.run();

    expect(document.querySelector('.bk-optimal')).not.toBeNull();
    const toggle = document.querySelector<HTMLInputElement>('.bk-switch-input');
    expect(toggle).not.toBeNull();
    expect(toggle?.checked).toBe(false);

    toggle?.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();

    // Flipping it always answers: here, honestly, that Plus
    // changes nothing (no offer of this vendor is Plus-covered).
    expect(document.querySelector<HTMLInputElement>('.bk-switch-input')?.checked).toBe(true);
    expect(document.querySelector('.bk-plus-note')?.textContent).toContain('پلاس');
    expect(document.querySelector('.bk-plus-delta')).toBeNull();
  });

  it('clicking the visible switch toggles it (the track used to swallow the click)', async () => {
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10));

    const page = createReportPage(pageDeps());
    await page.run();

    // The track is a positioned element painted over the (invisible,
    // absolutely positioned) input, so a click on the switch hits the
    // track. The wrapper therefore has to be the input's label, or
    // nothing ever reaches the control.
    const wrap = document.querySelector('.bk-switch');
    expect(wrap?.tagName).toBe('LABEL');
    expect((wrap as HTMLLabelElement | null)?.htmlFor).toBe('bk-plus-switch');

    const track = document.querySelector<HTMLElement>('.bk-switch-track');
    expect(document.querySelector<HTMLInputElement>('#bk-plus-switch')?.checked).toBe(false);
    track?.click();
    await settle();
    expect(document.querySelector<HTMLInputElement>('#bk-plus-switch')?.checked).toBe(true);
    document.querySelector<HTMLElement>('.bk-switch-track')?.click();
    await settle();
    expect(document.querySelector<HTMLInputElement>('#bk-plus-switch')?.checked).toBe(false);
  });

  it('the Apply button is enabled when the plan switches the variant', async () => {
    // The classic applyable case: the cart holds v1, the
    // plan moves to v2. The button must be live.
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(IDB(), snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 60, 20));
    const page = createReportPage(pageDeps());
    await page.run();

    const apply = document.querySelector<HTMLButtonElement>('.bk-apply-btn');
    expect(apply).not.toBeNull();
    expect(apply?.disabled).toBe(false);
  });

  it('the copied plan carries each product link in all three formats', async () => {
    // Cart: p1/v1 at vend-a. Plan: switch to v2 for the saving.
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(IDB(), snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 60, 20));

    const writeText = vi.fn<(text: string) => Promise<void>>(async () => {});
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });

    const page = createReportPage(pageDeps());
    await page.run();

    const buttons = [...document.querySelectorAll<HTMLButtonElement>('.bk-copy-btn')];
    expect(buttons).toHaveLength(3);
    for (const btn of buttons) {
      btn.click();
      await Promise.resolve();
    }
    await settle();

    const copies = writeText.mock.calls.map(([text]) => text);
    expect(copies).toHaveLength(3);
    // The link pins the variant the plan BUYS (v2), not the cart's v1 —
    // a pasted plan must open the offer it tells you to buy.
    const link = 'https://www.digikala.com/product/dkp-p1/?variant_id=v2';
    for (const text of copies) expect(text).toContain(link);
    // Markdown is a real link; plain text and pretty keep the bare URL.
    expect(copies[0]).toContain(`[محصول p1](${link})`);
  });
});

/** Flush the page's 250ms debounce plus the microtask queue. */
function settle(): Promise<void> {
  return new Promise((res) => setTimeout(res, 400));
}

/**
 * D-30: a failing apply step must say why. Before this, a thrown
 * cart-transport error left the sheet stuck on "applying…" forever,
 * which is exactly how the feature read as "does not work".
 */
describe('results page — a failed apply is never silent (D-30)', () => {
  beforeEach(freshIndexedDbAndShell);

  /** The variant-switch fixture: savings exist and a line is applyable. */
  async function seedApplyable(): Promise<void> {
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(IDB(), snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 60, 20));
  }

  async function clickAndSettle(node: Element | null): Promise<void> {
    expect(node).not.toBeNull();
    (node as HTMLElement).click();
    await settle();
  }

  it('a signed-out cart read (401) says "sign in" instead of hanging', async () => {
    await seedApplyable();
    const transport: CartTransport = {
      fetchCart: async () => [],
      fetchOffer: async () => {
        throw new CartApiError(401, '/checkout/v1/carts');
      },
      addVariant: async () => {},
      removeCartItem: async () => {},
    };
    const page = createReportPage(pageDeps(transport));
    await page.run();

    await clickAndSettle(document.querySelector('.bk-apply-btn'));

    const error = document.querySelector('.bk-sheet-error');
    expect(error?.textContent).toContain('وارد حساب دیجی‌کالا شوید');
    // The way out is offered, not just reported.
    const actions = [...document.querySelectorAll('.bk-sheet-actions .bk-btn')];
    expect(actions.map((a) => a.textContent)).toContain('تلاش دوباره');
  });

  it('a missing digikala tab (NO_TAB) explains what to open', async () => {
    await seedApplyable();
    let failCart = false;
    const transport: CartTransport = {
      // Preflight (the product API) succeeds; the cart call does not.
      fetchCart: async () => {
        if (failCart) throw new CartTransportError('NO_TAB', 'no digikala tab');
        return [];
      },
      fetchOffer: async () => ({ vendorId: 'vend-b', price: 60, stockState: 'in-stock' }),
      addVariant: async () => {},
      removeCartItem: async () => {},
    };
    const page = createReportPage(pageDeps(transport));
    await page.run();

    await clickAndSettle(document.querySelector('.bk-apply-btn'));
    // Preflight passed: confirm, then the cart read fails.
    failCart = true;
    await clickAndSettle(document.querySelector('.bk-sheet .bk-btn-primary'));

    expect(document.querySelector('.bk-sheet-error')?.textContent).toContain('زبانه');
  });

  it('an unexpected cart-call failure still ends the sheet with a reason', async () => {
    await seedApplyable();
    let failCart = false;
    const transport: CartTransport = {
      fetchCart: async () => {
        if (failCart) throw new CartTransportError('NETWORK', 'the cart call did not complete');
        return [];
      },
      fetchOffer: async () => ({ vendorId: 'vend-b', price: 60, stockState: 'in-stock' }),
      addVariant: async () => {},
      removeCartItem: async () => {},
    };
    const page = createReportPage(pageDeps(transport));
    await page.run();

    await clickAndSettle(document.querySelector('.bk-apply-btn'));
    failCart = true;
    await clickAndSettle(document.querySelector('.bk-sheet .bk-btn-primary'));

    expect(document.querySelector('.bk-sheet-error')?.textContent).toContain('انجام نشد');
  });
});

/**
 * The export menu: one control at the top of the page that gets the plan
 * out of the browser. The format names stay English in both languages.
 */
describe('results page — exports', () => {
  beforeEach(freshIndexedDbAndShell);

  /** Cart p1/v1 at vend-a; the plan switches to v2 for a saving. */
  async function seedSavings(): Promise<void> {
    await putItem(IDB(), item('p1', 'v1'));
    await appendSnapshot(
      IDB(),
      snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10, {
        capturedAt: '2026-10-09T13:00:00Z',
      }),
    );
    await appendSnapshot(IDB(), snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 60, 20));
  }

  /**
   * Capture downloads instead of letting jsdom attempt navigation, and
   * keep the payload each Blob was built from (jsdom's Blob has no
   * text()/arrayBuffer()).
   */
  function interceptDownloads(): {
    names: string[];
    payloads: (string | Uint8Array)[];
    restore: () => void;
  } {
    const names: string[] = [];
    const payloads: (string | Uint8Array)[] = [];
    const realClick = HTMLAnchorElement.prototype.click;
    const realCreate = URL.createObjectURL;
    const realRevoke = URL.revokeObjectURL;
    const realBlob = globalThis.Blob;
    globalThis.Blob = class extends realBlob {
      constructor(parts: BlobPart[], options?: BlobPropertyBag) {
        super(parts, options);
        payloads.push(parts[0] as string | Uint8Array);
      }
    } as typeof Blob;
    URL.createObjectURL = () => 'blob:test';
    URL.revokeObjectURL = () => {};
    HTMLAnchorElement.prototype.click = function capture(this: HTMLAnchorElement): void {
      if (this.download) names.push(this.download);
    };
    return {
      names,
      payloads,
      restore: () => {
        HTMLAnchorElement.prototype.click = realClick;
        URL.createObjectURL = realCreate;
        URL.revokeObjectURL = realRevoke;
        globalThis.Blob = realBlob;
      },
    };
  }

  function openMenu(): void {
    const button = document.querySelector<HTMLButtonElement>('.bk-menu');
    button?.click();
  }

  function menuItem(label: string): HTMLButtonElement | undefined {
    return [...document.querySelectorAll<HTMLButtonElement>('.bk-menu-item')].find(
      (n) => n.textContent === label,
    );
  }

  it('shows the badge at 96px and an Export menu with all six formats', async () => {
    await seedSavings();
    await createReportPage(pageDeps()).run();

    const mark = document.querySelector<HTMLImageElement>('.bk-brand-icon');
    expect(mark?.getAttribute('src')).toBe('/icons/logo-256.png');
    expect(mark?.width).toBe(96);

    const button = document.querySelector('.bk-menu');
    expect(button?.textContent).toContain('Export');
    const popover = document.querySelector('.bk-menu-popover');
    expect(popover?.classList.contains('is-open')).toBe(false);
    openMenu();
    expect(popover?.classList.contains('is-open')).toBe(true);
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    expect([...document.querySelectorAll('.bk-menu-item')].map((n) => n.textContent)).toEqual([
      'Save as PDF',
      'CSV',
      'Excel',
      'Pretty text',
      'Markdown',
      'Plain text',
    ]);
  });

  it('closes the menu once a format is picked', async () => {
    await seedSavings();
    await createReportPage(pageDeps()).run();
    const capture = interceptDownloads();
    try {
      openMenu();
      menuItem('CSV')?.click();
      expect(document.querySelector('.bk-menu-popover')?.classList.contains('is-open')).toBe(false);
    } finally {
      capture.restore();
    }
  });

  it('saves the plan as CSV with the plan rows in it', async () => {
    await seedSavings();
    await createReportPage(pageDeps()).run();
    const capture = interceptDownloads();
    try {
      openMenu();
      menuItem('CSV')?.click();
      expect(capture.names).toHaveLength(1);
      expect(capture.names[0]).toMatch(/^bozkhar-plan-\d{4}-\d{2}-\d{2}\.csv$/);
      const text = capture.payloads[0] as string;
      expect(text.startsWith('\uFEFF')).toBe(true);
      expect(text).toContain('Payable');
      expect(text).toContain('Link');
    } finally {
      capture.restore();
    }
  });

  it('saves the plan as a real xlsx (zip signature)', async () => {
    await seedSavings();
    await createReportPage(pageDeps()).run();
    const capture = interceptDownloads();
    try {
      openMenu();
      menuItem('Excel')?.click();
      expect(capture.names[0]).toMatch(/\.xlsx$/);
      const bytes = capture.payloads[0] as Uint8Array;
      expect(String.fromCharCode(bytes[0] as number, bytes[1] as number)).toBe('PK');
      expect(new TextDecoder().decode(bytes)).toContain('xl/worksheets/sheet1.xml');
    } finally {
      capture.restore();
    }
  });

  it('saves Markdown, plain text and pretty text with the product link', async () => {
    await seedSavings();
    await createReportPage(pageDeps()).run();
    const capture = interceptDownloads();
    try {
      for (const [label, extension] of [
        ['Markdown', '.md'],
        ['Plain text', '.txt'],
        ['Pretty text', '.txt'],
      ] as const) {
        openMenu();
        menuItem(label)?.click();
        expect(capture.names.at(-1)?.endsWith(extension)).toBe(true);
        // The link pins the variant the plan BUYS (v2), not the cart's v1.
        expect(capture.payloads.at(-1) as string).toContain(
          'https://www.digikala.com/product/dkp-p1/?variant_id=v2',
        );
      }
    } finally {
      capture.restore();
    }
  });

  it('labels the copy buttons in English too', async () => {
    await seedSavings();
    await createReportPage(pageDeps()).run();
    expect([...document.querySelectorAll('.bk-copy-btn')].map((n) => n.textContent)).toEqual([
      'Markdown',
      'Plain text',
      'Pretty text',
    ]);
  });
});
