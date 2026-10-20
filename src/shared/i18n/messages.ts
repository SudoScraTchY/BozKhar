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
  | 'torobCta'
  | 'torobHint'
  | 'torobLoading'
  | 'torobOffersTitle'
  | 'torobNoMatch'
  | 'torobError'
  | 'torobNoOffers'
  | 'torobSearchOnTorob'
  | 'torobViewOffer'
  | 'torobClose'
  | 'torobCheapest'
  | 'torobShopCount'
  | 'torobPanelNote'
  | 'capturing'
  | 'captureFailed'
  | 'tryAgain'
  | 'capturedOffersToast'
  | 'optimizeCart'
  | 'crawlProgress'
  | 'crawlRunning'
  | 'feeUnknown'
  | 'feeUnknownShort'
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
  | 'copyLabel'
  | 'copyDone'
  | 'copyFailed'
  | 'copySummary'
  | 'copySaving'
  | 'copyShipment'
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
  | 'reasonPinnedUnavailable'
  // D-27 redesign — "the settled bill" copy deck (brief §9)
  | 'wordmark'
  | 'headerLabel'
  | 'heroTitle'
  | 'heroLine'
  | 'barCurrent'
  | 'barPlan'
  | 'pctLess'
  | 'savedLabel'
  | 'heroHintsLink'
  | 'plusLabel'
  | 'plusNote'
  | 'plusDelta'
  | 'plusNoChange'
  | 'staleNotice'
  | 'staleAction'
  | 'staleItemAction'
  | 'shipDigikala'
  | 'shipSeller'
  | 'shippingFee'
  | 'freeLabel'
  | 'parcelTotal'
  | 'reasonCount'
  | 'reasonAmount'
  | 'reasonPlus'
  | 'reasonDigikala'
  | 'reasonLarge'
  | 'colQty'
  | 'colUnit'
  | 'colLine'
  | 'itemChange'
  | 'changeLess'
  | 'changeMore'
  | 'changeNone'
  | 'whyBtn'
  | 'openProduct'
  | 'sellerAuto'
  | 'lockedChip'
  | 'unlockBtn'
  | 'lockHelper'
  | 'whySeller'
  | 'whyPrice'
  | 'whyEffect'
  | 'whySentence'
  | 'hintsTitle'
  | 'hintSentence'
  | 'hintSaving'
  | 'hintMore'
  | 'hintMathUnit'
  | 'hintMathFee'
  | 'hintMathNet'
  | 'hintTolerance'
  | 'hintAdd'
  | 'hintDismiss'
  | 'ledgerItems'
  | 'ledgerShipping'
  | 'ledgerPayable'
  | 'ledgerOldest'
  | 'actionShipments'
  | 'applyBtn'
  | 'applyingBtn'
  | 'priceChangedTitle'
  | 'outOfStockTitle'
  | 'partialBody'
  | 'heroRange'
  | 'recomputeLine'
  | 'variantFallback'
  | 'parcelsTitle'
  | 'preflightProgress'
  | 'priceChanged'
  | 'continueNewPrice'
  | 'recalcBtn'
  | 'cancelBtn'
  | 'outOfStock'
  | 'confirmTitle'
  | 'confirmBody'
  | 'statusPending'
  | 'statusAdding'
  | 'statusAdded'
  | 'statusUnchanged'
  | 'statusManual'
  | 'statusFailed'
  | 'successTitle'
  | 'goToCart'
  | 'undoCart'
  | 'undoDone'
  | 'partialTitle'
  | 'retryItem'
  | 'undoAll'
  | 'optimalMsg'
  | 'allLockedMsg'
  | 'errLogin'
  | 'errEmpty'
  | 'errCalc'
  | 'errApplyNoTab'
  | 'errApplyFailed'
  | 'sellerOnlyNote'
  | 'loadingCalc'
  // Order Insights (D-39)
  | 'insightsTitle'
  | 'insightsPrivacy'
  | 'insightsReadCta'
  | 'insightsRefreshCta'
  | 'insightsOpenDigikala'
  | 'insightsLastSynced'
  | 'insightsNeverSynced'
  | 'insightsRange'
  | 'insightsRangeAll'
  | 'insightsRange30'
  | 'insightsRange90'
  | 'insightsRange180'
  | 'insightsRange365'
  | 'insightsRangeCustom'
  | 'insightsFrom'
  | 'insightsTo'
  | 'insightsApplyRange'
  | 'insightsInvalidDate'
  | 'insightsIncludeInProgress'
  | 'insightsStatusAll'
  | 'insightsStatusSent'
  | 'insightsStatusReturned'
  | 'insightsStatusInProgress'
  | 'insightsStatusCancelled'
  | 'insightsSummary'
  | 'insightsNetPaid'
  | 'insightsOrders'
  | 'insightsAverageOrder'
  | 'insightsLargestOrder'
  | 'insightsRefunds'
  | 'insightsShipping'
  | 'insightsDiscountRate'
  | 'insightsItems'
  | 'insightsVendors'
  | 'insightsCancelledAmount'
  | 'insightsInProgressAmount'
  | 'insightsInsights'
  | 'insightsInsightsBody'
  | 'insightsMedianOrder'
  | 'insightsP90Order'
  | 'insightsAverageOrdersPerMonth'
  | 'insightsRefundRate'
  | 'insightsShippingShare'
  | 'insightsTopThreeVendors'
  | 'insightsBusiestMonth'
  | 'insightsBusiestWeekday'
  | 'insightsCurrentDeliveries'
  | 'insightsCurrentDeliveriesBody'
  | 'insightsOrderRef'
  | 'insightsUnknownRefunds'
  | 'insightsCharts'
  | 'insightsMonthly'
  | 'insightsMonthlyOrders'
  | 'insightsCumulative'
  | 'insightsAverageOrderMonthly'
  | 'insightsStatusBreakdown'
  | 'insightsCategorySpend'
  | 'insightsChartHint'
  | 'insightsOrderValues'
  | 'insightsWeekdays'
  | 'insightsTopVendors'
  | 'insightsTopBrands'
  | 'insightsChartEmpty'
  | 'insightsBucketUnder500'
  | 'insightsBucket500to1m'
  | 'insightsBucket1to2m'
  | 'insightsBucket2to5m'
  | 'insightsBucket5to10m'
  | 'insightsBucketOver10m'
  | 'insightsDaySat'
  | 'insightsDaySun'
  | 'insightsDayMon'
  | 'insightsDayTue'
  | 'insightsDayWed'
  | 'insightsDayThu'
  | 'insightsDayFri'
  | 'insightsDeepTitle'
  | 'insightsDeepBody'
  | 'insightsDeepCta'
  | 'insightsDeepCancel'
  | 'insightsDeepProgress'
  | 'insightsDeepDone'
  | 'insightsDeepFailed'
  | 'insightsDeepError'
  | 'insightsDeepBased'
  | 'insightsDeepAborted'
  | 'insightsRepeatProducts'
  | 'insightsRepeatRate'
  | 'insightsReorderGap'
  | 'insightsReturnRate'
  | 'insightsItemDiscount'
  | 'insightsShipments'
  | 'insightsNoName'
  | 'insightsDays'
  | 'personaNewcomer'
  | 'personaReplenisher'
  | 'personaLoyalist'
  | 'personaDevotee'
  | 'personaBargain'
  | 'personaBulk'
  | 'personaWeekend'
  | 'personaRegular'
  | 'insightsPersonaTitle'
  | 'insightsPersonaHint'
  | 'insightsShareTitle'
  | 'insightsShareBody'
  | 'insightsThemeLedger'
  | 'insightsThemeNight'
  | 'insightsThemeMarket'
  | 'insightsThemeMint'
  | 'insightsThemeRose'
  | 'insightsThemeOcean'
  | 'insightsThemeSunset'
  | 'insightsThemeMono'
  | 'insightsStyleLabel'
  | 'insightsStyleCards'
  | 'insightsStyleStrip'
  | 'insightsStyleEditorial'
  | 'insightsSizePortrait'
  | 'insightsSizeLandscape'
  | 'insightsShowVendors'
  | 'insightsBuildCard'
  | 'insightsCopyImage'
  | 'insightsDownloadPng'
  | 'insightsShareX'
  | 'insightsCopyCaption'
  | 'insightsCopied'
  | 'insightsCopyFailed'
  | 'insightsCaption'
  | 'insightsCaptionAll'
  | 'insightsCardFooter'
  | 'insightsCardSubtitle'
  | 'insightsCardRangeAll'
  | 'insightsCardRangeFrom'
  | 'insightsCardRangeTo'
  | 'insightsCardRangeFromTo'
  | 'insightsCardTopVendor'
  | 'insightsCardRepeat'
  | 'insightsCardItems'
  | 'insightsCardOrders'
  | 'insightsShareHint'
  | 'insightsEmptyTitle'
  | 'insightsEmptyBody'
  | 'insightsLoading'
  | 'insightsPartial'
  | 'insightsAborted'
  | 'insightsAuthError'
  | 'insightsNoTab'
  | 'insightsNetworkError'
  | 'insightsNoRangeData'
  | 'insightsClearCache'
  | 'insightsClearCacheConfirm'
  | 'insightsClearCacheDone'
  | 'insightsCancelledExcluded'
  | 'insightsInProgressNote'
  | 'openInsights'
  | 'openInsightsHint'
  | 'openInsightsFromOrders'
  // Toolbar popup
  | 'popupTitle'
  | 'popupPrivacy'
  | 'popupNoData'
  | 'popupOrders'
  | 'popupNetPaid'
  | 'popupLastSync'
  | 'popupInsights'
  | 'popupInsightsHint'
  | 'popupResults'
  | 'popupResultsHint'
  | 'popupSettings'
  | 'popupSettingsHint'
  | 'popupOpenOrders'
  | 'popupStarGithub'
  | 'popupUpdateAvailable'
  | 'popupUpdateTitle';

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
    torobCta: 'مقایسه قیمت در ترب',
    torobHint: 'ارزان‌ترین فروشنده‌های این کالا را در ترب ببینید.',
    torobLoading: 'در حال گرفتن قیمت‌ها از ترب…',
    torobOffersTitle: 'ارزان‌ترین فروشنده‌های ترب',
    torobNoMatch: 'محصول مشابهی در ترب پیدا نشد.',
    torobError: 'گرفتن قیمت‌ها از ترب ناموفق بود.',
    torobNoOffers: 'فروشندهٔ فعالی برای این محصول در ترب پیدا نشد.',
    torobSearchOnTorob: 'جست‌وجو در ترب',
    torobViewOffer: 'مشاهده',
    torobClose: 'بستن',
    torobCheapest: 'کمترین قیمت',
    torobShopCount: '{count} فروشنده',
    torobPanelNote: 'قیمت‌ها از ترب؛ پیش از خرید در ترب بررسی کنید.',
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
    feeUnknownShort: 'ارسال نامشخص',
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
    copyLabel: 'رونوشت برنامه',
    copyDone: 'کپی شد',
    copyFailed: 'کپی نشد',
    copySummary: 'برنامه‌ی بهینه‌شده‌ی سبد دیجی‌کالا',
    copySaving: 'صرفه‌جویی',
    copyShipment: 'هزینه‌ی ارسال',
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
    // D-27 redesign — "the settled bill" copy deck (brief §9)
    wordmark: 'افزونه بُزخَر',
    headerLabel: 'برنامهٔ پیشنهادی',
    heroTitle: 'با این برنامه {saved} کمتر می‌پردازید',
    heroLine: '{items} کالا در {shipments} مرسوله، با هزینهٔ ارسال',
    barCurrent: 'سبد فعلی',
    barPlan: 'با برنامهٔ بُزخَر',
    pctLess: '{pct}٪ کمتر',
    savedLabel: '{saved} صرفه‌جویی',
    heroHintsLink: '{n} پیشنهاد برای صرفه‌جویی بیشتر',
    plusLabel: 'اشتراک دیجی‌کالا پلاس دارم.',
    plusNote: 'هزینهٔ ارسال با مزایای پلاس حساب شده است.',
    plusDelta: 'با پلاس {x} کمتر',
    plusNoChange: 'برای این سبد، پلاس هزینهٔ ارسال را تغییر نمی‌دهد.',
    staleNotice: 'قیمت {n} کالا {ago} خوانده شده است. پیش از اعمال، قیمت‌ها دوباره بررسی می‌شوند.',
    staleAction: 'به‌روزرسانی قیمت‌ها',
    staleItemAction: 'به‌روزرسانی این کالا',
    shipDigikala: 'ارسال از دیجی‌کالا',
    shipSeller: 'ارسال توسط فروشنده',
    shippingFee: 'هزینهٔ ارسال',
    freeLabel: 'رایگان',
    parcelTotal: 'جمع این مرسوله',
    reasonCount: 'خرید {n} عدد از این فروشنده',
    reasonAmount: 'خرید بالای {x}',
    reasonPlus: 'رایگان با پلاس',
    reasonDigikala: 'ارسال از دیجی‌کالا',
    reasonLarge: 'هزینهٔ ثابت کالای حجیم',
    colQty: 'تعداد',
    colUnit: 'قیمت واحد',
    colLine: 'جمع',
    itemChange: 'قبلاً: {seller}، {price}',
    changeLess: '{n} کمتر',
    changeMore: '{n} بیشتر',
    changeNone: 'بدون تغییر',
    whyBtn: 'چرا این فروشنده؟',
    openProduct: 'باز کردن صفحهٔ کالا',
    sellerAuto: 'پیشنهاد بُزخَر',
    lockedChip: 'قفل‌شده',
    unlockBtn: 'باز کردن قفل',
    lockHelper: 'کالای قفل‌شده تغییر نمی‌کند و در بهینه‌سازی بررسی نمی‌شود.',
    whySeller: 'فروشنده',
    whyPrice: 'قیمت',
    whyEffect: 'اثر بر جمع سبد',
    whySentence:
      'قیمت این کالا در «{seller}» {x} کمتر است، اما با احتساب یک ارسال جداگانه، جمع سبد {y} بیشتر می‌شود.',
    hintsTitle: 'صرفه‌جویی بیشتر',
    hintSentence: '«{item}» را {n} عدد بیشتر بخرید تا ارسال «{vendor}» رایگان شود.',
    hintSaving: 'جمع سبد {x} کمتر می‌شود',
    hintMore: 'فقط {x} بیشتر',
    hintMathUnit: 'یک عدد بیشتر',
    hintMathFee: 'ارسال حذف‌شده',
    hintMathNet: 'خالص اثر',
    hintTolerance: 'در تلورانس {pct}٪ شما',
    hintAdd: 'افزودن به برنامه',
    hintDismiss: 'رد کردن',
    ledgerItems: 'جمع کالاها',
    ledgerShipping: 'جمع ارسال',
    ledgerPayable: 'مبلغ قابل پرداخت',
    ledgerOldest: 'قدیمی‌ترین قیمت: {ago}',
    actionShipments: 'در {n} مرسوله',
    applyBtn: 'اعمال در سبد خرید',
    applyingBtn: 'در حال اعمال…',
    priceChangedTitle: 'قیمت تغییر کرده',
    outOfStockTitle: 'کالایی ناموجود شده',
    partialBody: 'ردیف‌های قبلی این کالاها سر جایشان مانده‌اند.',
    heroRange: 'تخمین: از {low} تا {high}',
    recomputeLine: 'در حال محاسبهٔ دوباره…',
    parcelsTitle: 'مرسوله‌ها',
    variantFallback: 'گونهٔ {id}',
    preflightProgress: 'در حال بررسی قیمت‌ها، {i} از {n}',
    priceChanged: 'قیمت {n} کالا تغییر کرده است. مبلغ جدید {total} ({delta} بیشتر).',
    continueNewPrice: 'ادامه با قیمت جدید',
    recalcBtn: 'محاسبهٔ دوباره',
    cancelBtn: 'انصراف',
    outOfStock: '{item} دیگر در این فروشنده موجود نیست. برنامه باید دوباره محاسبه شود.',
    confirmTitle: 'اعمال برنامه در سبد خرید؟',
    confirmBody:
      '{n} کالا از {m} فروشنده به سبد شما اضافه و ردیف‌های قبلی حذف می‌شوند. سبد فعلی ذخیره می‌شود تا بتوانید آن را برگردانید. پرداختی انجام نمی‌شود.',
    statusPending: 'در انتظار',
    statusAdding: 'در حال افزودن',
    statusAdded: 'افزوده شد',
    statusUnchanged: 'از قبل بهینه',
    statusManual: 'تغییر دستی',
    statusFailed: 'ناموفق',
    successTitle: 'سبد خرید به‌روز شد',
    goToCart: 'رفتن به سبد خرید',
    undoCart: 'برگرداندن سبد قبلی',
    undoDone: 'سبد قبلی برگردانده شد',
    partialTitle: '{k} از {n} کالا اعمال نشد. ردیف‌های قبلی این کالاها سر جایشان مانده‌اند.',
    retryItem: 'تلاش دوباره',
    undoAll: 'برگرداندن همه',
    optimalMsg: 'سبد شما از قبل بهینه است. با قیمت‌های فعلی، ترکیب ارزان‌تری پیدا نشد.',
    allLockedMsg: 'همهٔ کالاها قفل‌شده‌اند؛ چیزی برای بهینه‌سازی نیست.',
    errLogin: 'برای خواندن سبد باید وارد حساب دیجی‌کالا شوید.',
    errEmpty: 'سبد خرید شما خالی است.',
    errCalc: 'محاسبه انجام نشد. دوباره تلاش کنید.',
    errApplyNoTab:
      'برای اعمال برنامه، دیجی‌کالا باید در یک زبانهٔ باز مرورگر باز باشد. سپس دوباره تلاش کنید.',
    errApplyFailed: 'اعمال برنامه در سبد خرید انجام نشد. دوباره تلاش کنید.',
    sellerOnlyNote:
      'صرفه‌جویی این برنامه فقط با تغییر فروشنده به دست می‌آید؛ باید دستی در سبد اعمال شود.',
    loadingCalc: 'در حال محاسبه…',
    // Order Insights (D-39)
    insightsTitle: 'خریدهای من',
    insightsPrivacy:
      'تاریخچهٔ سفارش‌ها فقط با درخواست شما خوانده می‌شود و روی همین دستگاه می‌ماند.',
    insightsReadCta: 'خواندن تاریخچهٔ سفارش‌ها',
    insightsRefreshCta: 'به‌روزرسانی',
    insightsOpenDigikala: 'باز کردن دیجی‌کالا',
    insightsLastSynced: 'آخرین به‌روزرسانی: {time}',
    insightsNeverSynced: 'هنوز خوانده نشده',
    insightsRange: 'بازهٔ زمانی',
    insightsRangeAll: 'همه',
    insightsRange30: '۳۰ روز',
    insightsRange90: '۹۰ روز',
    insightsRange180: '۱۸۰ روز',
    insightsRange365: 'یک سال',
    insightsRangeCustom: 'بازهٔ دلخواه',
    insightsFrom: 'از',
    insightsTo: 'تا',
    insightsApplyRange: 'اعمال',
    insightsInvalidDate: 'تاریخ معتبر نیست؛ نمونه: ۱۴۰۴/۰۸/۱۳',
    insightsIncludeInProgress: 'سفارش‌های در جریان هم در پرداخت خالص حساب شوند',
    insightsStatusAll: 'همه',
    insightsStatusSent: 'تحویل‌شده',
    insightsStatusReturned: 'مرجوعی',
    insightsStatusInProgress: 'در جریان',
    insightsStatusCancelled: 'لغوشده',
    insightsSummary: 'خلاصه',
    insightsNetPaid: 'پرداخت خالص',
    insightsOrders: 'سفارش‌ها',
    insightsAverageOrder: 'میانگین سفارش',
    insightsLargestOrder: 'بزرگ‌ترین سفارش',
    insightsRefunds: 'بازگشت وجه',
    insightsShipping: 'ارسال پرداخت‌شده',
    insightsDiscountRate: 'نرخ تخفیف',
    insightsItems: 'کالاها',
    insightsVendors: 'فروشنده‌ها',
    insightsCancelledAmount: 'مبلغ سفارش‌های لغوشده',
    insightsInProgressAmount: 'در جریان',
    insightsInsights: 'تحلیل‌های کوتاه',
    insightsInsightsBody: 'چند عدد که تصویر خرید شما را سریع‌تر نشان می‌دهند.',
    insightsMedianOrder: 'میانهٔ سفارش',
    insightsP90Order: 'سقف ۹۰٪ سفارش‌ها',
    insightsAverageOrdersPerMonth: 'سفارش در ماه',
    insightsRefundRate: 'نرخ بازگشت وجه',
    insightsShippingShare: 'سهم ارسال',
    insightsTopThreeVendors: 'سهم ۳ فروشندهٔ اول',
    insightsBusiestMonth: 'بیشترین خرید: {month} با {amount}',
    insightsBusiestWeekday: 'شلوغ‌ترین روز: {day} با {n} سفارش',
    insightsCurrentDeliveries: 'تحویل‌های در جریان',
    insightsCurrentDeliveriesBody:
      'این سفارش‌ها هنوز در راه‌اند؛ مبلغشان جداگانه نمایش داده می‌شود و در تحلیل عمیق هم خوانده می‌شوند.',
    insightsOrderRef: 'سفارش {id}',
    insightsUnknownRefunds: '{n} سفارش مرجوعی مبلغ بازگشت مشخصی ندارد.',
    insightsCharts: 'نمودارها',
    insightsMonthly: 'پرداخت خالص در هر ماه',
    insightsMonthlyOrders: 'تعداد سفارش در هر ماه',
    insightsCumulative: 'خرید تجمعی',
    insightsAverageOrderMonthly: 'میانگین سفارش در هر ماه',
    insightsStatusBreakdown: 'وضعیت سفارش‌ها',
    insightsCategorySpend: 'خرید بر اساس دسته',
    insightsChartHint: 'برای دیدن مقدار هر نقطه، نشانگر را روی آن ببرید.',
    insightsOrderValues: 'اندازهٔ سفارش‌ها',
    insightsWeekdays: 'روزهای هفته',
    insightsTopVendors: 'بیشترین خرید از فروشنده‌ها',
    insightsTopBrands: 'بیشترین خرید از برندها',
    insightsChartEmpty: 'داده‌ای در این بازه نیست',
    insightsBucketUnder500: 'تا ۵۰۰ هزار',
    insightsBucket500to1m: '۵۰۰ هزار تا ۱ میلیون',
    insightsBucket1to2m: '۱ تا ۲ میلیون',
    insightsBucket2to5m: '۲ تا ۵ میلیون',
    insightsBucket5to10m: '۵ تا ۱۰ میلیون',
    insightsBucketOver10m: 'بیش از ۱۰ میلیون',
    insightsDaySat: 'شنبه',
    insightsDaySun: 'یکشنبه',
    insightsDayMon: 'دوشنبه',
    insightsDayTue: 'سه‌شنبه',
    insightsDayWed: 'چهارشنبه',
    insightsDayThu: 'پنجشنبه',
    insightsDayFri: 'جمعه',
    insightsDeepTitle: 'تحلیل عمیق',
    insightsDeepBody:
      'برای هر سفارش یک بار جزئیات کالاها و فروشنده‌ها خوانده می‌شود؛ حداکثر ۳۰۰ سفارش در هر اجرا.',
    insightsDeepCta: 'خواندن جزئیات سفارش‌ها',
    insightsDeepCancel: 'توقف',
    insightsDeepProgress: 'خواندن جزئیات {done} از {total}',
    insightsDeepDone: 'جزئیات {n} سفارش خوانده شد.',
    insightsDeepFailed: '{n} مورد ناموفق',
    insightsDeepError: 'آخرین خطا: {message}',
    insightsDeepBased: 'بر اساس {orders} سفارش؛ {details} سفارش با جزئیات',
    insightsDeepAborted: 'متوقف شد؛ آنچه خوانده شد ذخیره شد.',
    insightsRepeatProducts: 'کالاهای تکراری',
    insightsRepeatRate: 'نرخ خرید دوباره',
    insightsReorderGap: 'میانگین فاصلهٔ خرید دوباره',
    insightsReturnRate: 'نرخ مرجوعی',
    insightsItemDiscount: 'تخفیف کالاها',
    insightsShipments: 'مرسوله‌ها',
    insightsNoName: 'نامشخص',
    insightsDays: '{n} روز',
    personaNewcomer: 'تازه‌کار',
    personaReplenisher: 'خریدار تکراری',
    personaLoyalist: 'وفادار به فروشنده',
    personaDevotee: 'دوست‌دار برند',
    personaBargain: 'شکارچی تخفیف',
    personaBulk: 'خریدار عمده',
    personaWeekend: 'خریدار آخر هفته',
    personaRegular: 'خریدار منظم',
    insightsPersonaTitle: 'شما این‌گونه خرید می‌کنید',
    insightsPersonaHint: 'این شخصیت فقط از روی داده‌های همین بازه و روی همین دستگاه ساخته می‌شود.',
    insightsShareTitle: 'کارت اشتراک',
    insightsShareBody: 'یک تصویر از خلاصه بسازید. به‌طور پیش‌فرض نام فروشنده‌ها در کارت نمی‌آید.',
    insightsThemeLedger: 'دفتر',
    insightsThemeNight: 'شب',
    insightsThemeMarket: 'بازار',
    insightsThemeMint: 'نعنایی',
    insightsThemeRose: 'گل رز',
    insightsThemeOcean: 'اقیانوس',
    insightsThemeSunset: 'غروب',
    insightsThemeMono: 'تک‌رنگ',
    insightsStyleLabel: 'سبک کارت',
    insightsStyleCards: 'کارتی',
    insightsStyleStrip: 'نواری',
    insightsStyleEditorial: 'ژورنالی',
    insightsSizePortrait: 'عمودی',
    insightsSizeLandscape: 'افقی',
    insightsShowVendors: 'نمایش نام فروشنده‌ها در کارت',
    insightsBuildCard: 'ساختن کارت',
    insightsCopyImage: 'کپی تصویر',
    insightsDownloadPng: 'دانلود PNG',
    insightsShareX: 'ارسال به X',
    insightsCopyCaption: 'کپی متن',
    insightsCopied: 'کپی شد',
    insightsCopyFailed: 'کپی نشد',
    insightsCaption: '{persona} · {orders} سفارش · {amount} خرید از دیجی‌کالا',
    insightsCaptionAll: 'خریدهای من از دیجی‌کالا',
    insightsCardFooter: 'ساخته شده با افزونه بُزخَر',
    insightsCardSubtitle: 'بر اساس {n} سفارش',
    insightsCardRangeAll: 'از ابتدا تا امروز',
    insightsCardRangeFrom: 'از {from}',
    insightsCardRangeTo: 'تا {to}',
    insightsCardRangeFromTo: 'از {from} تا {to}',
    insightsCardTopVendor: '{share}٪ خرید از {vendor}',
    insightsCardRepeat: '{n} کالا دوباره خریده شده',
    insightsCardItems: '{n} کالا در {m} سفارش',
    insightsCardOrders: '{n} سفارش در این بازه',
    insightsShareHint: 'برای X فقط متن ارسال می‌شود؛ تصویر را خودتان پیوست کنید.',
    insightsEmptyTitle: 'هنوز سفارشی خوانده نشده',
    insightsEmptyBody:
      'برای شروع، «خواندن تاریخچهٔ سفارش‌ها» را بزنید. هیچ‌چیز خودکار خوانده نمی‌شود.',
    insightsLoading: 'در حال خواندن…',
    insightsPartial: 'بخشی از داده‌ها خوانده شد؛ می‌توانید دوباره تلاش کنید.',
    insightsAborted: 'متوقف شد؛ آنچه خوانده شد نگه داشته شد.',
    insightsAuthError: 'برای خواندن سفارش‌ها باید در دیجی‌کالا وارد شده باشید.',
    insightsNoTab: 'برای خواندن سفارش‌ها، دیجی‌کالا باید در یک زبانهٔ باز باشد.',
    insightsNetworkError: 'خواندن سفارش‌ها انجام نشد. دوباره تلاش کنید.',
    insightsNoRangeData: 'در این بازه سفارشی نیست.',
    insightsClearCache: 'پاک کردن داده‌های سفارش‌ها',
    insightsClearCacheConfirm: 'داده‌های ذخیره‌شدهٔ سفارش‌ها پاک شوند؟',
    insightsClearCacheDone: 'داده‌های سفارش‌ها پاک شد.',
    insightsCancelledExcluded: 'سفارش‌های لغوشده و اقلامشان در جمع‌های بالا حساب نمی‌شوند.',
    insightsInProgressNote:
      'سفارش‌های در جریان (تحویل‌های فعلی) به‌طور پیش‌فرض در جمع پرداخت خالص حساب می‌شوند.',
    openInsights: 'خریدهای من',
    openInsightsHint: 'خلاصهٔ همهٔ سفارش‌های دیجی‌کالا، فقط روی همین دستگاه.',
    openInsightsFromOrders: 'خریدهای من با افزونه بُزخَر',
    popupTitle: 'افزونه بُزخَر',
    popupPrivacy: 'همه‌چیز روی همین دستگاه می‌ماند؛ هیچ داده‌ای به سرور نمی‌رود.',
    popupNoData: 'هنوز سفارشی خوانده نشده است.',
    popupOrders: 'سفارش',
    popupNetPaid: 'پرداخت خالص',
    popupLastSync: 'آخرین به‌روزرسانی: {time}',
    popupInsights: 'خریدهای من',
    popupInsightsHint: 'خلاصه، تحلیل عمیق و کارت اشتراک',
    popupResults: 'نتیجهٔ بهینه‌سازی سبد',
    popupResultsHint: 'آخرین مقایسه و پیشنهادهای سبد',
    popupSettings: 'تنظیمات',
    popupSettingsHint: 'زبان، پلاس و رفتار افزونه',
    popupOpenOrders: 'باز کردن سفارش‌های دیجی‌کالا',
    popupStarGithub: 'ستاره دادن به بُزخَر در گیت‌هاب',
    popupUpdateAvailable: 'به‌روزرسانی v{version}',
    popupUpdateTitle: 'نسخهٔ تازه در گیت‌هاب منتشر شده است',
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
    torobCta: 'Compare prices on Torob',
    torobHint: 'See the cheapest sellers for this product on Torob.',
    torobLoading: 'Fetching prices from Torob…',
    torobOffersTitle: 'Cheapest Torob sellers',
    torobNoMatch: 'No matching product was found on Torob.',
    torobError: 'Could not fetch prices from Torob.',
    torobNoOffers: 'No active seller was found for this product on Torob.',
    torobSearchOnTorob: 'Search Torob',
    torobViewOffer: 'View',
    torobClose: 'Close',
    torobCheapest: 'Lowest price',
    torobShopCount: '{count} sellers',
    torobPanelNote: 'Prices come from Torob; verify them there before buying.',
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
    feeUnknownShort: 'Shipping unknown',
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
    copyLabel: 'Copy plan',
    copyDone: 'Copied',
    copyFailed: 'Copy failed',
    copySummary: 'Optimized Digikala cart plan',
    copySaving: 'Savings',
    copyShipment: 'Shipping',
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
    // D-27 redesign — "the settled bill" copy deck (brief §9)
    wordmark: 'BozKhar extension',
    headerLabel: 'Suggested plan',
    heroTitle: 'You pay {saved} less with this plan',
    heroLine: '{items} items in {shipments} shipments, shipping included',
    barCurrent: 'Current cart',
    barPlan: 'With the BozKhar plan',
    pctLess: '{pct}% less',
    savedLabel: '{saved} saved',
    heroHintsLink: '{n} more saving suggestions',
    plusLabel: 'I have a Digikala Plus subscription.',
    plusNote: 'Shipping is calculated with Plus benefits.',
    plusDelta: '{x} less with Plus',
    plusNoChange: 'Plus does not change the shipping cost of this cart.',
    staleNotice: 'The price of {n} item(s) was read {ago}. Prices are re-checked before applying.',
    staleAction: 'Refresh prices',
    staleItemAction: 'Refresh this item',
    shipDigikala: 'Shipped by Digikala',
    shipSeller: 'Shipped by the seller',
    shippingFee: 'Shipping fee',
    freeLabel: 'Free',
    parcelTotal: 'Shipment total',
    reasonCount: 'Buying {n} from this seller',
    reasonAmount: 'Spending over {x}',
    reasonPlus: 'Free with Plus',
    reasonDigikala: 'Shipped by Digikala',
    reasonLarge: 'Fixed large-item fee',
    colQty: 'Qty',
    colUnit: 'Unit price',
    colLine: 'Total',
    itemChange: 'Was: {seller}, {price}',
    changeLess: '{n} less',
    changeMore: '{n} more',
    changeNone: 'No change',
    whyBtn: 'Why this seller?',
    openProduct: 'Open product page',
    sellerAuto: 'BozKhar suggestion',
    lockedChip: 'Locked',
    unlockBtn: 'Unlock',
    lockHelper: 'A locked item never changes and is skipped by the optimizer.',
    whySeller: 'Seller',
    whyPrice: 'Price',
    whyEffect: 'Effect on cart total',
    whySentence:
      'This item costs {x} less at “{seller}”, but with a separate shipment the cart total becomes {y} more.',
    hintsTitle: 'More savings',
    hintSentence: 'Buy {n} more of “{item}” so “{vendor}” ships free.',
    hintSaving: 'Cart total becomes {x} less',
    hintMore: 'Only {x} more',
    hintMathUnit: 'One more unit',
    hintMathFee: 'Delivery removed',
    hintMathNet: 'Net effect',
    hintTolerance: 'within your {pct}% tolerance',
    hintAdd: 'Add to plan',
    hintDismiss: 'Dismiss',
    ledgerItems: 'Items',
    ledgerShipping: 'Shipping',
    ledgerPayable: 'Payable',
    ledgerOldest: 'Oldest price: {ago}',
    actionShipments: 'in {n} shipments',
    applyBtn: 'Apply to cart',
    applyingBtn: 'Applying…',
    priceChangedTitle: 'Price changed',
    outOfStockTitle: 'An item is out of stock',
    partialBody: 'The old rows for these items are still in your cart.',
    heroRange: 'Estimate: {low} to {high}',
    recomputeLine: 'Recalculating…',
    parcelsTitle: 'Shipments',
    variantFallback: 'Variant {id}',
    preflightProgress: 'Checking prices, {i} of {n}',
    priceChanged: 'The price of {n} item(s) changed. New total {total} ({delta} more).',
    continueNewPrice: 'Continue with new prices',
    recalcBtn: 'Recalculate',
    cancelBtn: 'Cancel',
    outOfStock: '{item} is no longer available from this seller. The plan must be recalculated.',
    confirmTitle: 'Apply the plan to your cart?',
    confirmBody:
      '{n} items from {m} sellers are added to your cart and the old rows are removed. Your current cart is saved so you can restore it. No payment is made.',
    statusPending: 'Pending',
    statusAdding: 'Adding',
    statusAdded: 'Added',
    statusUnchanged: 'Already optimal',
    statusManual: 'Change by hand',
    statusFailed: 'Failed',
    successTitle: 'Cart updated',
    goToCart: 'Go to cart',
    undoCart: 'Restore previous cart',
    undoDone: 'Previous cart restored',
    partialTitle: '{k} of {n} items were not applied. Their old rows are still in your cart.',
    retryItem: 'Try again',
    undoAll: 'Restore all',
    optimalMsg:
      'Your cart is already optimal. No cheaper arrangement was found at the current prices.',
    allLockedMsg: 'Every item is locked; there is nothing to optimize.',
    errLogin: 'Sign in to your Digikala account to read the cart.',
    errEmpty: 'Your cart is empty.',
    errCalc: 'The calculation failed. Try again.',
    errApplyNoTab: 'Applying needs Digikala open in a browser tab. Open it, then try again.',
    errApplyFailed: 'Applying the plan to your cart did not work. Try again.',
    sellerOnlyNote:
      'This plan saves only by changing the seller, which must be applied by hand in your cart.',
    loadingCalc: 'Calculating…',
    // Order Insights (D-39)
    insightsTitle: 'My orders',
    insightsPrivacy: 'Your order history is read only when you ask, and stays on this device.',
    insightsReadCta: 'Read order history',
    insightsRefreshCta: 'Refresh',
    insightsOpenDigikala: 'Open Digikala',
    insightsLastSynced: 'Last synced: {time}',
    insightsNeverSynced: 'Not read yet',
    insightsRange: 'Date range',
    insightsRangeAll: 'All time',
    insightsRange30: '30 days',
    insightsRange90: '90 days',
    insightsRange180: '180 days',
    insightsRange365: 'One year',
    insightsRangeCustom: 'Custom',
    insightsFrom: 'From',
    insightsTo: 'To',
    insightsApplyRange: 'Apply',
    insightsInvalidDate: 'That date is not valid; example: 1404/08/13',
    insightsIncludeInProgress: 'Count in-progress orders in net paid',
    insightsStatusAll: 'All',
    insightsStatusSent: 'Delivered',
    insightsStatusReturned: 'Returned',
    insightsStatusInProgress: 'In progress',
    insightsStatusCancelled: 'Cancelled',
    insightsSummary: 'Summary',
    insightsNetPaid: 'Net paid',
    insightsOrders: 'Orders',
    insightsAverageOrder: 'Average order',
    insightsLargestOrder: 'Largest order',
    insightsRefunds: 'Refunds',
    insightsShipping: 'Shipping paid',
    insightsDiscountRate: 'Discount rate',
    insightsItems: 'Items',
    insightsVendors: 'Vendors',
    insightsCancelledAmount: 'Cancelled order amount',
    insightsInProgressAmount: 'In progress',
    insightsInsights: 'Quick insights',
    insightsInsightsBody: 'A few numbers that sketch your shopping.',
    insightsMedianOrder: 'Median order',
    insightsP90Order: '90th percentile order',
    insightsAverageOrdersPerMonth: 'Orders per month',
    insightsRefundRate: 'Refund rate',
    insightsShippingShare: 'Shipping share',
    insightsTopThreeVendors: 'Top 3 vendors share',
    insightsBusiestMonth: 'Biggest month: {month} with {amount}',
    insightsBusiestWeekday: 'Busiest day: {day} with {n} orders',
    insightsCurrentDeliveries: 'Current deliveries',
    insightsCurrentDeliveriesBody:
      'These orders are still on the way; their amounts are shown separately and they are included in deep analysis.',
    insightsOrderRef: 'Order {id}',
    insightsUnknownRefunds: '{n} returned order(s) have no known refund amount.',
    insightsCharts: 'Charts',
    insightsMonthly: 'Net paid by month',
    insightsMonthlyOrders: 'Orders per month',
    insightsCumulative: 'Cumulative spend',
    insightsAverageOrderMonthly: 'Average order by month',
    insightsStatusBreakdown: 'Order status',
    insightsCategorySpend: 'Spend by category',
    insightsChartHint: 'Hover a point to see its value.',
    insightsOrderValues: 'Order values',
    insightsWeekdays: 'Days of the week',
    insightsTopVendors: 'Top vendors',
    insightsTopBrands: 'Top brands',
    insightsChartEmpty: 'No data in this range',
    insightsBucketUnder500: 'under 500k',
    insightsBucket500to1m: '500k–1M',
    insightsBucket1to2m: '1–2M',
    insightsBucket2to5m: '2–5M',
    insightsBucket5to10m: '5–10M',
    insightsBucketOver10m: 'over 10M',
    insightsDaySat: 'Saturday',
    insightsDaySun: 'Sunday',
    insightsDayMon: 'Monday',
    insightsDayTue: 'Tuesday',
    insightsDayWed: 'Wednesday',
    insightsDayThu: 'Thursday',
    insightsDayFri: 'Friday',
    insightsDeepTitle: 'Deep analysis',
    insightsDeepBody: 'Reads each order’s items and sellers once, up to 300 orders per run.',
    insightsDeepCta: 'Read order details',
    insightsDeepCancel: 'Stop',
    insightsDeepProgress: 'Reading detail {done} of {total}',
    insightsDeepDone: 'Read details for {n} orders.',
    insightsDeepFailed: '{n} failed',
    insightsDeepError: 'Last error: {message}',
    insightsDeepBased: 'Based on {orders} orders; {details} with details',
    insightsDeepAborted: 'Stopped; everything read was kept.',
    insightsRepeatProducts: 'Repeat products',
    insightsRepeatRate: 'Repeat rate',
    insightsReorderGap: 'Average reorder gap',
    insightsReturnRate: 'Return rate',
    insightsItemDiscount: 'Item discount',
    insightsShipments: 'Shipments',
    insightsNoName: 'Unknown',
    insightsDays: '{n} days',
    personaNewcomer: 'Newcomer',
    personaReplenisher: 'The replenisher',
    personaLoyalist: 'Vendor loyalist',
    personaDevotee: 'Brand devotee',
    personaBargain: 'Bargain hunter',
    personaBulk: 'Bulk buyer',
    personaWeekend: 'Weekend shopper',
    personaRegular: 'Regular shopper',
    insightsPersonaTitle: 'How you shop',
    insightsPersonaHint: 'Computed locally from this range; nothing leaves the device.',
    insightsShareTitle: 'Share card',
    insightsShareBody:
      'Build an image of the summary. Vendor names are hidden on the card by default.',
    insightsThemeLedger: 'Ledger',
    insightsThemeNight: 'Night',
    insightsThemeMarket: 'Market',
    insightsThemeMint: 'Mint',
    insightsThemeRose: 'Rose',
    insightsThemeOcean: 'Ocean',
    insightsThemeSunset: 'Sunset',
    insightsThemeMono: 'Mono',
    insightsStyleLabel: 'Card style',
    insightsStyleCards: 'Cards',
    insightsStyleStrip: 'Strip',
    insightsStyleEditorial: 'Editorial',
    insightsSizePortrait: 'Portrait',
    insightsSizeLandscape: 'Landscape',
    insightsShowVendors: 'Show vendor names on the card',
    insightsBuildCard: 'Build card',
    insightsCopyImage: 'Copy image',
    insightsDownloadPng: 'Download PNG',
    insightsShareX: 'Share to X',
    insightsCopyCaption: 'Copy caption',
    insightsCopied: 'Copied',
    insightsCopyFailed: 'Copy failed',
    insightsCaption: '{persona} · {orders} orders · {amount} on Digikala',
    insightsCaptionAll: 'My Digikala order history',
    insightsCardFooter: 'Made with the BozKhar extension',
    insightsCardSubtitle: 'Based on {n} orders',
    insightsCardRangeAll: 'From the beginning to today',
    insightsCardRangeFrom: 'From {from}',
    insightsCardRangeTo: 'to {to}',
    insightsCardRangeFromTo: '{from} – {to}',
    insightsCardTopVendor: '{share}% of spend at {vendor}',
    insightsCardRepeat: '{n} product(s) bought again',
    insightsCardItems: '{n} items across {m} orders',
    insightsCardOrders: '{n} orders in this range',
    insightsShareHint: 'X receives text only; attach the image yourself.',
    insightsEmptyTitle: 'No order history read yet',
    insightsEmptyBody: 'Press “Read order history” to start. Nothing is read automatically.',
    insightsLoading: 'Reading…',
    insightsPartial: 'Part of the data was read; you can try again.',
    insightsAborted: 'Stopped; everything read was kept.',
    insightsAuthError: 'Sign in to Digikala to read your orders.',
    insightsNoTab: 'Digikala must be open in a tab to read your orders.',
    insightsNetworkError: 'Could not read your orders. Try again.',
    insightsNoRangeData: 'No orders in this range.',
    insightsClearCache: 'Clear order data',
    insightsClearCacheConfirm: 'Delete the cached order data?',
    insightsClearCacheDone: 'Order data cleared.',
    insightsCancelledExcluded: 'Cancelled orders and their items are not part of the totals above.',
    insightsInProgressNote:
      'In-progress orders (current deliveries) count toward net paid by default.',
    openInsights: 'Order insights',
    openInsightsHint: 'A summary of all your Digikala orders, only on this device.',
    openInsightsFromOrders: 'My orders with the BozKhar extension',
    popupTitle: 'BozKhar extension',
    popupPrivacy: 'Everything stays on this device; no data is sent to a server.',
    popupNoData: 'No order history read yet.',
    popupOrders: 'orders',
    popupNetPaid: 'net paid',
    popupLastSync: 'Last synced: {time}',
    popupInsights: 'My orders',
    popupInsightsHint: 'Summary, deep analysis and share card',
    popupResults: 'Cart optimization results',
    popupResultsHint: 'Your latest comparison and suggestions',
    popupSettings: 'Settings',
    popupSettingsHint: 'Language, Plus and extension behavior',
    popupOpenOrders: 'Open Digikala orders',
    popupStarGithub: 'Star BozKhar on GitHub',
    popupUpdateAvailable: 'Update v{version}',
    popupUpdateTitle: 'A newer release is available on GitHub',
  },
};

/**
 * The opening lines of the crawl overlay (D-36). The crawl's real progress
 * ("i of N", broadcast by the service worker) always outranks these, so they
 * only cover the seconds before the first product is captured - a slow start
 * should read as work in progress, not as a hang. Flavour, not status: they
 * are rotated, never counted.
 */
export const crawlStartingLines: Record<'fa' | 'en', readonly string[]> = {
  fa: [
    'داریم قیمت غرفه‌ها را می‌خوانیم…',
    'هزینه‌ی ارسال هر غرفه را مقایسه می‌کنیم…',
    'فروشنده‌های هر کالا را جمع می‌کنیم…',
    'دنبال غرفه‌ای هستیم که ارزان‌تر تمام شود…',
    'مرسوله‌های سنگین را جدا حساب می‌کنیم…',
    'می‌بینیم پلاس روی کدام ارسال اثر دارد…',
    'تخفیف‌های شرطی را دنبال می‌کنیم…',
    'قیمت‌ها را یکی‌یکی ثبت می‌کنیم…',
    'ترکیب‌های مختلف را روی کاغذ می‌آوریم…',
    'افزونه بُزخَر دارد چانه می‌زند…',
    'فروشنده‌ها یکی‌یکی مرور می‌شوند؛ کمی صبر…',
    'هر غرفه یک مرسوله است؛ همه را می‌شماریم…',
    'دنبال سقف ارسال رایگان می‌گردیم…',
    'موجودی انبار غرفه‌ها را چک می‌کنیم…',
    'کالاهای ناموجود را کنار می‌گذاریم…',
    'حساب می‌کنیم کدام چیدمان کمترین کرایه را دارد…',
    'رایگان‌شدن ارسال با یک قلم بیشتر را می‌سنجیم…',
    'قیمت‌های تکراری را پاک می‌کنیم…',
    'سبد را قلم‌به‌قلم می‌رویم…',
    'هنوز در حال خواندن صفحه‌ی غرفه‌ها هستیم…',
    'داریم ریاضیات این خرید را مرتب می‌کنیم…',
    'کمی دیگر؛ چند غرفه مانده…',
    'قیمت‌های مشکوک را کنار می‌زنیم…',
    'جمع نهایی نزدیک است…',
    'این حوصله‌ی افزونه بُزخَر است، نه کندی!',
    'داریم ارزان‌ترین راه را پیدا می‌کنیم…',
  ],
  en: [
    'Reading the sellers’ prices…',
    'Comparing what each seller charges for delivery…',
    'Collecting every seller of every item…',
    'Looking for the package that ends up cheapest…',
    'Counting large items separately…',
    'Checking where Plus covers the shipping…',
    'Chasing the conditional discounts…',
    'Recording the prices one by one…',
    'Sketching the possible arrangements…',
    'The BozKhar extension is haggling…',
    'Walking the sellers one at a time; one moment…',
    'Every seller is its own shipment; counting them all…',
    'Looking for the free-shipping threshold…',
    'Checking what each seller has in stock…',
    'Setting the out-of-stock offers aside…',
    'Finding the arrangement with the least delivery cost…',
    'Weighing one more unit against free shipping…',
    'Dropping the duplicate prices…',
    'Going through the cart item by item…',
    'Still reading the seller pages…',
    'Tidying up the arithmetic of this basket…',
    'Almost there; a few sellers left…',
    'Discarding the implausible prices…',
    'The final total is close…',
    'This is patience, not slowness!',
    'Finding the cheapest way to buy it…',
  ],
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
