/**
 * Display formatting (D-27, brief §7): Persian digits, '٬'
 * separator, currency unit after the number, relative times,
 * Jalali tooltips. No Latin digits or ISO strings may reach
 * the UI.
 */
import { describe, expect, it } from 'vitest';
import {
  absoluteDateTime,
  formatMoney,
  formatNumber,
  formatPercent,
  relativeTime,
} from '../src/results/format';

describe('results format (D-27)', () => {
  it('formats numbers with Persian digits and the ٬ separator', () => {
    expect(formatNumber(1234567, 'fa')).toBe('۱٬۲۳۴٬۵۶۷');
    expect(formatNumber(44, 'fa')).toBe('۴۴');
    // en stays Latin.
    expect(formatNumber(1234567, 'en')).toBe('1,234,567');
  });

  it('puts the currency unit after the number', () => {
    expect(formatMoney(2223840, 'fa', 'toman')).toBe('۲٬۲۲۳٬۸۴۰ تومان');
    expect(formatMoney(0, 'fa', 'toman')).toBe('۰ تومان');
    expect(formatMoney(600, 'en', 'toman')).toBe('600 toman');
    expect(formatMoney(600, 'fa', 'rial')).toBe('۶۰۰ ریال');
  });

  it('formats percents with the Persian percent sign', () => {
    expect(formatPercent(44, 'fa')).toBe('۴۴٪');
    expect(formatPercent(44, 'en')).toBe('44%');
  });

  it('renders relative times in Persian words, never ISO', () => {
    const now = Date.parse('2026-10-10T12:00:00Z');
    // 15 hours earlier — the staleness case from the brief.
    expect(relativeTime('2026-10-09T21:00:00Z', 'fa', now)).toBe('۱۵ ساعت پیش');
    expect(relativeTime('2026-10-09T21:00:00Z', 'en', now)).toBe('15 hours ago');
    // Future timestamps read as "… after" (بعد).
    expect(relativeTime('2026-10-10T12:05:00Z', 'fa', now)).toBe('۵ دقیقه بعد');
    // Sub-minute and multi-day buckets (always the exact count).
    expect(relativeTime('2026-10-10T11:59:30Z', 'fa', now)).toBe('۳۰ ثانیه پیش');
    expect(relativeTime('2026-10-08T12:00:00Z', 'fa', now)).toBe('۲ روز پیش');
    expect(relativeTime('2026-10-09T12:00:00Z', 'fa', now)).toBe('۱ روز پیش');
  });

  it('renders Jalali absolute dates in tooltips (Asia/Tehran)', () => {
    const tooltip = absoluteDateTime('2026-10-10T10:00:00Z', 'fa');
    // 10:00Z = 13:30 Tehran, 18 Mehr 1405.
    expect(tooltip).toContain('۱۴۰۵');
    expect(tooltip).toContain('مهر');
    expect(tooltip).not.toContain('2026');
    expect(absoluteDateTime('2026-10-10T10:00:00Z', 'en')).toContain('2026');
  });

  it('returns an empty string for unparseable timestamps', () => {
    expect(relativeTime('not-a-date', 'fa')).toBe('');
    expect(absoluteDateTime('not-a-date', 'fa')).toBe('');
  });
});
