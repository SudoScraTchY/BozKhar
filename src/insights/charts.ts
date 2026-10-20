/**
 * Hand-built SVG bar charts (no chart library, D-15).
 *
 * Every label goes through escapeXml; the chart carries `<title>/<desc>`
 * and `role="img"` so a screen reader gets the same summary a sighted
 * reader gets. The builders are pure strings - the page injects them.
 */

export interface ChartPoint {
  label: string;
  value: number;
  /** Optional per-bar fill (status breakdown); invalid values are ignored. */
  color?: string;
}

export interface BarChartOptions {
  title: string;
  desc: string;
  points: readonly ChartPoint[];
  width?: number;
  height?: number;
  /** Display formatting for value labels and per-bar tooltips. */
  formatValue?: (value: number) => string;
  /** Show at most this many x labels (values still shown in tooltips). */
  maxLabels?: number;
  emptyLabel?: string;
}

const DEFAULT_WIDTH = 720;
const DEFAULT_HEIGHT = 260;
const MARGIN = { top: 34, right: 18, bottom: 46, left: 92 };

export function escapeXml(text: string): string {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function hashId(text: string): string {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function safeValue(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Only plain #rrggbb colours reach the SVG; everything else uses the CSS default. */
function safeColor(value: string | undefined): string | null {
  return value !== undefined && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function truncate(text: string, max = 16): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

export function barChartSvg(options: BarChartOptions): string {
  const width = options.width ?? DEFAULT_WIDTH;
  const height = options.height ?? DEFAULT_HEIGHT;
  const formatValue = options.formatValue ?? ((value: number) => String(value));
  const maxLabels = options.maxLabels ?? 10;
  const points = options.points.map((p) => ({
    label: p.label,
    value: safeValue(p.value),
    color: safeColor(p.color),
  }));
  const id = `bk-chart-${hashId(`${options.title}|${points.length}|${points[0]?.label ?? ''}`)}`;
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  const plotX = MARGIN.left;
  const plotY = MARGIN.top;
  const plotW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotH = Math.max(1, height - MARGIN.top - MARGIN.bottom);
  const max = points.reduce((m, p) => Math.max(m, p.value), 0);

  const grid: string[] = [];
  for (let step = 0; step <= 4; step += 1) {
    const y = plotY + (plotH * step) / 4;
    grid.push(
      `<line class="bk-grid" x1="${plotX}" y1="${y.toFixed(2)}" x2="${(plotX + plotW).toFixed(2)}" y2="${y.toFixed(2)}"/>`,
    );
    if (max > 0) {
      const tick = max * (1 - step / 4);
      grid.push(
        `<text class="bk-axis-label" x="${(plotX - 10).toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="end">${escapeXml(truncate(formatValue(tick), 15))}</text>`,
      );
    }
  }

  const bars: string[] = [];
  if (points.length > 0) {
    const slot = plotW / points.length;
    const barW = Math.max(2, Math.min(64, slot * 0.68));
    const labelEvery = Math.max(1, Math.ceil(points.length / maxLabels));

    points.forEach((point, index) => {
      const barH = max > 0 ? (point.value / max) * plotH : 0;
      const x = plotX + slot * index + (slot - barW) / 2;
      const y = plotY + plotH - barH;
      const label = escapeXml(point.label);
      const value = escapeXml(formatValue(point.value));
      const fill = point.color ? ` style="fill:${point.color}"` : '';
      bars.push(
        `<g class="bk-bar-group">` +
          `<rect class="bk-bar" data-index="${index}"${fill} x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${barW.toFixed(2)}" height="${barH.toFixed(2)}" rx="3">` +
          `<title>${label}: ${value}</title>` +
          `</rect>` +
          (points.length <= 12
            ? `<text class="bk-bar-value" x="${(x + barW / 2).toFixed(2)}" y="${(y - 6).toFixed(2)}" text-anchor="middle">${value}</text>`
            : '') +
          (index % labelEvery === 0
            ? `<text class="bk-bar-label" x="${(x + barW / 2).toFixed(2)}" y="${(plotY + plotH + 22).toFixed(2)}" text-anchor="middle">${escapeXml(truncate(point.label))}</text>`
            : '') +
          `</g>`,
      );
    });
  }

  const empty =
    points.length === 0
      ? `<text class="bk-chart-empty" x="${width / 2}" y="${plotY + plotH / 2}" text-anchor="middle">${escapeXml(
          options.emptyLabel ?? '',
        )}</text>`
      : '';

  return (
    `<svg class="bk-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}" xmlns="http://www.w3.org/2000/svg">` +
    `<title id="${titleId}">${escapeXml(options.title)}</title>` +
    `<desc id="${descId}">${escapeXml(options.desc)}</desc>` +
    grid.join('') +
    bars.join('') +
    empty +
    `</svg>`
  );
}

export interface LineChartOptions {
  title: string;
  desc: string;
  points: readonly ChartPoint[];
  width?: number;
  height?: number;
  formatValue?: (value: number) => string;
  maxLabels?: number;
  emptyLabel?: string;
  /** Fill the area under the line. */
  area?: boolean;
}

/**
 * A line chart for trends (cumulative spend, average order value). The
 * points are safe-clamped and every label is escaped, same contract as
 * the bar builder.
 */
export function lineChartSvg(options: LineChartOptions): string {
  const width = options.width ?? 960;
  const height = options.height ?? 360;
  const formatValue = options.formatValue ?? ((value: number) => String(value));
  const maxLabels = options.maxLabels ?? 12;
  const points = options.points.map((p) => ({ label: p.label, value: safeValue(p.value) }));
  const id = `bk-line-${hashId(`${options.title}|${points.length}|${points[0]?.label ?? ''}`)}`;
  const titleId = `${id}-title`;
  const descId = `${id}-desc`;

  const plotX = MARGIN.left;
  const plotY = MARGIN.top;
  const plotW = Math.max(1, width - MARGIN.left - MARGIN.right);
  const plotH = Math.max(1, height - MARGIN.top - MARGIN.bottom);
  const max = points.reduce((m, p) => Math.max(m, p.value), 0);

  const grid: string[] = [];
  for (let step = 0; step <= 4; step += 1) {
    const y = plotY + (plotH * step) / 4;
    grid.push(
      `<line class="bk-grid" x1="${plotX}" y1="${y.toFixed(2)}" x2="${(plotX + plotW).toFixed(2)}" y2="${y.toFixed(2)}"/>`,
    );
    if (max > 0) {
      const tick = max * (1 - step / 4);
      grid.push(
        `<text class="bk-axis-label" x="${(plotX - 10).toFixed(2)}" y="${(y + 4).toFixed(2)}" text-anchor="end">${escapeXml(truncate(formatValue(tick), 15))}</text>`,
      );
    }
  }

  if (points.length === 0) {
    return (
      `<svg class="bk-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}" xmlns="http://www.w3.org/2000/svg">` +
      `<title id="${titleId}">${escapeXml(options.title)}</title>` +
      `<desc id="${descId}">${escapeXml(options.desc)}</desc>` +
      grid.join('') +
      `<text class="bk-chart-empty" x="${width / 2}" y="${plotY + plotH / 2}" text-anchor="middle">${escapeXml(options.emptyLabel ?? '')}</text>` +
      `</svg>`
    );
  }

  const xAt = (index: number): number =>
    plotX + (points.length === 1 ? plotW / 2 : (plotW * index) / (points.length - 1));
  const yAt = (value: number): number => plotY + plotH - (max > 0 ? (value / max) * plotH : 0);
  const line = points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'}${xAt(index).toFixed(2)} ${yAt(point.value).toFixed(2)}`,
    )
    .join(' ');
  const baseline = plotY + plotH;
  const area =
    options.area === false
      ? ''
      : `<path class="bk-line-area" d="${line} L${xAt(points.length - 1).toFixed(2)} ${baseline.toFixed(2)} L${xAt(0).toFixed(2)} ${baseline.toFixed(2)} Z"/>`;

  const labelEvery = Math.max(1, Math.ceil(points.length / maxLabels));
  const dots = points
    .map((point, index) => {
      const x = xAt(index);
      const y = yAt(point.value);
      const label = escapeXml(point.label);
      const value = escapeXml(formatValue(point.value));
      return (
        `<g class="bk-line-group">` +
        `<circle class="bk-dot" cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="4">` +
        `<title>${label}: ${value}</title>` +
        `</circle>` +
        (index % labelEvery === 0
          ? `<text class="bk-bar-label" x="${x.toFixed(2)}" y="${(baseline + 22).toFixed(2)}" text-anchor="middle">${escapeXml(truncate(point.label))}</text>`
          : '') +
        `</g>`
      );
    })
    .join('');

  return (
    `<svg class="bk-chart" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="${titleId} ${descId}" xmlns="http://www.w3.org/2000/svg">` +
    `<title id="${titleId}">${escapeXml(options.title)}</title>` +
    `<desc id="${descId}">${escapeXml(options.desc)}</desc>` +
    grid.join('') +
    area +
    `<path class="bk-line" d="${line}"/>` +
    dots +
    `</svg>`
  );
}
