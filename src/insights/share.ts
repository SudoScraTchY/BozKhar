/**
 * Share card: a local Canvas renderer (no image service, no upload).
 *
 * The model is plain data so the page (and tests) can build it without
 * a canvas. Only the renderer touches DOM/Canvas APIs. Persian shaping
 * happens in the browser's text engine; the renderer sets RTL direction
 * and right alignment, loads the bundled fonts, and truncates with
 * measureText so a long persona label never runs off the card.
 *
 * X gets text only: the platform has no programmatic image upload from
 * an intent URL, and posting on the user's behalf is not our call.
 */
import type { PersonaId } from './persona';

export type ShareTheme =
  'ledger' | 'night' | 'market' | 'mint' | 'rose' | 'ocean' | 'sunset' | 'mono';
export type ShareStyle = 'cards' | 'strip' | 'editorial';
export type ShareSize = 'portrait' | 'landscape';

export interface ShareStat {
  label: string;
  value: string;
}

export interface ShareCardModel {
  theme: ShareTheme;
  style: ShareStyle;
  width: number;
  height: number;
  brand: string;
  title: string;
  subtitle: string;
  range: string;
  stats: ShareStat[];
  highlights: string[];
  footer: string;
  caption: string;
  showVendors: boolean;
}

export const SHARE_SIZES: Record<ShareSize, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1350 },
  landscape: { width: 1200, height: 630 },
};

interface Palette {
  bg: string;
  bg2: string;
  ink: string;
  muted: string;
  accent: string;
  accent2: string;
  onAccent: string;
  card: string;
  line: string;
  pattern: 'none' | 'dots' | 'grid' | 'rings';
}

const PALETTES: Record<ShareTheme, Palette> = {
  ledger: {
    bg: '#f6f7f9',
    bg2: '#e6edf8',
    ink: '#1b2b5b',
    muted: '#5b6579',
    accent: '#067a6b',
    accent2: '#1e6fae',
    onAccent: '#ffffff',
    card: '#ffffff',
    line: '#dde1e8',
    pattern: 'grid',
  },
  night: {
    bg: '#0b1020',
    bg2: '#17264a',
    ink: '#f3f6ff',
    muted: '#9fb0d0',
    accent: '#59e3c8',
    accent2: '#ffb84d',
    onAccent: '#08131c',
    card: '#17264a',
    line: '#2b3d67',
    pattern: 'dots',
  },
  market: {
    bg: '#fff4e5',
    bg2: '#ffe0bd',
    ink: '#3a2618',
    muted: '#8a6a4f',
    accent: '#d2691e',
    accent2: '#b23a48',
    onAccent: '#fffaf2',
    card: '#fffaf2',
    line: '#efdcc3',
    pattern: 'grid',
  },
  mint: {
    bg: '#edf9f2',
    bg2: '#d3f0e0',
    ink: '#123b2c',
    muted: '#4f7364',
    accent: '#0d8f63',
    accent2: '#f2a93b',
    onAccent: '#ffffff',
    card: '#ffffff',
    line: '#c8e6d7',
    pattern: 'dots',
  },
  rose: {
    bg: '#fff0f3',
    bg2: '#ffd3de',
    ink: '#4a1424',
    muted: '#8a5262',
    accent: '#c2185b',
    accent2: '#7b1fa2',
    onAccent: '#ffffff',
    card: '#ffffff',
    line: '#f2c9d4',
    pattern: 'rings',
  },
  ocean: {
    bg: '#061a2b',
    bg2: '#0b3d5c',
    ink: '#eaf7ff',
    muted: '#9ed1e8',
    accent: '#35d0ff',
    accent2: '#ffe066',
    onAccent: '#04202e',
    card: '#0d2a3f',
    line: '#1d4a66',
    pattern: 'rings',
  },
  sunset: {
    bg: '#2a0f3a',
    bg2: '#7a1f3d',
    ink: '#fff3e6',
    muted: '#e4b8c8',
    accent: '#ffb347',
    accent2: '#ff5d8f',
    onAccent: '#2a0f3a',
    card: '#3d1849',
    line: '#5a2a63',
    pattern: 'dots',
  },
  mono: {
    bg: '#ffffff',
    bg2: '#eeeeee',
    ink: '#111111',
    muted: '#666666',
    accent: '#c8ff00',
    accent2: '#111111',
    onAccent: '#111111',
    card: '#fafafa',
    line: '#dddddd',
    pattern: 'grid',
  },
};

export const SHARE_THEMES: readonly ShareTheme[] = [
  'ledger',
  'night',
  'market',
  'mint',
  'rose',
  'ocean',
  'sunset',
  'mono',
];

export const SHARE_STYLES: readonly ShareStyle[] = ['cards', 'strip', 'editorial'];

export function themeForPersona(persona: PersonaId): ShareTheme {
  switch (persona) {
    case 'newcomer':
      return 'mint';
    case 'replenisher':
      return 'ocean';
    case 'loyalist':
      return 'night';
    case 'devotee':
      return 'sunset';
    case 'bargain':
      return 'market';
    case 'bulk':
      return 'ledger';
    case 'weekend':
      return 'rose';
    case 'regular':
      return 'mono';
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 1 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
}

/** Word-wrap up to `maxLines`; the last line is ellipsized if it still overflows. */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines = 2,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (let index = 0; index < words.length; index += 1) {
    const word = words[index] as string;
    const candidate = current ? `${current} ${word}` : word;
    if (!current || ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    lines.push(current);
    if (lines.length === maxLines - 1) {
      lines.push(fitText(ctx, words.slice(index).join(' '), maxWidth));
      return lines;
    }
    current = word;
  }
  if (current) lines.push(current);
  return lines.slice(0, maxLines);
}

async function ensureFonts(): Promise<void> {
  const doc = typeof document === 'undefined' ? undefined : document;
  if (!doc || !doc.fonts) return;
  try {
    await Promise.all([
      doc.fonts.load('400 36px Lalezar'),
      doc.fonts.load('700 36px Vazirmatn'),
      doc.fonts.load('400 32px Vazirmatn'),
    ]);
    await doc.fonts.ready;
  } catch {
    // A missing font falls back to the system sans; the card still renders.
  }
}

const FONT_BODY = "'Vazirmatn', system-ui, sans-serif";
const FONT_DISPLAY = "'Lalezar', 'Vazirmatn', system-ui, sans-serif";

function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  palette: Palette,
): void {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, palette.bg);
  gradient.addColorStop(1, palette.bg2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  if (palette.pattern === 'none') return;
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = palette.accent;
  ctx.fillStyle = palette.accent;
  ctx.lineWidth = 2;
  if (palette.pattern === 'grid') {
    const step = 72;
    for (let x = 0; x <= width; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = 0; y <= height; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (palette.pattern === 'dots') {
    const step = 52;
    for (let x = step / 2; x < width; x += step) {
      for (let y = step / 2; y < height; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  } else {
    const step = 180;
    for (let x = step; x < width + step; x += step) {
      for (let y = step / 2; y < height + step; y += step) {
        ctx.beginPath();
        ctx.arc(x, y, step / 2.6, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }
  ctx.restore();
}

interface HeaderGeometry {
  right: number;
  contentW: number;
  margin: number;
  portrait: boolean;
}

function drawHeader(
  ctx: CanvasRenderingContext2D,
  model: ShareCardModel,
  palette: Palette,
  geometry: HeaderGeometry,
  widthScale = 1,
): number {
  const { right, contentW, margin, portrait } = geometry;
  const scale = portrait ? widthScale : widthScale * 0.82;

  ctx.textAlign = 'right';
  ctx.fillStyle = palette.ink;
  ctx.font = `400 ${Math.round((portrait ? 44 : 38) * widthScale)}px ${FONT_DISPLAY}`;
  ctx.fillText(fitText(ctx, model.brand, contentW), right, margin + 36 * scale);

  const titleSize = Math.round((portrait ? 84 : 60) * widthScale);
  const titleTop = margin + (portrait ? 164 : 124) * scale;
  const titleLine = Math.round((portrait ? 82 : 58) * widthScale);
  const titleLines = wrapText(ctx, model.title, contentW, 2);
  ctx.font = `400 ${titleSize}px ${FONT_DISPLAY}`;
  titleLines.forEach((line, index) => {
    ctx.fillText(fitText(ctx, line, contentW), right, titleTop + index * titleLine);
  });

  const subtitleY =
    titleTop + Math.max(0, titleLines.length - 1) * titleLine + (portrait ? 62 : 50) * scale;
  ctx.fillStyle = palette.muted;
  ctx.font = `400 ${Math.round((portrait ? 36 : 28) * widthScale)}px ${FONT_BODY}`;
  ctx.fillText(fitText(ctx, model.subtitle, contentW), right, subtitleY);
  const rangeY = subtitleY + (portrait ? 50 : 40) * scale;
  ctx.font = `400 ${Math.round((portrait ? 30 : 24) * widthScale)}px ${FONT_BODY}`;
  ctx.fillText(fitText(ctx, model.range, contentW), right, rangeY);

  return rangeY + (portrait ? 50 : 52) * scale;
}

function drawHighlights(
  ctx: CanvasRenderingContext2D,
  model: ShareCardModel,
  palette: Palette,
  x: number,
  top: number,
  maxWidth: number,
  portrait: boolean,
): number {
  let y = top;
  ctx.textAlign = 'right';
  ctx.font = `400 ${portrait ? 30 : 24}px ${FONT_BODY}`;
  for (const line of model.highlights) {
    if (line === '') continue;
    ctx.fillStyle = palette.accent;
    ctx.beginPath();
    ctx.arc(x - 8, y - 10, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = palette.ink;
    ctx.fillText(fitText(ctx, line, maxWidth - 34), x - 30, y);
    y += portrait ? 48 : 38;
  }
  return y;
}

function drawFooter(
  ctx: CanvasRenderingContext2D,
  model: ShareCardModel,
  palette: Palette,
  right: number,
  contentW: number,
  portrait: boolean,
): void {
  ctx.textAlign = 'right';
  ctx.fillStyle = palette.muted;
  ctx.font = `400 ${portrait ? 24 : 20}px ${FONT_BODY}`;
  ctx.fillText(fitText(ctx, model.footer, contentW), right, model.height - (portrait ? 54 : 40));
  ctx.fillStyle = palette.accent;
  ctx.fillRect(right - contentW, model.height - (portrait ? 84 : 62), contentW, 2);
}

function drawCardsStyle(
  ctx: CanvasRenderingContext2D,
  model: ShareCardModel,
  palette: Palette,
  geometry: HeaderGeometry,
): void {
  const { right, contentW, portrait } = geometry;
  const statsTop = drawHeader(ctx, model, palette, geometry);
  const columns = portrait ? 2 : Math.min(4, Math.max(1, model.stats.length));
  const gap = portrait ? 20 : 16;
  const cardW = (contentW - gap * (columns - 1)) / columns;
  const cardH = portrait ? 150 : 120;

  model.stats.forEach((stat, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = right - cardW - column * (cardW + gap);
    const y = statsTop + row * (cardH + gap);
    ctx.fillStyle = palette.card;
    roundedRect(ctx, x, y, cardW, cardH, 18);
    ctx.fill();
    ctx.strokeStyle = palette.line;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.textAlign = 'right';
    ctx.fillStyle = palette.muted;
    ctx.font = `400 ${portrait ? 26 : 22}px ${FONT_BODY}`;
    ctx.fillText(fitText(ctx, stat.label, cardW - 40), x + cardW - 20, y + (portrait ? 46 : 38));

    ctx.fillStyle = palette.ink;
    ctx.font = `700 ${portrait ? 40 : 30}px ${FONT_BODY}`;
    ctx.fillText(fitText(ctx, stat.value, cardW - 40), x + cardW - 20, y + (portrait ? 108 : 88));
  });

  const rows = Math.ceil(model.stats.length / columns);
  const top = statsTop + rows * (cardH + gap) + (portrait ? 50 : 28);
  drawHighlights(ctx, model, palette, right, top, contentW, portrait);
}

function drawStripStyle(
  ctx: CanvasRenderingContext2D,
  model: ShareCardModel,
  palette: Palette,
  geometry: HeaderGeometry,
): void {
  const { right, contentW, portrait } = geometry;
  let y = drawHeader(ctx, model, palette, geometry);
  const hero = model.stats[0];
  const rest = model.stats.slice(1);
  const heroH = portrait ? 190 : 140;

  if (hero) {
    ctx.fillStyle = palette.accent;
    roundedRect(ctx, right - contentW, y, contentW, heroH, 22);
    ctx.fill();

    ctx.textAlign = 'right';
    ctx.fillStyle = palette.onAccent;
    ctx.font = `400 ${portrait ? 28 : 22}px ${FONT_BODY}`;
    ctx.fillText(fitText(ctx, hero.label, contentW - 48), right - 24, y + (portrait ? 48 : 36));
    ctx.font = `700 ${portrait ? 62 : 46}px ${FONT_BODY}`;
    ctx.fillText(fitText(ctx, hero.value, contentW - 48), right - 24, y + (portrait ? 132 : 102));
    y += heroH + (portrait ? 34 : 24);
  }

  if (rest.length > 0) {
    const columns = portrait ? 1 : 2;
    const rowCount = Math.ceil(rest.length / columns);
    const gap = 18;
    const rowH = portrait ? 74 : 62;
    const columnW = (contentW - gap * (columns - 1)) / columns;

    for (let index = 0; index < rest.length; index += 1) {
      const column = Math.floor(index / rowCount);
      const row = index % rowCount;
      const x = right - columnW - column * (columnW + gap);
      const rowY = y + row * rowH;

      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x, rowY);
      ctx.lineTo(x + columnW, rowY);
      ctx.stroke();

      ctx.textAlign = 'right';
      ctx.fillStyle = palette.muted;
      ctx.font = `400 ${portrait ? 26 : 21}px ${FONT_BODY}`;
      ctx.fillText(fitText(ctx, rest[index]!.label, columnW * 0.55), x + columnW, rowY + 30);

      ctx.textAlign = 'left';
      ctx.fillStyle = palette.ink;
      ctx.font = `700 ${portrait ? 32 : 25}px ${FONT_BODY}`;
      ctx.fillText(fitText(ctx, rest[index]!.value, columnW * 0.4), x, rowY + 30);
    }
    y += rowCount * rowH + (portrait ? 22 : 14);
  }

  drawHighlights(ctx, model, palette, right, y + (portrait ? 26 : 18), contentW, portrait);
}

function drawEditorialStyle(
  ctx: CanvasRenderingContext2D,
  model: ShareCardModel,
  palette: Palette,
  geometry: HeaderGeometry,
): void {
  const { right, contentW, margin, portrait } = geometry;
  const gap = portrait ? 36 : 30;
  const textW = contentW * (portrait ? 0.58 : 0.56);
  const listW = contentW - textW - gap;
  // The numbers live in the left column; `right` is the narrative edge.
  const listRight = right - textW - gap;

  const titleSize = portrait ? 64 : 46;
  const titleTop = margin + (portrait ? 142 : 104);
  const titleLine = portrait ? 62 : 46;
  ctx.textAlign = 'right';
  ctx.fillStyle = palette.ink;
  ctx.font = `400 ${portrait ? 40 : 32}px ${FONT_DISPLAY}`;
  ctx.fillText(fitText(ctx, model.brand, textW), right, margin + 34);
  const titleLines = wrapText(ctx, model.title, textW, 2);
  ctx.font = `400 ${titleSize}px ${FONT_DISPLAY}`;
  titleLines.forEach((line, index) => {
    ctx.fillText(fitText(ctx, line, textW), right, titleTop + index * titleLine);
  });
  const subtitleY =
    titleTop + Math.max(0, titleLines.length - 1) * titleLine + (portrait ? 52 : 42);
  ctx.fillStyle = palette.muted;
  ctx.font = `400 ${portrait ? 30 : 24}px ${FONT_BODY}`;
  ctx.fillText(fitText(ctx, model.subtitle, textW), right, subtitleY);
  const rangeY = subtitleY + (portrait ? 40 : 32);
  ctx.font = `400 ${portrait ? 25 : 20}px ${FONT_BODY}`;
  ctx.fillText(fitText(ctx, model.range, textW), right, rangeY);

  // Divider between the narrative column and the numbers column.
  const dividerX = right - textW - gap / 2;
  ctx.strokeStyle = palette.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(dividerX, margin + 10);
  ctx.lineTo(dividerX, model.height - margin - 30);
  ctx.stroke();

  let listY = margin + (portrait ? 46 : 34);
  for (const stat of model.stats) {
    const rowH = portrait ? 112 : 72;
    ctx.textAlign = 'right';
    ctx.fillStyle = palette.muted;
    ctx.font = `400 ${portrait ? 23 : 19}px ${FONT_BODY}`;
    ctx.fillText(fitText(ctx, stat.label, listW), listRight, listY);
    ctx.fillStyle = palette.ink;
    ctx.font = `700 ${portrait ? 33 : 25}px ${FONT_BODY}`;
    ctx.fillText(fitText(ctx, stat.value, listW), listRight, listY + (portrait ? 46 : 34));
    listY += rowH;
  }

  const highlightsTop = rangeY + (portrait ? 72 : 54);
  drawHighlights(ctx, model, palette, right, highlightsTop, textW, portrait);
}

export async function renderShareCard(
  canvas: HTMLCanvasElement,
  model: ShareCardModel,
): Promise<void> {
  await ensureFonts();
  canvas.width = model.width;
  canvas.height = model.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D is unavailable');

  const palette = PALETTES[model.theme];
  const portrait = model.height > model.width;
  const margin = portrait ? 80 : 64;
  const contentW = model.width - margin * 2;

  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'alphabetic';

  drawBackground(ctx, model.width, model.height, palette);

  ctx.fillStyle = palette.accent;
  if (portrait) ctx.fillRect(0, 0, model.width, 14);
  else ctx.fillRect(model.width - 14, 0, 14, model.height);

  const geometry: HeaderGeometry = {
    right: model.width - margin,
    contentW,
    margin,
    portrait,
  };

  if (model.style === 'strip') {
    drawStripStyle(ctx, model, palette, geometry);
  } else if (model.style === 'editorial') {
    drawEditorialStyle(ctx, model, palette, geometry);
  } else {
    drawCardsStyle(ctx, model, palette, geometry);
  }

  drawFooter(ctx, model, palette, geometry.right, contentW, portrait);
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('the canvas could not be encoded as PNG'));
    }, 'image/png');
  });
}

/** Clipboard image copy where supported; false means "use download". */
export async function copyImage(blob: Blob): Promise<boolean> {
  try {
    if (typeof ClipboardItem === 'undefined' || !navigator.clipboard?.write) return false;
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    return true;
  } catch {
    return false;
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function xIntentUrl(caption: string): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(caption)}`;
}

/** Opens the X composer in a new tab. Call from a user click only. */
export function openXIntent(caption: string): void {
  window.open(xIntentUrl(caption), '_blank', 'noopener,noreferrer');
}
