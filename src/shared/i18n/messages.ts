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
  | 'languageEn'
  // T03.4/T03.5 surfaces (09-ui-spec Surfaces 1-2)
  | 'addToComparison'
  | 'inComparison'
  | 'capturing'
  | 'captureFailed'
  | 'tryAgain'
  | 'capturedOffersToast'
  | 'optimizeCart'
  | 'crawlProgress'
  | 'crawlRunning'
  | 'feeUnknown'
  | 'crawlAborted'
  | 'crawlFinished'
  | 'crawlStarting'
  | 'crawlStartFailed'
  | 'abortCrawl'
  // T05.1/T05.2 results page (09-ui-spec Surface 3)
  | 'resultsTitle'
  | 'currentTotal'
  | 'optimizedTotal'
  | 'savings'
  | 'savingsNone'
  | 'savingsUnknown'
  | 'estimateCaveat'
  | 'approximateNotice'
  | 'emptyTitle'
  | 'emptyBody'
  | 'planTitle'
  // T05.3 lock controls (D-06 model made visible)
  | 'lockAny'
  | 'lockPin'
  | 'lockBan'
  | 'itemsSubtotal'
  | 'deliverySubtotal'
  | 'grandTotal'
  | 'deliveryFee'
  | 'unitPrice'
  | 'quantity'
  | 'lineTotal'
  | 'feeRegular'
  | 'feePlusCovered'
  | 'feePromoWaived'
  | 'feeLargeItem'
  | 'feeAlreadyPaidByLock'
  | 'switchToVariant'
  | 'pricesAsOf'
  | 'unsolvedTitle'
  | 'reasonNoVendor'
  | 'reasonOutOfStock'
  | 'reasonPinnedUnavailable';

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
    addToComparison: 'افزودن به مقایسه',
    inComparison: 'در مقایسه',
    capturing: 'در حال دریافت…',
    captureFailed: 'دریافت ناموفق بود',
    tryAgain: 'تلاش دوباره',
    capturedOffersToast: 'برای «{variant}»، {count} فروشنده ثبت شد.',
    optimizeCart: 'بهینه‌سازی سبد خرید',
    crawlProgress: 'بررسی {done} از {total} محصول…',
    crawlAborted: 'بررسی متوقف شد. نتایج تا همین‌جا ذخیره شده‌اند.',
    crawlFinished: 'بررسی کامل شد؛ {failed} مورد ناموفق.',
    crawlStarting: 'در حال شروع بررسی سبد…',
    crawlRunning: 'در حال بررسی سبد…',
    feeUnknown: 'هزینه‌ی ارسال این فروشنده نامشخص است؛ حداقل ممکن نشان داده شده.',
    crawlStartFailed:
      'برقراری ارتباط با سرویس‌دهنده‌ی پس‌زمینه ناموفق؛ افزونه را دوباره بارگذاری کنید.',
    abortCrawl: 'توقف',
    resultsTitle: 'گزارش بهینه‌سازی سبد خرید',
    currentTotal: 'مجموع فعلی سبد',
    optimizedTotal: 'مجموع بهینه',
    savings: 'صرفه‌جویی',
    savingsNone: 'چینش ارزان‌تری یافت نشد',
    savingsUnknown: 'مقایسه امکان‌پذیر نیست؛ هزینه‌ی ارسالِ برخی فروشنده‌ها ناشناخته است.',
    lockAny: 'هر فروشنده‌ای',
    lockPin: 'قفل به',
    lockBan: 'بدون',
    estimateCaveat:
      'هزینه‌ی ارسالِ برخی فروشنده‌ها ناشناخته است؛ مجموع‌ها تخمینی‌اند و کران پایین در کارت اول آمده است.',
    approximateNotice: 'سبد بزرگ است؛ این برنامه تقریبی است (دقیق نیست).',
    emptyTitle: 'هنوز چیزی برای مقایسه جمع‌آوری نشده',
    emptyBody:
      'در صفحه‌ی کالا «افزودن به مقایسه» را بزنید، یا در صفحه‌ی سبد «بهینه‌سازی سبد خرید» را بزنید تا سبد کامل ثبت شود.',
    planTitle: 'برنامه',
    itemsSubtotal: 'مجموع کالاها',
    deliverySubtotal: 'مجموع ارسال',
    grandTotal: 'مجموع کل',
    deliveryFee: 'هزینه‌ی ارسال',
    unitPrice: 'قیمت هر واحد',
    quantity: 'تعداد',
    lineTotal: 'مجموع خط',
    feeRegular: 'عادی',
    feePlusCovered: 'پوشش‌داده‌شده توسط پلاس',
    feePromoWaived: 'حذف‌شده با پیشنهاد',
    feeLargeItem: 'کالای بزرگ و سنگین (پلاس معاف است)',
    feeAlreadyPaidByLock: 'پیش‌پرداخت‌شده به دلیل قفل',
    switchToVariant: 'رفت به گونه‌ی {variant}',
    pricesAsOf: 'قیمت‌ها تا {time} ثبت شده‌اند',
    unsolvedTitle: 'بهینه‌سازی نشد',
    reasonNoVendor: 'فروشنده‌ای در دسترس نیست',
    reasonOutOfStock: 'همه‌ی گزینه‌ها ناموجود هستند',
    reasonPinnedUnavailable: 'فروشنده‌ی قفل‌شده موجود نیست',
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
    addToComparison: 'Add to comparison',
    inComparison: 'In comparison',
    capturing: 'Capturing…',
    captureFailed: 'Capture failed',
    tryAgain: 'Try again',
    capturedOffersToast: 'Captured {count} offers for “{variant}”.',
    optimizeCart: 'Optimize this cart',
    crawlProgress: 'Checking {done} of {total} items…',
    crawlAborted: 'Crawl stopped. Everything so far is kept.',
    crawlFinished: 'Crawl complete; {failed} item(s) failed.',
    crawlStarting: 'Starting the cart crawl…',
    crawlRunning: 'Reviewing the cart…',
    feeUnknown: "This seller's delivery fee is unknown; the minimum possible is shown.",
    crawlStartFailed: 'Could not reach the background service worker; please reload the extension.',
    abortCrawl: 'Stop',
    resultsTitle: 'Cart optimization report',
    currentTotal: 'Current cart total',
    optimizedTotal: 'Optimized total',
    savings: 'Savings',
    savingsNone: 'No cheaper arrangement found',
    savingsUnknown: 'Cannot compare — some vendors’ delivery fees are unknown.',
    lockAny: 'Any vendor',
    lockPin: 'Pin to',
    lockBan: 'Without',
    estimateCaveat:
      'Some sellers’ delivery fees are unknown; totals are estimates, with the honest lower bound shown first.',
    approximateNotice: 'This cart is large; the plan is approximate (not exact).',
    emptyTitle: 'Nothing captured for comparison yet',
    emptyBody:
      'Use “Add to comparison” on product pages, or “Optimize this cart” on the cart page to capture the whole cart.',
    planTitle: 'The plan',
    itemsSubtotal: 'Items subtotal',
    deliverySubtotal: 'Delivery subtotal',
    grandTotal: 'Grand total',
    deliveryFee: 'Delivery fee',
    unitPrice: 'Unit price',
    quantity: 'Qty',
    lineTotal: 'Line total',
    feeRegular: 'regular',
    feePlusCovered: 'Plus-covered',
    feePromoWaived: 'promo-waived',
    feeLargeItem: 'large item (Plus exempt)',
    feeAlreadyPaidByLock: 'already paid by your lock',
    switchToVariant: 'switch to variant {variant}',
    pricesAsOf: 'Prices as of {time}',
    unsolvedTitle: 'Could not optimize',
    reasonNoVendor: 'no vendor available',
    reasonOutOfStock: 'all offers out of stock',
    reasonPinnedUnavailable: 'the pinned vendor is unavailable',
  },
};

/** Replaces {placeholders} in a catalog string. */
export function formatMessage(
  lang: 'fa' | 'en',
  key: MessageKey,
  vars: Record<string, string | number>,
): string {
  let out: string = messages[lang][key];
  for (const [k, v] of Object.entries(vars)) {
    out = out.replaceAll(`{${k}}`, String(v));
  }
  return out;
}

export function t(lang: 'fa' | 'en', key: MessageKey): string {
  return messages[lang][key];
}
