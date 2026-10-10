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
  | 'reasonPinnedUnavailable'
  // D-27 redesign — "the settled bill" copy deck (brief §9)
  | 'wordmark'
  | 'headerLabel'
  | 'menuSavePdf'
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
  | 'staleNotice'
  | 'staleAction'
  | 'approxNotice'
  | 'approxAction'
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
  | 'hintAdd'
  | 'hintDismiss'
  | 'ledgerItems'
  | 'ledgerShipping'
  | 'ledgerPayable'
  | 'ledgerOldest'
  | 'actionShipments'
  | 'applyBtn'
  | 'applyingBtn'
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
  | 'loadingCalc'

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
    // D-27 redesign — "the settled bill" copy deck (brief §9)
    wordmark: 'بز خر',
    headerLabel: 'برنامهٔ پیشنهادی',
    menuSavePdf: 'ذخیره به‌صورت PDF',
    heroTitle: 'با این برنامه {saved} تومان کمتر می‌پردازید',
    heroLine: '{items} کالا در {shipments} مرسوله، با هزینهٔ ارسال',
    barCurrent: 'سبد فعلی',
    barPlan: 'با برنامهٔ بز خر',
    pctLess: '{pct}٪ کمتر',
    savedLabel: '{saved} صرفه‌جویی',
    heroHintsLink: '{n} پیشنهاد برای صرفه‌جویی بیشتر',
    plusLabel: 'اشتراک دیجی‌کالا پلاس دارم.',
    plusNote: 'هزینهٔ ارسال با مزایای پلاس حساب شده است.',
    plusDelta: 'با پلاس {x} تومان کمتر',
    staleNotice:
      'قیمت {n} کالا {ago} خوانده شده است. پیش از اعمال، قیمت‌ها دوباره بررسی می‌شوند.',
    staleAction: 'به‌روزرسانی قیمت‌ها',
    approxNotice:
      'سبد بزرگ است و این برنامه تقریبی است؛ ممکن است کمی گران‌تر از بهترین حالت باشد.',
    approxAction: 'محاسبهٔ دقیق‌تر',
    shipDigikala: 'ارسال از دیجی‌کالا',
    shipSeller: 'ارسال توسط فروشنده',
    shippingFee: 'هزینهٔ ارسال',
    freeLabel: 'رایگان',
    parcelTotal: 'جمع این مرسوله',
    reasonCount: 'خرید {n} عدد از این فروشنده',
    reasonAmount: 'خرید بالای {x} تومان',
    reasonPlus: 'رایگان با پلاس',
    reasonDigikala: 'ارسال از دیجی‌کالا',
    reasonLarge: 'هزینهٔ ثابت کالای حجیم',
    colQty: 'تعداد',
    colUnit: 'قیمت واحد',
    colLine: 'جمع',
    itemChange: 'قبلاً: {seller}، {price}',
    changeLess: '{n} کمتر',
    changeNone: 'بدون تغییر',
    whyBtn: 'چرا این فروشنده؟',
    openProduct: 'باز کردن صفحهٔ کالا',
    sellerAuto: 'پیشنهاد بز خر',
    lockedChip: 'قفل‌شده',
    unlockBtn: 'باز کردن قفل',
    lockHelper:
      'کالای قفل‌شده تغییر نمی‌کند و در بهینه‌سازی بررسی نمی‌شود.',
    whySeller: 'فروشنده',
    whyPrice: 'قیمت',
    whyEffect: 'اثر بر جمع سبد',
    whySentence:
      'قیمت این کالا در «{seller}» {x} تومان کمتر است، اما با احتساب یک ارسال جداگانه، جمع سبد {y} تومان بیشتر می‌شود.',
    hintsTitle: 'صرفه‌جویی بیشتر',
    hintSentence: '«{item}» را {n} عدد بیشتر بخرید تا ارسال «{vendor}» رایگان شود.',
    hintSaving: 'جمع سبد {x} تومان کمتر می‌شود',
    hintMore: 'فقط {x} تومان بیشتر',
    hintAdd: 'افزودن به برنامه',
    hintDismiss: 'رد کردن',
    ledgerItems: 'جمع کالاها',
    ledgerShipping: 'جمع ارسال',
    ledgerPayable: 'مبلغ قابل پرداخت',
    ledgerOldest: 'قدیمی‌ترین قیمت: {ago}',
    actionShipments: 'در {n} مرسوله',
    applyBtn: 'اعمال در سبد خرید',
    applyingBtn: 'در حال اعمال…',
    preflightProgress: 'در حال بررسی قیمت‌ها، {i} از {n}',
    priceChanged:
      'قیمت {n} کالا تغییر کرده است. مبلغ جدید {total} تومان ({delta} تومان بیشتر).',
    continueNewPrice: 'ادامه با قیمت جدید',
    recalcBtn: 'محاسبهٔ دوباره',
    cancelBtn: 'انصراف',
    outOfStock:
      '{item} دیگر در این فروشنده موجود نیست. برنامه باید دوباره محاسبه شود.',
    confirmTitle: 'اعمال برنامه در سبد خرید؟',
    confirmBody:
      '{n} کالا از {m} فروشنده به سبد شما اضافه و ردیف‌های قبلی حذف می‌شوند. سبد فعلی ذخیره می‌شود تا بتوانید آن را برگردانید. پرداختی انجام نمی‌شود.',
    statusPending: 'در انتظار',
    statusAdding: 'در حال افزودن',
    statusAdded: 'افزوده شد',
    statusFailed: 'ناموفق',
    successTitle: 'سبد خرید به‌روز شد',
    goToCart: 'رفتن به سبد خرید',
    undoCart: 'برگرداندن سبد قبلی',
    undoDone: 'سبد قبلی برگردانده شد',
    partialTitle:
      '{k} از {n} کالا اعمال نشد. ردیف‌های قبلی این کالاها سر جایشان مانده‌اند.',
    retryItem: 'تلاش دوباره',
    undoAll: 'برگرداندن همه',
    optimalMsg:
      'سبد شما از قبل بهینه است. با قیمت‌های فعلی، ترکیب ارزان‌تری پیدا نشد.',
    allLockedMsg: 'همهٔ کالاها قفل‌شده‌اند؛ چیزی برای بهینه‌سازی نیست.',
    errLogin: 'برای خواندن سبد باید وارد حساب دیجی‌کالا شوید.',
    errEmpty: 'سبد خرید شما خالی است.',
    errCalc: 'محاسبه انجام نشد. دوباره تلاش کنید.',
    loadingCalc: 'در حال محاسبه…',
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
    // D-27 redesign — "the settled bill" copy deck (brief §9)
    wordmark: 'Boz Khar',
    headerLabel: 'Suggested plan',
    menuSavePdf: 'Save as PDF',
    heroTitle: 'You pay {saved} toman less with this plan',
    heroLine: '{items} items in {shipments} shipments, shipping included',
    barCurrent: 'Current cart',
    barPlan: 'With the Boz Khar plan',
    pctLess: '{pct}% less',
    savedLabel: '{saved} saved',
    heroHintsLink: '{n} more saving suggestions',
    plusLabel: 'I have a Digikala Plus subscription.',
    plusNote: 'Shipping is calculated with Plus benefits.',
    plusDelta: '{x} toman less with Plus',
    staleNotice:
      'The price of {n} item(s) was read {ago}. Prices are re-checked before applying.',
    staleAction: 'Refresh prices',
    approxNotice:
      'This cart is large, so this plan is approximate; it may be slightly costlier than the optimum.',
    approxAction: 'Calculate exactly',
    shipDigikala: 'Shipped by Digikala',
    shipSeller: 'Shipped by the seller',
    shippingFee: 'Shipping fee',
    freeLabel: 'Free',
    parcelTotal: 'Shipment total',
    reasonCount: 'Buying {n} from this seller',
    reasonAmount: 'Spending over {x} toman',
    reasonPlus: 'Free with Plus',
    reasonDigikala: 'Shipped by Digikala',
    reasonLarge: 'Fixed large-item fee',
    colQty: 'Qty',
    colUnit: 'Unit price',
    colLine: 'Total',
    itemChange: 'Was: {seller}, {price}',
    changeLess: '{n} less',
    changeNone: 'No change',
    whyBtn: 'Why this seller?',
    openProduct: 'Open product page',
    sellerAuto: 'Boz Khar suggestion',
    lockedChip: 'Locked',
    unlockBtn: 'Unlock',
    lockHelper:
      'A locked item never changes and is skipped by the optimizer.',
    whySeller: 'Seller',
    whyPrice: 'Price',
    whyEffect: 'Effect on cart total',
    whySentence:
      'This item costs {x} toman less at “{seller}”, but with a separate shipment the cart total becomes {y} toman more.',
    hintsTitle: 'More savings',
    hintSentence:
      'Buy {n} more of “{item}” so “{vendor}” ships free.',
    hintSaving: 'Cart total becomes {x} toman less',
    hintMore: 'Only {x} toman more',
    hintAdd: 'Add to plan',
    hintDismiss: 'Dismiss',
    ledgerItems: 'Items',
    ledgerShipping: 'Shipping',
    ledgerPayable: 'Payable',
    ledgerOldest: 'Oldest price: {ago}',
    actionShipments: 'in {n} shipments',
    applyBtn: 'Apply to cart',
    applyingBtn: 'Applying…',
    preflightProgress: 'Checking prices, {i} of {n}',
    priceChanged:
      'The price of {n} item(s) changed. New total {total} toman ({delta} toman more).',
    continueNewPrice: 'Continue with new prices',
    recalcBtn: 'Recalculate',
    cancelBtn: 'Cancel',
    outOfStock:
      '{item} is no longer available from this seller. The plan must be recalculated.',
    confirmTitle: 'Apply the plan to your cart?',
    confirmBody:
      '{n} items from {m} sellers are added to your cart and the old rows are removed. Your current cart is saved so you can restore it. No payment is made.',
    statusPending: 'Pending',
    statusAdding: 'Adding',
    statusAdded: 'Added',
    statusFailed: 'Failed',
    successTitle: 'Cart updated',
    goToCart: 'Go to cart',
    undoCart: 'Restore previous cart',
    undoDone: 'Previous cart restored',
    partialTitle:
      '{k} of {n} items were not applied. Their old rows are still in your cart.',
    retryItem: 'Try again',
    undoAll: 'Restore all',
    optimalMsg:
      'Your cart is already optimal. No cheaper arrangement was found at the current prices.',
    allLockedMsg: 'Every item is locked; there is nothing to optimize.',
    errLogin: 'Sign in to your Digikala account to read the cart.',
    errEmpty: 'Your cart is empty.',
    errCalc: 'The calculation failed. Try again.',
    loadingCalc: 'Calculating…',
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
