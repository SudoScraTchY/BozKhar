/**
 * Plan exports: one plan, six file formats (PDF, CSV, Excel, pretty
 * text, Markdown, plain text).
 *
 * Pure builders only - given a plan they return the exact bytes an
 * export writes. The DOM download and the localized copy text stay in
 * page.ts, so this module has no browser dependency beyond the last
 * function and is testable without a browser (D-15: zero runtime
 * dependencies; nothing here imports a spreadsheet or CSV library).
 *
 * "Excel" is a real .xlsx (OOXML). Rather than pull a zip library into
 * an extension that ships none, the ~70 lines of store-only ZIP framing
 * it needs live below: no compression, fixed timestamps, so the same
 * plan always produces byte-identical output.
 *
 * Export text is English by design: column headers and section labels
 * are spreadsheet vocabulary, not UI copy, so a file shared with anyone
 * reads the same whatever the UI language is. Row *content* (titles,
 * seller names) is of course untouched.
 */
import type { Plan, PlanLine, UnsolvedReason } from '../shared/solver';
import { productUrl } from '../capture/readers/url';

/** The format names shown in the export menu and on the copy buttons. */
export const FORMAT_LABEL = {
  pdf: 'Save as PDF',
  csv: 'CSV',
  xlsx: 'Excel',
  pretty: 'Pretty text',
  markdown: 'Markdown',
  text: 'Plain text',
} as const;

export type ExportFormat = keyof typeof FORMAT_LABEL;

export type ExportCell = string | number;

/** The columns of the exported sheet, in order. */
const COLUMNS = [
  'Seller',
  'Item',
  'Variant',
  'Qty',
  'Unit price (toman)',
  'Line total (toman)',
  'Link',
] as const;

/**
 * The product and the variant a plan line actually buys: the variant the
 * plan CHOSE, not the one the cart holds, so a link or a re-capture points
 * at the offer the line's price rests on. Falls back to the variant
 * encoded in the item key.
 */
export function lineIds(line: PlanLine): { productId: string; variantId?: string } {
  const sep = line.itemKey.lastIndexOf('::');
  const productId = sep === -1 ? line.itemKey : line.itemKey.slice(0, sep);
  const variantId = line.variantId ?? (sep === -1 ? undefined : line.itemKey.slice(sep + 2));
  return { productId, variantId };
}

/** The Digikala page a plan line must open. */
export function lineUrl(line: PlanLine): string | undefined {
  const { productId, variantId } = lineIds(line);
  return variantId ? productUrl(productId, variantId) : undefined;
}

/**
 * The plan as a flat table: one row per line, then the totals. Numbers
 * stay numbers so the sheet can add them up; everything else is text.
 */
export function planRows(plan: Plan): ExportCell[][] {
  const rows: ExportCell[][] = [[...COLUMNS]];
  for (const group of plan.groups) {
    const seller = group.vendorName ?? group.vendorId;
    for (const line of group.lines) {
      rows.push([
        seller,
        line.title ?? line.itemKey,
        line.variantLabel ?? line.variantId ?? '',
        line.quantity,
        line.unitPrice,
        line.lineTotal,
        lineUrl(line) ?? '',
      ]);
    }
  }
  rows.push([]);
  rows.push(['Items subtotal', plan.itemSubtotal]);
  rows.push(['Shipping', plan.deliverySubtotal]);
  rows.push(['Payable', plan.grandTotal]);
  const savings = plan.comparison?.savings ?? 0;
  if (savings > 0) rows.push(['Savings', savings]);
  if (plan.unsolved.length) {
    rows.push([]);
    for (const item of plan.unsolved) {
      rows.push(['Not optimized', item.title ?? item.itemKey, UNSOLVED_REASON[item.reason]]);
    }
  }
  return rows;
}

/** Why an item is missing from the plan, in the export's English. */
const UNSOLVED_REASON: Record<UnsolvedReason, string> = {
  'no-available-vendor': 'no vendor available',
  'all-offers-out-of-stock': 'all offers out of stock',
  'pinned-vendor-unavailable': 'the pinned vendor is unavailable',
};

// ---------------------------------------------------------------------------
// CSV

function csvCell(value: ExportCell): string {
  const text = String(value);
  // RFC 4180: quote when the value holds a delimiter, a quote or a
  // newline; double the quotes inside.
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * CSV with a UTF-8 BOM and CRLF rows. The BOM is what makes Excel open
 * Persian text correctly instead of guessing a legacy codepage.
 */
export function planCsv(rows: readonly (readonly ExportCell[])[]): string {
  const body = rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
  return `\uFEFF${body}\r\n`;
}

// ---------------------------------------------------------------------------
// XLSX (store-only ZIP + OOXML)

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = (crcTable[(c ^ byte) & 0xff] as number) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array {
  const total = parts.reduce((n, part) => n + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

interface ZipEntry {
  name: string;
  data: Uint8Array;
}

/**
 * A stored (uncompressed) ZIP. Fixed DOS timestamp: an archive of the
 * same plan is byte-identical, which makes it testable and lets a
 * download be compared to a fixture.
 */
function zipStore(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  const dosTime = 0;
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1;
  let offset = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    const header = new Uint8Array(30 + name.length);
    const hv = new DataView(header.buffer);
    hv.setUint32(0, 0x04034b50, true); // local file header
    hv.setUint16(4, 20, true); // version needed
    hv.setUint16(6, 0x0800, true); // UTF-8 file names
    hv.setUint16(8, 0, true); // method: stored
    hv.setUint16(10, dosTime, true);
    hv.setUint16(12, dosDate, true);
    hv.setUint32(14, crc, true);
    hv.setUint32(18, size, true); // compressed
    hv.setUint32(22, size, true); // uncompressed
    hv.setUint16(26, name.length, true);
    hv.setUint16(28, 0, true); // extra length
    header.set(name, 30);
    local.push(header, entry.data);

    const dir = new Uint8Array(46 + name.length);
    const dv = new DataView(dir.buffer);
    dv.setUint32(0, 0x02014b50, true); // central directory header
    dv.setUint16(4, 20, true); // version made by
    dv.setUint16(6, 20, true); // version needed
    dv.setUint16(8, 0x0800, true);
    dv.setUint16(10, 0, true);
    dv.setUint16(12, dosTime, true);
    dv.setUint16(14, dosDate, true);
    dv.setUint32(16, crc, true);
    dv.setUint32(20, size, true);
    dv.setUint32(24, size, true);
    dv.setUint16(28, name.length, true);
    dv.setUint16(30, 0, true); // extra
    dv.setUint16(32, 0, true); // comment
    dv.setUint16(34, 0, true); // disk number
    dv.setUint16(36, 0, true); // internal attributes
    dv.setUint32(38, 0, true); // external attributes
    dv.setUint32(42, offset, true);
    dir.set(name, 46);
    central.push(dir);

    offset += header.length + size;
  }

  const centralSize = central.reduce((n, dir) => n + dir.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); // end of central directory
  ev.setUint16(4, 0, true); // this disk
  ev.setUint16(6, 0, true); // disk with the directory
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  ev.setUint16(20, 0, true); // comment length

  return concat([...local, ...central, end]);
}

/** XML text: escapes markup and drops the control characters XML forbids. */
function xmlText(value: string): string {
  return value
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

/** Excel sheet names: 31 chars max, none of []:*?/\ , never empty. */
function sheetName(raw: string): string {
  const cleaned = raw
    .replace(/[[\]:*?/\\]/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || 'Plan';
}

function columnName(index: number): string {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  }
  return name;
}

function sheetXml(rows: readonly (readonly ExportCell[])[]): string {
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((cell, c) => {
          const ref = `${columnName(c)}${r + 1}`;
          if (typeof cell === 'number' && Number.isFinite(cell)) {
            return `<c r="${ref}"><v>${cell}</v></c>`;
          }
          const text = xmlText(String(cell));
          if (text === '') return `<c r="${ref}"/>`;
          // inlineStr keeps the reader from needing a shared-string table.
          return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${text}</t></is></c>`;
        })
        .join('');
      return cells === '' ? '' : `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${body}</sheetData></worksheet>`
  );
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill>' +
  '<fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border/></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs>' +
  '</styleSheet>';

/** A one-sheet .xlsx holding the plan rows. */
export function planXlsx(name: string, rows: readonly (readonly ExportCell[])[]): Uint8Array {
  const encoder = new TextEncoder();
  const xml = (value: string) => encoder.encode(value);
  const sheet = sheetName(name);
  return zipStore([
    {
      name: '[Content_Types].xml',
      data: xml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
          '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
          '<Default Extension="xml" ContentType="application/xml"/>' +
          '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
          '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
          '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
          '</Types>',
      ),
    },
    {
      name: '_rels/.rels',
      data: xml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
          '</Relationships>',
      ),
    },
    {
      name: 'xl/workbook.xml',
      data: xml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
          `<sheets><sheet name="${xmlText(sheet)}" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      data: xml(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
          '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
          '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
          '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
          '</Relationships>',
      ),
    },
    { name: 'xl/styles.xml', data: xml(STYLES_XML) },
    { name: 'xl/worksheets/sheet1.xml', data: xml(sheetXml(rows)) },
  ]);
}

// ---------------------------------------------------------------------------
// Download

/**
 * Hand a file to the browser's downloader. The only DOM touch here; it
 * runs on an extension page, so no host permission is involved.
 */
export function downloadFile(filename: string, mime: string, data: string | Uint8Array): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  // Keep the blob alive until the download has certainly started.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
