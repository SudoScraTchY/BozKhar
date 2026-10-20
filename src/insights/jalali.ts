/**
 * Jalali calendar helpers (no dependency).
 *
 * The order API returns `created_at` as Jalali text ("13 آبان 1404"), and
 * the range inputs are Jalali `YYYY/MM/DD` - never Gregorian. `Date.parse`
 * must never see these strings; parsing here produces a Julian day number,
 * which is the one comparable integer the whole feature uses.
 *
 * The conversion is the standard arithmetic Jalali algorithm (the same one
 * jalaali-js implements): exact for the supported break years, no lookup
 * tables, no Intl dependency. Tehran "today" is the only place Intl is
 * used, with an arithmetic fallback.
 */

export interface JalaliDate {
  year: number;
  month: number;
  day: number;
}

export interface ParsedJalali extends JalaliDate {
  /** Julian day number (UTC day index). */
  dayIndex: number;
}

const BREAKS = [
  -61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394,
  2456, 3178,
];

export const JALALI_MONTH_NAMES = [
  'فروردین',
  'اردیبهشت',
  'خرداد',
  'تیر',
  'مرداد',
  'شهریور',
  'مهر',
  'آبان',
  'آذر',
  'دی',
  'بهمن',
  'اسفند',
] as const;

/** Month-name aliases seen in the wild (older spellings / Arabic yeh). */
const MONTH_ALIASES = new Map<string, number>([
  ...JALALI_MONTH_NAMES.map((name, i) => [name, i + 1] as const),
  ['امرداد', 5],
  ['اسفندماه', 12],
]);

const PERSIAN_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

function div(a: number, b: number): number {
  return Math.trunc(a / b);
}

function mod(a: number, b: number): number {
  return a - Math.trunc(a / b) * b;
}

interface JalCal {
  /** 0 means the year is leap. */
  leap: number;
  gy: number;
  march: number;
}

function jalCal(jy: number): JalCal {
  const bl = BREAKS.length;
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0] as number;
  let jump = 0;

  if (jy < jp || jy >= (BREAKS[bl - 1] as number)) {
    throw new Error(`Invalid Jalali year ${jy}`);
  }

  for (let i = 1; i < bl; i += 1) {
    const jm = BREAKS[i] as number;
    jump = jm - jp;
    if (jy < jm) break;
    leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;

  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;

  return { leap, gy, march };
}

/** Gregorian date → Julian day number. */
function g2d(gy: number, gm: number, gd: number): number {
  let d =
    div((gy + div(gm - 8, 6) + 100100) * 1461, 4) +
    div(153 * mod(gm + 9, 12) + 2, 5) +
    gd -
    34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

/** Julian day number → Gregorian date. */
function d2g(jdn: number): { gy: number; gm: number; gd: number } {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

/** True when the Jalali year has 366 days. */
export function isJalaliLeap(year: number): boolean {
  return jalCal(year).leap === 0;
}

/** Days in a Jalali month (1..12). */
export function daysInJalaliMonth(year: number, month: number): number {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  return isJalaliLeap(year) ? 30 : 29;
}

/** A calendar-valid Jalali date (throws for out-of-range years). */
export function isValidJalaliDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  try {
    if (year < (BREAKS[0] as number) || year >= (BREAKS[BREAKS.length - 1] as number)) {
      return false;
    }
    return month >= 1 && month <= 12 && day >= 1 && day <= daysInJalaliMonth(year, month);
  } catch {
    return false;
  }
}

/** Jalali date → Julian day number. Throws on an invalid date. */
export function jalaliToDayIndex(year: number, month: number, day: number): number {
  if (!isValidJalaliDate(year, month, day)) {
    throw new RangeError(`Invalid Jalali date ${year}/${month}/${day}`);
  }
  const r = jalCal(year);
  return g2d(r.gy, 3, r.march) + (month - 1) * 31 - div(month, 7) * (month - 7) + day - 1;
}

/** Julian day number → Jalali date. */
export function dayIndexToJalali(dayIndex: number): JalaliDate {
  const gy = d2g(Math.trunc(dayIndex)).gy;
  let jy = gy - 621;
  const r = jalCal(jy);
  const jdn1f = g2d(gy, 3, r.march);
  let k = Math.trunc(dayIndex) - jdn1f;

  if (k >= 0) {
    if (k <= 185) {
      return { year: jy, month: 1 + div(k, 31), day: mod(k, 31) + 1 };
    }
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { year: jy, month: 7 + div(k, 30), day: mod(k, 30) + 1 };
}

/** Gregorian date → Jalali date (used only by the Tehran-today fallback). */
export function gregorianToJalali(gy: number, gm: number, gd: number): JalaliDate {
  return dayIndexToJalali(g2d(gy, gm, gd));
}

/** Day of week, JS convention: Sunday 0 … Saturday 6. */
export function dayOfWeek(dayIndex: number): number {
  const value = (Math.trunc(dayIndex) + 1) % 7;
  return value < 0 ? value + 7 : value;
}

/** Converts Persian (۰-۹) and Arabic-Indic (٠-٩) digits to ASCII. */
export function toLatinDigits(text: string): string {
  let out = '';
  for (const ch of text) {
    const p = PERSIAN_DIGITS.indexOf(ch);
    if (p !== -1) {
      out += String(p);
      continue;
    }
    const a = ARABIC_DIGITS.indexOf(ch);
    out += a !== -1 ? String(a) : ch;
  }
  return out;
}

/** Converts ASCII digits to Persian digits (display only). */
export function toPersianDigits(text: string): string {
  return text.replace(/[0-9]/g, (d) => PERSIAN_DIGITS[Number(d)] as string);
}

/** Normalizes Arabic letter variants and strips zero-width/diacritic marks. */
function normalizeText(raw: string): string {
  return toLatinDigits(raw)
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\u200e\u200f\u0640]/g, '')
    .replace(/[\u064b-\u065f\u0670]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses Jalali date text from the API or a user input.
 *
 * Accepted: `1404/08/13`, `1404-08-13`, `13 آبان 1404`, with Persian,
 * Arabic-Indic or ASCII digits, and trailing time text. Returns null for
 * anything invalid - callers surface an "undated" bucket rather than guess.
 */
export function parseJalaliDate(raw: string): ParsedJalali | null {
  if (typeof raw !== 'string') return null;
  const text = normalizeText(raw);
  if (text === '') return null;

  let year = 0;
  let month = 0;
  let day = 0;

  const numeric = text.match(/^(\d{4})\s*[/.-]\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})$/);
  if (numeric) {
    year = Number(numeric[1]);
    month = Number(numeric[2]);
    day = Number(numeric[3]);
  } else {
    const named = text.match(/^(\d{1,2})\s+([^\d\s]+)\s+(\d{4})/);
    if (!named) return null;
    day = Number(named[1]);
    const monthName = named[2] as string;
    const found = MONTH_ALIASES.get(monthName);
    if (!found) return null;
    month = found;
    year = Number(named[3]);
  }

  if (!isValidJalaliDate(year, month, day)) return null;
  return { year, month, day, dayIndex: jalaliToDayIndex(year, month, day) };
}

/** `1404/08/13` (ASCII by default, Persian digits on request). */
export function formatJalali(
  date: JalaliDate,
  options: { digits?: 'latin' | 'fa'; style?: 'short' | 'long' } = {},
): string {
  const style = options.style ?? 'short';
  const text =
    style === 'long'
      ? `${date.day} ${JALALI_MONTH_NAMES[date.month - 1] ?? '?'} ${date.year}`
      : `${date.year}/${String(date.month).padStart(2, '0')}/${String(date.day).padStart(2, '0')}`;
  return options.digits === 'fa' ? toPersianDigits(text) : text;
}

/** Adds (or subtracts) calendar days through the day index. */
export function addDays(date: JalaliDate, days: number): JalaliDate {
  return dayIndexToJalali(jalaliToDayIndex(date.year, date.month, date.day) + days);
}

/**
 * Today's date in Asia/Tehran.
 *
 * Intl with the Persian calendar is the primary path; the arithmetic
 * fallback pins the current UTC+03:30 offset (Iran has had no DST since
 * 2022), which is correct for the years this feature reads.
 */
export function tehranToday(now: Date = new Date()): JalaliDate {
  try {
    const parts = new Intl.DateTimeFormat('en-US-u-ca-persian', {
      timeZone: 'Asia/Tehran',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(now);
    const get = (type: string): number => {
      const part = parts.find((p) => p.type === type);
      return part ? Number(toLatinDigits(part.value)) : NaN;
    };
    const year = get('year');
    const month = get('month');
    const day = get('day');
    if (Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)) {
      return { year, month, day };
    }
  } catch {
    // fall through to the arithmetic path
  }
  const tehran = new Date(now.getTime() + 3.5 * 60 * 60 * 1000);
  return gregorianToJalali(tehran.getUTCFullYear(), tehran.getUTCMonth() + 1, tehran.getUTCDate());
}

/** Tehran today as a day index. */
export function tehranTodayDayIndex(now: Date = new Date()): number {
  const today = tehranToday(now);
  return jalaliToDayIndex(today.year, today.month, today.day);
}
