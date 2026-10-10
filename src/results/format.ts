/**
 * Display formatting for the results page (D-27, brief §7).
 *
 * Every figure the page shows goes through here so the UI never
 * leaks a Latin digit, an ISO string or a bare number:
 *  - numbers: Intl.NumberFormat('fa-IR') → Persian digits, '٬'
 *    separator, tabular figures (the CSS adds tabular-nums);
 *  - money: digits + the currency unit AFTER the number, in the
 *    site's unit (toman/rial — never hard-coded by the formatter);
 *  - dates: relative for display, Jalali absolute in tooltips
 *    (Asia/Tehran), never raw ISO.
 */

export type FormatLang = 'fa' | 'en';
export type CurrencyUnit = 'toman' | 'rial';

const numberFmt: Record<FormatLang, Intl.NumberFormat> = {
  fa: new Intl.NumberFormat('fa-IR'),
  en: new Intl.NumberFormat('en-US'),
};

/** Locale tag for the relative-time and date-time formatters. */
function localeTag(lang: FormatLang): string {
  return lang === 'fa' ? 'fa' : 'en';
}

const UNIT_LABEL: Record<FormatLang, Record<CurrencyUnit, string>> = {
  fa: { toman: 'تومان', rial: 'ریال' },
  en: { toman: 'toman', rial: 'rial' },
};

/** Digits with the locale's grouping separator (Persian '٬' in fa). */
export function formatNumber(value: number, lang: FormatLang): string {
  return numberFmt[lang].format(value);
}

/**
 * Money: formatted number + currency unit after it (the Digikala
 * convention). The unit follows the site's setting, supplied by
 * the caller — the formatter never hard-codes it.
 */
export function formatMoney(
  value: number,
  lang: FormatLang,
  unit: CurrencyUnit,
): string {
  return `${formatNumber(value, lang)} ${UNIT_LABEL[lang][unit]}`;
}

/** Percent: Persian digits + '٪' (isolated from bidi reordering). */
export function formatPercent(value: number, lang: FormatLang): string {
  return `${formatNumber(value, lang)}${lang === 'fa' ? '٪' : '%'}`;
}

type RtuUnit = 'second' | 'minute' | 'hour' | 'day' | 'month';

/** Largest unit whose threshold the absolute delta fits in. */
function relativeUnit(absSeconds: number): RtuUnit {
  if (absSeconds < 60) return 'second';
  if (absSeconds < 60 * 60) return 'minute';
  if (absSeconds < 24 * 60 * 60) return 'hour';
  if (absSeconds < 30 * 24 * 60 * 60) return 'day';
  return 'month';
}

const UNIT_SECONDS: Record<RtuUnit, number> = {
  second: 1,
  minute: 60,
  hour: 60 * 60,
  day: 24 * 60 * 60,
  month: 30 * 24 * 60 * 60,
};

const rtfCache = new Map<string, Intl.RelativeTimeFormat>();

function relativeTimeFormat(lang: FormatLang): Intl.RelativeTimeFormat {
  const tag = localeTag(lang);
  let fmt = rtfCache.get(tag);
  if (!fmt) {
    fmt = new Intl.RelativeTimeFormat(tag, { numeric: 'always' });
    rtfCache.set(tag, fmt);
  }
  return fmt;
}

/**
 * "۱۵ ساعت پیش" / "15 hours ago" / "در ۵ دقیقه" (future).
 * `iso` is a capturedAt timestamp; the raw string never reaches
 * the UI.
 */
export function relativeTime(
  iso: string,
  lang: FormatLang,
  nowMs = Date.now(),
): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const deltaSeconds = Math.round((then - nowMs) / 1000);
  const unit = relativeUnit(Math.abs(deltaSeconds));
  const value = Math.round(deltaSeconds / UNIT_SECONDS[unit]);
  return relativeTimeFormat(lang).format(value, unit);
}

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function dateTimeFormat(lang: FormatLang): Intl.DateTimeFormat {
  // fa: Jalali calendar, Tehran time zone. en: Gregorian, same
  // zone, so the tooltip always means the same instant.
  const tag =
    lang === 'fa' ? 'fa-IR-u-ca-persian' : 'en-GB';
  let fmt = dtfCache.get(tag);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat(tag, {
      timeZone: 'Asia/Tehran',
      dateStyle: 'full',
      timeStyle: 'short',
    });
    dtfCache.set(tag, fmt);
  }
  return fmt;
}

/**
 * Absolute date for tooltips: Jalali in fa
 * ("۱۴۰۵ مهر ۱۸, شنبه ساعت ۱۳:۳۰"), never ISO.
 */
export function absoluteDateTime(
  iso: string,
  lang: FormatLang,
): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  return dateTimeFormat(lang).format(new Date(then));
}
