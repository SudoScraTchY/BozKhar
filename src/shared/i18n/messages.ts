/**
 * Bilingual catalogs (NFR-08). fa is the default and the primary RTL
 * layout; en is the LTR secondary. All option-page strings live here so
 * no component hardcodes strings.
 */

export type MessageKey =
  | 'optionsTitle'
  | 'privacyNote'
  | 'extractorVersionLabel'
  | 'hasPlus'
  | 'hasPlusHint'
  | 'tolerancePercent'
  | 'toleranceHint'
  | 'uiLanguage'
  | 'crawlDelayMs'
  | 'crawlDelayHint'
  | 'stalenessWarnHours'
  | 'stalenessHint'
  | 'exportData'
  | 'exportHint'
  | 'clearAll'
  | 'clearAllConfirm'
  | 'save'
  | 'saved'
  | 'languageFa'
  | 'languageEn';

type Catalog = Record<MessageKey, string>;

export const messages: Record<'fa' | 'en', Catalog> = {
  fa: {
    optionsTitle: 'تنظیمات بهینه‌ساز سبد دیجی‌کالا',
    privacyNote:
      'همه‌ی محاسبات و داده‌ها روی همین مرورگر شما باقی می‌مانند؛ هیچ اطلاعاتی به سروری ارسال نمی‌شود.',
    extractorVersionLabel: 'نسخه‌ی استخراج‌کننده',
    hasPlus: 'اشتراک پلاس دارم',
    hasPlusHint:
      'اگر فعال باشد، هزینه‌ی ارسال جایی که پلاس روی آن اثر دارد، صفر در نظر گرفته می‌شود.',
    tolerancePercent: 'تلورانس پیشنهادها (درصد از جمع سبد)',
    toleranceHint: 'پیشنهادهایی که هزینه را تا این درصد بیشتر می‌کنند هم نشان داده می‌شوند.',
    uiLanguage: 'زبان رابط کاربری',
    crawlDelayMs: 'تاخیر بین بازدید صفحات (میلی‌ثانیه)',
    crawlDelayHint: 'برای احترام به سایت، بازدید صفحات با این تاخیر و به‌ترتیب انجام می‌شود.',
    stalenessWarnHours: 'آستانه‌ی هشدار کهنگی قیمت (ساعت)',
    stalenessHint: 'قیمت‌های قدیمی‌تر از این، در نتایج علامت‌گذاری می‌شوند.',
    exportData: 'دریافت خروجی داده‌ها (JSON)',
    exportHint: 'سیوطاقم مقایسه، آخرین وضعیت‌ها و تنظیمات را در یک فایل ذخیره می‌کند.',
    clearAll: 'پاک کردن همه‌ی داده‌ها',
    clearAllConfirm: 'همه‌ی داده‌های ذخیره‌شده پاک شوند؟ این کار برگشت‌پذیر نیست.',
    save: 'ذخیره',
    saved: 'ذخیره شد',
    languageFa: 'فارسی',
    languageEn: 'English',
  },
  en: {
    optionsTitle: 'Digikala Cart Optimizer - Settings',
    privacyNote: 'All computation and data stay in this browser. Nothing is ever sent to a server.',
    extractorVersionLabel: 'Extractor version',
    hasPlus: 'I have a Plus subscription',
    hasPlusHint: 'When on, delivery fees are zeroed where Plus applies (never on large items).',
    tolerancePercent: 'Hint tolerance (% of cart total)',
    toleranceHint: 'Hints that increase the total by up to this percent are still shown.',
    uiLanguage: 'UI language',
    crawlDelayMs: 'Delay between page visits (ms)',
    crawlDelayHint: 'Pages are visited one by one with this delay, to stay polite to the site.',
    stalenessWarnHours: 'Staleness warning threshold (hours)',
    stalenessHint: 'Prices older than this are flagged in results.',
    exportData: 'Export data (JSON)',
    exportHint: 'Saves the comparison list, latest snapshots, and settings to a file.',
    clearAll: 'Clear all data',
    clearAllConfirm: 'Delete every stored record? This cannot be undone.',
    save: 'Save',
    saved: 'Saved',
    languageFa: 'فارسی',
    languageEn: 'English',
  },
};

export function t(lang: 'fa' | 'en', key: MessageKey): string {
  return messages[lang][key];
}
