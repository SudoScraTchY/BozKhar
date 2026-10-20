import { describe, expect, it } from 'vitest';
import {
  addDays,
  dayIndexToJalali,
  dayOfWeek,
  formatJalali,
  isJalaliLeap,
  jalaliToDayIndex,
  parseJalaliDate,
  tehranToday,
  tehranTodayDayIndex,
  toLatinDigits,
  toPersianDigits,
} from '../src/insights/jalali';

const DAY_1404_01_01 = 2460756; // 2025-03-21

describe('Jalali calendar arithmetic', () => {
  it('anchors 1404/01/01 to the right Julian day', () => {
    expect(jalaliToDayIndex(1404, 1, 1)).toBe(DAY_1404_01_01);
    expect(jalaliToDayIndex(1405, 1, 1)).toBe(DAY_1404_01_01 + 365);
  });

  it('knows leap years', () => {
    expect(isJalaliLeap(1403)).toBe(true);
    expect(isJalaliLeap(1404)).toBe(false);
    expect(jalaliToDayIndex(1403, 12, 30)).toBe(DAY_1404_01_01 - 1);
    expect(() => jalaliToDayIndex(1404, 12, 30)).toThrow(/Invalid Jalali date/);
  });

  it('round-trips every month of 1404', () => {
    for (let month = 1; month <= 12; month += 1) {
      const day = month <= 6 ? 31 : month === 12 ? 29 : 30;
      const index = jalaliToDayIndex(1404, month, day);
      expect(dayIndexToJalali(index)).toEqual({ year: 1404, month, day });
    }
  });

  it('adds days across the year boundary', () => {
    expect(addDays({ year: 1403, month: 12, day: 29 }, 1)).toEqual({
      year: 1403,
      month: 12,
      day: 30,
    });
    expect(addDays({ year: 1403, month: 12, day: 30 }, 1)).toEqual({
      year: 1404,
      month: 1,
      day: 1,
    });
    expect(addDays({ year: 1404, month: 1, day: 1 }, -1)).toEqual({
      year: 1403,
      month: 12,
      day: 30,
    });
  });

  it('maps weekdays with Sunday 0 … Saturday 6', () => {
    // 2025-03-21 was a Friday; 2025-03-22 a Saturday.
    expect(dayOfWeek(DAY_1404_01_01)).toBe(5);
    expect(dayOfWeek(DAY_1404_01_01 + 1)).toBe(6);
  });
});

describe('digit normalization', () => {
  it('converts Persian and Arabic-Indic digits', () => {
    expect(toLatinDigits('۱۴۰۴/۰۸/۱۳')).toBe('1404/08/13');
    expect(toLatinDigits('١٤٠٤/٠٨/١٣')).toBe('1404/08/13');
    expect(toPersianDigits('1404')).toBe('۱۴۰۴');
  });
});

describe('parseJalaliDate', () => {
  it('parses numeric forms with any digit set', () => {
    const expected = { year: 1404, month: 8, day: 13, dayIndex: jalaliToDayIndex(1404, 8, 13) };
    expect(parseJalaliDate('1404/08/13')).toEqual(expected);
    expect(parseJalaliDate('۱۴۰۴/۰۸/۱۳')).toEqual(expected);
    expect(parseJalaliDate('١٤٠٤/٠٨/١٣')).toEqual(expected);
    expect(parseJalaliDate('1404-8-13')).toEqual(expected);
  });

  it('parses the API month-name form, with trailing time', () => {
    const expected = { year: 1404, month: 8, day: 13, dayIndex: jalaliToDayIndex(1404, 8, 13) };
    expect(parseJalaliDate('13 آبان 1404')).toEqual(expected);
    expect(parseJalaliDate('۱۳ آبان ۱۴۰۴، ساعت ۱۴:۳۰')).toEqual(expected);
    expect(parseJalaliDate('13 آبان 1404 - 14:30')).toEqual(expected);
  });

  it('accepts month-name variants and Arabic letters', () => {
    expect(parseJalaliDate('13 امرداد 1404')?.month).toBe(5);
    expect(parseJalaliDate('13 شهريور 1404')?.month).toBe(6);
  });

  it('rejects invalid dates instead of guessing', () => {
    expect(parseJalaliDate('1404/13/01')).toBeNull();
    expect(parseJalaliDate('1404/00/01')).toBeNull();
    expect(parseJalaliDate('1404/01/32')).toBeNull();
    expect(parseJalaliDate('1403/12/31')).toBeNull();
    expect(parseJalaliDate('1404/12/30')).toBeNull();
    expect(parseJalaliDate('')).toBeNull();
    expect(parseJalaliDate('not a date')).toBeNull();
    expect(parseJalaliDate('13 foo 1404')).toBeNull();
  });

  it('formats both ways', () => {
    const parsed = parseJalaliDate('1404/08/13');
    expect(formatJalali(parsed!)).toBe('1404/08/13');
    expect(formatJalali(parsed!, { digits: 'fa' })).toBe('۱۴۰۴/۰۸/۱۳');
    expect(formatJalali(parsed!, { style: 'long' })).toBe('13 آبان 1404');
  });
});

describe('Tehran today', () => {
  it('uses the Tehran calendar day, not UTC', () => {
    expect(tehranToday(new Date('2026-10-19T12:00:00Z'))).toEqual({
      year: 1405,
      month: 7,
      day: 27,
    });
    // 21:00 UTC is already the next day in Tehran.
    expect(tehranToday(new Date('2026-10-19T21:00:00Z'))).toEqual({
      year: 1405,
      month: 7,
      day: 28,
    });
  });

  it('returns a day index matching the parsed date', () => {
    const now = new Date('2026-10-19T12:00:00Z');
    const today = tehranToday(now);
    expect(tehranTodayDayIndex(now)).toBe(jalaliToDayIndex(today.year, today.month, today.day));
  });
});
