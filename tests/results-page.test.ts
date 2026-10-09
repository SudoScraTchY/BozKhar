/**
 * @vitest-environment jsdom
 *
 * Results page tests (T05.3): the D-06 lock control
 * (Any/Pin/Ban, multi-ban) and the quantity editor
 * render per item row, persist to the comparison list
 * (fake-indexeddb), and re-solve.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createReportPage } from '../src/results/page';
import { appendSnapshot, getAllItems, putItem } from '../src/shared/storage/db';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import type { ComparisonItem, Snapshot } from '../src/shared/types';

const IDB = () => globalThis.indexedDB;

function item(productId: string, variantId: string, qty = 1): ComparisonItem {
  return {
    itemId: { productId, variantId },
    product: { id: productId, title: `محصول ${productId}` },
    variant: { id: variantId, label: `گونه ${variantId}` },
    quantity: qty,
    lock: { mode: 'none', vendorIds: [] },
    addedAt: '2026-10-09T10:00:00Z',
  };
}

function snapshot(
  productId: string,
  variantId: string,
  vendorId: string,
  vendorName: string,
  price: number,
  fee: number,
): Snapshot {
  return {
    snapshotId: `${productId}::${variantId}::${vendorId}::2026-10-09T12:00:00Z`,
    itemId: { productId, variantId },
    offers: [
      {
        vendor: { id: vendorId, name: vendorName },
        price,
        stockState: 'in-stock',
        isLargeItem: false,
        delivery: { feeAmount: fee, provenance: 'page-visible', plusApplies: false },
        promoIds: [],
        capturedAt: '2026-10-09T12:00:00Z',
        extractorVersion: '0.3.0-t03',
        sourceUrl: `https://api.digikala.com/product/v1/products/${productId}/`,
      },
    ],
    promos: [],
    capturedAt: '2026-10-09T12:00:00Z',
    extractorVersion: '0.3.0-t03',
  };
}

/** The product has two vendors: الف (A, pricier) and ب (B, cheaper). */
async function seed(): Promise<void> {
  await putItem(IDB(), item('p1', 'v1'));
  await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-a', 'فروشنده الف', 100, 10));
  await appendSnapshot(IDB(), snapshot('p1', 'v1', 'vend-b', 'فروشنده ب', 80, 20));
  await appendSnapshot(IDB(), snapshot('p1', 'v2', 'vend-b', 'فروشنده ب', 60, 20));
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

describe('results page (T05.3)', () => {
  beforeEach(async () => {
    // fake-indexeddb is a fresh factory per test file run;
    // wipe any prior database so seeds are deterministic.
    for (const { name } of await IDB().databases()) {
      if (!name) continue;
      await new Promise<void>((res, rej) => {
        const rq = IDB().deleteDatabase(name);
        rq.onsuccess = () => res();
        rq.onerror = () => rej(rq.error);
      });
    }
    mountShell();
    await seed();
  });

  it('renders the lock control and quantity editor on each item row', async () => {
    const page = createReportPage(pageDeps());
    await page.run();

    // One lock dropdown + one qty input for the single cart item.
    expect(document.querySelectorAll('select.lock-mode')).toHaveLength(1);
    expect(document.querySelectorAll('input.qty-input')).toHaveLength(1);
    const qty = document.querySelector<HTMLInputElement>('input.qty-input');
    expect(qty?.value).toBe('1');
    // Any mode: chips hidden; all candidate vendors present once shown.
    const chips = document.querySelector('.vendor-chips');
    expect(chips?.classList.contains('hidden')).toBe(true);
    // The cheaper vendor ب won the default solve: exactly one
    // plan group, titled ب. (Vendor الف still exists in the
    // lock control's hidden chips - display:none, not absent.)
    expect(
      [...document.querySelectorAll('section.card h2.card-title')].map((h) => h.textContent ?? ''),
    ).toEqual(['فروشنده ب']);
  });

  it('pin persists the lock and re-solves to the pinned vendor', async () => {
    const page = createReportPage(pageDeps());
    await page.run();

    const mode = document.querySelector<HTMLSelectElement>('select.lock-mode');
    expect(mode).not.toBeNull();
    mode!.value = 'pin';
    mode!.dispatchEvent(new Event('change', { bubbles: true }));

    // Persisted to the comparison list…
    const stored = await vi.waitFor(async () => {
      const items = await getAllItems(IDB());
      expect(items[0]?.lock).toEqual({ mode: 'pin', vendorIds: ['vend-a'] });
      return items;
    });
    expect(stored[0]?.lock.mode).toBe('pin');
    // …and the plan re-solved to the pinned (pricier) vendor,
    // with its fee flagged already-paid-by-lock.
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('فروشنده الف');
      expect(document.body.textContent).toContain('پیش‌پرداخت‌شده به دلیل قفل');
    });
  });

  it('ban accumulates (multi-ban) and an all-banned cart goes unsolved', async () => {
    const page = createReportPage(pageDeps());
    await page.run();

    // Switch to ban mode: chips appear.
    const mode = document.querySelector<HTMLSelectElement>('select.lock-mode')!;
    mode.value = 'ban';
    mode.dispatchEvent(new Event('change', { bubbles: true }));
    await vi.waitFor(() => {
      expect(document.querySelector('.vendor-chips')?.classList.contains('hidden')).toBe(false);
    });

    // Ban both vendors (multi-ban): click every chip.
    const chips = [...document.querySelectorAll<HTMLButtonElement>('.vendor-chip')];
    expect(chips.length).toBe(2);
    for (const chip of chips) chip.click();

    // Both bans persisted…
    await vi.waitFor(async () => {
      const items = await getAllItems(IDB());
      expect(items[0]?.lock).toEqual({
        mode: 'ban',
        vendorIds: expect.arrayContaining(['vend-a', 'vend-b']),
      });
    });
    // …and with every vendor banned the item is unsolved, loudly.
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('فروشنده‌ای در دسترس نیست');
    });
  });

  it('quantity edits persist and re-solve the line total', async () => {
    const page = createReportPage(pageDeps());
    await page.run();

    const qty = document.querySelector<HTMLInputElement>('input.qty-input')!;
    qty.value = '3';
    qty.dispatchEvent(new Event('change', { bubbles: true }));

    await vi.waitFor(async () => {
      const items = await getAllItems(IDB());
      expect(items[0]?.quantity).toBe(3);
    });
    // 3 x 60 = 180 line total (the solver kept the cheaper
    // v2 variant of vendor ب).
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('۱۸۰');
    });
  });
});
