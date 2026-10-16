/**
 * Export builders: pure functions, so they are tested without a browser.
 *
 * The .xlsx is unzipped by hand here - a store-only archive is readable
 * with a DataView, and pulling in a zip reader (or a spreadsheet
 * library) to test a file format the extension writes itself would be
 * the dependency the extension deliberately does not ship. Every entry's
 * CRC is checked against node:zlib's own crc32, so the check is
 * independent of the implementation under test.
 */
import { crc32 as nodeCrc32 } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import {
  FORMAT_LABEL,
  lineUrl,
  planCsv,
  planRows,
  planXlsx,
  type ExportCell,
} from '../src/results/export';
import type { Plan } from '../src/shared/solver';

function planFixture(): Plan {
  return {
    mode: 'exact',
    assignments: [],
    groups: [
      {
        vendorId: 'vend-a',
        vendorName: 'فروشنده الف',
        shipmentClass: 'seller',
        fee: 10_000,
        feeFlag: 'regular',
        promoIds: [],
        subtotal: 30_000,
        lines: [
          {
            itemKey: 'p1::v1',
            title: 'کالای «آ»',
            variantLabel: 'گونه ۱',
            unitPrice: 20_000,
            quantity: 1,
            lineTotal: 20_000,
            isLargeItem: false,
            variantId: 'v1',
          },
          {
            // Comma, quote and both markup characters in one title.
            itemKey: 'p2::v2',
            title: 'Item, with "quotes" & <tags>',
            unitPrice: 5_000,
            quantity: 2,
            lineTotal: 10_000,
            isLargeItem: false,
            variantId: 'v2',
          },
        ],
      },
    ],
    itemSubtotal: 30_000,
    deliverySubtotal: 10_000,
    grandTotal: 40_000,
    unsolved: [{ itemKey: 'p3::v3', title: 'ناموجود', reason: 'all-offers-out-of-stock' }],
    totalIsEstimate: false,
    comparison: { currentCartTotal: 50_000, savings: 10_000 },
  };
}

describe('export format names', () => {
  it('is English for every format, in both UI languages', () => {
    expect(Object.values(FORMAT_LABEL)).toEqual([
      'Save as PDF',
      'CSV',
      'Excel',
      'Pretty text',
      'Markdown',
      'Plain text',
    ]);
  });
});

describe('plan rows', () => {
  it('opens with the column headers and keeps money as numbers', () => {
    const rows = planRows(planFixture());
    expect(rows[0]).toEqual([
      'Seller',
      'Item',
      'Variant',
      'Qty',
      'Unit price (toman)',
      'Line total (toman)',
      'Link',
    ]);
    const first = rows[1] as ExportCell[];
    expect(first[0]).toBe('فروشنده الف');
    expect(first[3]).toBe(1);
    expect(typeof first[4]).toBe('number');
    // The link points at the variant the plan buys.
    expect(first[6]).toBe('https://www.digikala.com/product/dkp-p1/?variant_id=v1');
  });

  it('closes with the totals, the savings and the unsolved block', () => {
    const rows = planRows(planFixture());
    const tail = rows.slice(-6);
    expect(tail).toContainEqual(['Items subtotal', 30_000]);
    expect(tail).toContainEqual(['Shipping', 10_000]);
    expect(tail).toContainEqual(['Payable', 40_000]);
    expect(tail).toContainEqual(['Savings', 10_000]);
    expect(rows.at(-1)).toEqual(['Not optimized', 'ناموجود', 'all offers out of stock']);
  });

  it('omits the savings row when there are none', () => {
    const fixture = planFixture();
    const rows = planRows({ ...fixture, comparison: { currentCartTotal: 40_000, savings: 0 } });
    expect(rows.some((row) => row[0] === 'Savings')).toBe(false);
  });
});

describe('line url', () => {
  it('always points at the chosen variant, not the cart variant', () => {
    const fixture = planFixture();
    const line = (fixture.groups[0]?.lines ?? [])[1];
    expect(line && lineUrl(line)).toBe('https://www.digikala.com/product/dkp-p2/?variant_id=v2');
  });

  it('falls back to the variant inside the item key', () => {
    expect(
      lineUrl({
        itemKey: 'p9::v9',
        unitPrice: 1,
        quantity: 1,
        lineTotal: 1,
        isLargeItem: false,
      }),
    ).toBe('https://www.digikala.com/product/dkp-p9/?variant_id=v9');
  });

  it('has no link when the line carries no variant at all', () => {
    expect(
      lineUrl({ itemKey: 'p9', unitPrice: 1, quantity: 1, lineTotal: 1, isLargeItem: false }),
    ).toBeUndefined();
  });
});

describe('CSV', () => {
  it('starts with a BOM and uses CRLF rows', () => {
    const csv = planCsv([
      ['a', 'b'],
      ['1', '2'],
    ]);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toBe('\uFEFFa,b\r\n1,2\r\n');
  });

  it('quotes delimiters, quotes and newlines (RFC 4180)', () => {
    const csv = planCsv([['plain', 'has,comma', 'has"quote', 'has\nnewline']]);
    expect(csv).toBe('\uFEFFplain,"has,comma","has""quote","has\nnewline"\r\n');
  });

  it('writes the plan with its numbers unformatted', () => {
    const csv = planCsv(planRows(planFixture()));
    expect(csv).toContain('"Item, with ""quotes"" & <tags>"');
    expect(csv).toContain('Payable,40000');
  });
});

/** Reads a store-only ZIP back: EOCD → central directory → local data. */
function readZip(bytes: Uint8Array): Map<string, string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();
  const out = new Map<string, string>();
  const eocd = bytes.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  expect(view.getUint16(eocd + 8, true)).toBe(count);
  let at = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(at, true)).toBe(0x02014b50);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLen = view.getUint16(at + 28, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLen));
    expect(view.getUint32(localAt, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(localAt + 26, true);
    const dataAt = localAt + 30 + localNameLen;
    const data = bytes.subarray(dataAt, dataAt + size);
    // The archive's own CRC must match an independent implementation.
    expect(view.getUint32(localAt + 14, true)).toBe(nodeCrc32(data));
    expect(crc).toBe(nodeCrc32(data));
    out.set(name, decoder.decode(data));
    at += 46 + nameLen + view.getUint16(at + 30, true) + view.getUint16(at + 32, true);
  }
  return out;
}

describe('XLSX', () => {
  // Built once, on first use: readZip asserts, so it must not run at
  // collection time.
  let cached: Map<string, string> | null = null;
  const entries = () => (cached ??= readZip(planXlsx('BozKhar plan', planRows(planFixture()))));

  it('is a zip with every part Excel needs', () => {
    expect([...entries().keys()].sort()).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/workbook.xml',
      'xl/worksheets/sheet1.xml',
    ]);
  });

  it('names the sheet and points the workbook at it', () => {
    expect(entries().get('xl/workbook.xml')).toContain('name="BozKhar plan"');
    expect(entries().get('xl/_rels/workbook.xml.rels')).toContain('worksheets/sheet1.xml');
  });

  it('writes the plan into the sheet as inline strings and numbers', () => {
    const sheet = entries().get('xl/worksheets/sheet1.xml') ?? '';
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('Item, with &quot;quotes&quot; &amp; &lt;tags&gt;');
    expect(sheet).toContain('<v>40000</v>');
    // Row 1 is the header row, so the first line lands in row 2.
    expect(sheet).toContain('<row r="2">');
  });

  it('escapes markup and drops control characters from cell text', () => {
    const csvRows: ExportCell[][] = [['a\u0000b', '&<>"\'']];
    const sheet = readZip(planXlsx('x', csvRows)).get('xl/worksheets/sheet1.xml') ?? '';
    expect(sheet).toContain('ab');
    expect(sheet).toContain('&amp;&lt;&gt;&quot;&apos;');
  });

  it('sanitizes a sheet name Excel would reject', () => {
    const sheet = readZip(planXlsx('bad[name]:*?/\\here', [])).get('xl/workbook.xml') ?? '';
    expect(sheet).not.toContain('[');
    expect(sheet).toContain('bad name');
  });

  it('leaves empty rows out of the sheet entirely', () => {
    const sheet = readZip(planXlsx('x', [[], ['a']])).get('xl/worksheets/sheet1.xml') ?? '';
    expect(sheet).not.toContain('<row r="1">');
    expect(sheet).toContain('<row r="2">');
  });
});
