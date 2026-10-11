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
  extra: Partial<Snapshot> = {},
): Snapshot {
  const capturedAt = extra.capturedAt ?? '2026-10-09T12:00:00Z';
  return {
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
          plusApplies: false,
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
function pageDeps() {
  return {
    getItems: () => getAllItems(IDB()),
    getSnapshots: () => import('../src/shared/storage/db').then((m) => m.getAllSnapshots(IDB())),
    putItem: (it: ComparisonItem) => putItem(IDB(), it),
    loadSettings: () => Promise.resolve(DEFAULT_SETTINGS),
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

describe('results page — the settled bill (D-27)', () => {
  beforeEach(async () => {
    for (const { name } of await IDB().databases()) {
      if (!name) continue;
      await new Promise<void>((res, rej) => {
        const rq = IDB().deleteDatabase(name);
        rq.onsuccess = () => res();
        rq.onerror = () => rej(rq.error);
      });
    }
    mountShell();
  });

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

  it('staleness over 30 minutes is disclosed with a relative time and a refresh action', async () => {
    const old = new Date(Date.now() - 45 * 60_000).toISOString().slice(0, 19) + 'Z';
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
    expect(notice?.textContent).toContain('به‌روزرسانی قیمت‌ها');
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
  });
});
