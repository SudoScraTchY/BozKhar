import { describe, expect, it } from 'vitest';
import { barChartSvg, escapeXml, lineChartSvg } from '../src/insights/charts';

const opts = {
  title: 'Monthly spend',
  desc: 'Net paid per month',
  points: [
    { label: 'Farvardin', value: 100_000 },
    { label: 'Ordibehesht', value: 200_000 },
    { label: 'Khordad', value: 400_000 },
  ],
  formatValue: (v: number) => `${v} T`,
};

describe('escapeXml', () => {
  it('escapes markup and both quote styles', () => {
    expect(escapeXml(`<script>&"'`)).toBe('&lt;script&gt;&amp;&quot;&apos;');
  });
});

describe('barChartSvg', () => {
  it('carries a title, a description and the img role', () => {
    const svg = barChartSvg(opts);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('<title');
    expect(svg).toContain('Monthly spend');
    expect(svg).toContain('<desc');
    expect(svg).toContain('Net paid per month');
    expect(svg).toMatch(/aria-labelledby="bk-chart-[^"]+ bk-chart-[^"]+"/);
  });

  it('draws one bar per point, scaled to the maximum', () => {
    const svg = barChartSvg(opts);
    const heights = [...svg.matchAll(/class="bk-bar"[^>]*height="([\d.]+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(heights).toHaveLength(3);
    expect(heights[0]).toBeCloseTo(45, 1);
    expect(heights[1]).toBeCloseTo(90, 1);
    expect(heights[2]).toBeCloseTo(180, 1);
  });

  it('applies per-point colours and rejects anything that is not #rrggbb', () => {
    const svg = barChartSvg({
      ...opts,
      points: [
        { label: 'sent', value: 2, color: '#067a6b' },
        { label: 'cancelled', value: 1, color: '#b42318' },
        { label: 'bad', value: 1, color: 'javascript:alert(1)' },
      ],
    });
    expect(svg).toContain('style="fill:#067a6b"');
    expect(svg).toContain('style="fill:#b42318"');
    expect(svg).not.toContain('javascript:alert');
  });

  it('escapes every label and value it prints', () => {
    const svg = barChartSvg({
      title: '<script>alert(1)</script>',
      desc: 'x & y',
      points: [{ label: '<b>"bold"</b>', value: 1 }],
      formatValue: () => '<i>1</i>',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<b>');
    expect(svg).not.toContain('<i>');
    expect(svg).toContain('&lt;script&gt;');
    expect(svg).toContain('&amp;');
  });

  it('never emits NaN and clamps negative values to zero', () => {
    const svg = barChartSvg({
      title: 'Odd',
      desc: '',
      points: [
        { label: 'a', value: -5 },
        { label: 'b', value: Number.NaN },
        { label: 'c', value: 10 },
      ],
    });
    expect(svg).not.toContain('NaN');
    const heights = [...svg.matchAll(/class="bk-bar"[^>]*height="([\d.]+)"/g)].map((m) =>
      Number(m[1]),
    );
    expect(heights).toEqual([0, 0, 180]);
  });

  it('limits the number of x labels on dense charts', () => {
    const points = Array.from({ length: 20 }, (_, i) => ({ label: `m${i}`, value: i + 1 }));
    const svg = barChartSvg({ ...opts, points, maxLabels: 5 });
    const labels = svg.match(/class="bk-bar-label"/g) ?? [];
    expect(labels.length).toBeLessThanOrEqual(5);
    expect(labels.length).toBeGreaterThanOrEqual(4);
  });

  it('renders an empty state without bars', () => {
    const svg = barChartSvg({ ...opts, points: [], emptyLabel: 'Nothing <yet>' });
    expect(svg).not.toContain('class="bk-bar"');
    expect(svg).toContain('Nothing &lt;yet&gt;');
  });

  it('is deterministic for the same input', () => {
    expect(barChartSvg(opts)).toBe(barChartSvg(opts));
  });
});

describe('lineChartSvg', () => {
  it('draws a line, an area and one dot per point', () => {
    const svg = lineChartSvg(opts);
    expect(svg).toContain('role="img"');
    expect(svg).toContain('class="bk-line"');
    expect(svg).toContain('class="bk-line-area"');
    expect(svg.match(/class="bk-dot"/g)).toHaveLength(3);
    expect(svg).not.toContain('NaN');
  });

  it('escapes labels and values', () => {
    const svg = lineChartSvg({
      title: '<script>alert(1)</script>',
      desc: 'x & y',
      points: [{ label: '<b>"bold"</b>', value: 1 }],
      formatValue: () => '<i>1</i>',
    });
    expect(svg).not.toContain('<script>');
    expect(svg).not.toContain('<b>');
    expect(svg).not.toContain('<i>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('renders an empty state without a line', () => {
    const svg = lineChartSvg({ ...opts, points: [], emptyLabel: 'Nothing <yet>' });
    expect(svg).not.toContain('class="bk-line"');
    expect(svg).toContain('Nothing &lt;yet&gt;');
  });
});
