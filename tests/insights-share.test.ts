import { describe, expect, it } from 'vitest';
import {
  renderShareCard,
  SHARE_SIZES,
  SHARE_THEMES,
  themeForPersona,
  xIntentUrl,
} from '../src/insights/share';

describe('share themes', () => {
  it('maps every persona to one of the eight palettes', () => {
    const themes = [
      'newcomer',
      'replenisher',
      'loyalist',
      'devotee',
      'bargain',
      'bulk',
      'weekend',
      'regular',
    ] as const;
    for (const persona of themes) {
      expect(SHARE_THEMES).toContain(themeForPersona(persona));
    }
    expect(SHARE_THEMES).toHaveLength(8);
    expect(themeForPersona('loyalist')).toBe('night');
    expect(themeForPersona('bargain')).toBe('market');
    expect(themeForPersona('newcomer')).toBe('mint');
    expect(themeForPersona('regular')).toBe('mono');
  });

  it('ships the two intended sizes', () => {
    expect(SHARE_SIZES.portrait).toEqual({ width: 1080, height: 1350 });
    expect(SHARE_SIZES.landscape).toEqual({ width: 1200, height: 630 });
  });
});

describe('editorial layout', () => {
  it('draws the stats in the left column, clear of the narrative column', async () => {
    const calls: Array<{ text: string; x: number }> = [];
    const gradient = { addColorStop: () => undefined };
    const ctx = {
      direction: '',
      textAlign: '',
      textBaseline: '',
      fillStyle: '',
      strokeStyle: '',
      font: '',
      lineWidth: 1,
      globalAlpha: 1,
      createLinearGradient: () => gradient,
      measureText: (text: string) => ({ width: text.length * 10 }),
      fillText: (text: string, x: number) => calls.push({ text, x }),
      fillRect: () => undefined,
      beginPath: () => undefined,
      moveTo: () => undefined,
      lineTo: () => undefined,
      arcTo: () => undefined,
      closePath: () => undefined,
      fill: () => undefined,
      stroke: () => undefined,
      arc: () => undefined,
      save: () => undefined,
      restore: () => undefined,
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ctx,
    } as unknown as HTMLCanvasElement;

    await renderShareCard(canvas, {
      theme: 'ledger',
      style: 'editorial',
      width: 1080,
      height: 1350,
      brand: 'برند',
      title: 'خریدار',
      subtitle: 'زیرنویس',
      range: 'از ابتدا',
      stats: [
        { label: 'آمار یک', value: '۱' },
        { label: 'آمار دو', value: '۲' },
      ],
      highlights: ['یک نکته'],
      footer: 'پاورقی',
      caption: '',
      showVendors: false,
    });

    const statCalls = calls.filter((call) => call.text.startsWith('آمار'));
    expect(statCalls).toHaveLength(2);
    // right (1000) - textW (533.6) - gap (36) = 430.4
    for (const call of statCalls) expect(call.x).toBeLessThan(431);
    expect(calls.find((call) => call.text === 'خریدار')?.x).toBe(1000);
  });
});

describe('x intent', () => {
  it('encodes the caption and carries no image', () => {
    const url = xIntentUrl('خریدهای من: ۱٬۲۰۰٬۰۰۰ تومان\n#بزخر');
    expect(url.startsWith('https://x.com/intent/tweet?text=')).toBe(true);
    expect(url).not.toContain('\n');
    expect(url).toContain(encodeURIComponent('خریدهای من'));
    expect(decodeURIComponent(url.split('text=')[1] as string)).toBe(
      'خریدهای من: ۱٬۲۰۰٬۰۰۰ تومان\n#بزخر',
    );
  });
});
