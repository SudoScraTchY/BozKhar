Boz Khar (بز خر): result page redesign brief
For the implementing AI agent. Scope: the optimization result page and the new Apply-to-cart flow. The UI is Persian and RTL; this brief is in English. The Persian strings in section 9 are final copy.
1. Ground rules
• Change presentation and add the Apply flow only. Do not touch the optimizer's math or output contract. Where this brief needs data the optimizer does not return yet (section 8), hide that section gracefully until it exists.
• Use the project's existing framework and build tooling. If none exists: TypeScript, Preact or React, plain CSS custom properties. No UI kit and no CDN: fonts and icons are bundled (extension CSP, privacy).
• Do not add features beyond this brief. Where something is ambiguous, take the default in section 10 and mention it in your summary.
2. Critique of the current page
From the exported PDF, in priority order.
P0: wrong or blocking
1. No Apply action. The page ends at insight, so the user must redo the plan by hand in Digikala. Applying is the product's purpose.
2. Parcel totals mislead. Each vendor card ends in a bold number directly under the shipping row, but it excludes shipping. Daroobank shows 867,840 although the parcel costs 977,840 (items 867,840 + shipping 110,000). Vanil shows 1,058,000 against a real 1,246,000. Shipping must live inside the parcel total.
3. Hidden staleness. Each item carries a raw UTC ISO timestamp, and they differ by 15 hours (03:02Z vs 18:19Z). The page never says so. The footer sentence is also bidi-corrupted (the date renders reversed).
4. Unit and digits. No currency unit, Persian digits mixed with Latin ones (quantity, IDs, timestamps), and a Latin comma instead of the Persian thousands separator.
P1: trust and control
5. No why. A 44% saving with no per-item before/after, and no reason a seller was picked or shipping costs what it does (flat, promo, Plus, shipped by Digikala). Unverifiable savings feel fake.
6. Lock is invisible. The 'هر فروشنده‌ای' (any seller) dropdown on every row looks like a filter, with no locked/automatic state and no explanation.
7. Agreed features are missing: Plus switch, extra-unit hints, shipped-by-Digikala indicator, locked items.
8. The approximate-plan warning is one red sentence with no meaning, consequence or action.
9. Variant link. A machine ID is shown as the link text beside 'رفت به گونه‌ای', in a dark red that reads as an error.
P2: craft
10. Three equal KPI cards. The savings card combines a red border with green text, which send opposite signals, and red is Digikala's own brand and error color. The before/after relationship is never visualised.
11. Table headers sit off their values, 'مجموع خط' is jargon, and the table cannot collapse for a side panel.
12. Borders everywhere. Card inside card inside divider rows, so a vendor name and a product row carry the same weight.
13. A parcel splits across the page break in the PDF; there is no print stylesheet.
14. No brand presence, and the title 'گزارش' (report) names the artifact instead of the user's next step.
3. Design direction
Concept: the settled bill. One honest bill: what you would pay today, what you will pay, and where every toman goes, grouped by مرسوله (shipment) because that is how Digikala charges. Calm, thrifty, legible. It must not look like Digikala's UI (no red) or like a dashboard.
Tokens (CSS custom properties)
• --ink #1B2B5B lapis: text and the primary button
• --paper #F6F7F9 page, --surface #FFFFFF
• --saving #067A6B turquoise, --saving-bg #DDF3EF: savings only
• --caution #B26A00, --caution-bg #FFF1D6: stale and approximate
• --danger #B42318, --danger-bg #FDE8E6: errors and failures only, never links or decoration
• --line #DDE1E8, --muted #5B6579 (at least 4.5:1 on surface)
Type. Lalezar for the wordmark and H1 only; Vazirmatn (variable) for everything else. Scale 12 / 13.5 / 15 / 18 / 22 / 28 / 40. Body 15px with 1.75 line height (Persian needs air). Weights: 400 body, 600 vendor names and totals. tabular-nums on all figures. Measure at most 70ch.
Shape. Two radii with meaning: 14px for parcels, 10px for controls. Rows are flat with hairline dividers. No shadows except the sticky action bar and sheets. Links and controls use --ink with underline, never red.
Boldness lives in one place: the price bar (4.2). Everything else stays quiet.
Rejected on purpose: cream and terracotta, neon on black, KPI card trios, identical shadowed cards, arrows in button labels, numbered markers (parcels are not a sequence), entrance animations.
4. Page anatomy
The layout responds to its container, not the viewport (container queries). It must work as a full tab (max 760px, centred) and as a 360 to 480px side panel. Wireframe, mirrored for RTL (first item sits on the right):
header   wordmark                          menu
hero     H1: you pay X less
         [=======plan=======|/////saved/////]
         plan X     current Y     -44%
         [switch] I have Digikala Plus  (Z less with Plus)
notices  (stale prices) (approximate plan)
parcel   Vendor A   [shipped by Digikala]
           thumb | title, variant, was/now | qty | unit | total
           why this seller (v)          seller control
           ...
           shipping ........ fee, or free + reason chip
           parcel total .... items + shipping
parcel   Vendor B ...
hints    extra savings (max 3)
ledger   items / shipping / payable / oldest price
sticky   payable total, N shipments        [Apply to cart]
4.1 Header
Wordmark 'بز خر' (28px, small horn mark allowed, no mascot) and the label 'برنامهٔ پیشنهادی'. Overflow menu with 'ذخیره به‌صورت PDF'. Not sticky.
4.2 Hero and price bar
H1 in Lalezar (28px in the panel, 40px in the tab), copy in section 9. Under it, a 14px bar whose full length is the current cart total. The --ink segment is the plan total (55.5% in the worked example); the rest is the saved part in --saving-bg with a diagonal hatch and the label 'X صرفه‌جویی'. Under the bar: plan total (600), current total (muted), a percent chip, and one line with item and shipment counts. If the baseline split into items and shipping is unknown, show totals only. The saved segment reveals once per load (scaleX 0 to 1, 600ms, ease-out).
Worked example from the PDF: 5 items, 2 shipments, plan 2,223,840, current 4,004,670, saved 1,780,830 (44%).
4.3 Plus switch
A row under the bar: label plus live delta. Default comes from the detected session, otherwise off, and it is persisted. Toggling recomputes without blanking the page (section 6).
4.4 Notices
At most two, on --caution-bg, each with icon, one sentence and one action. Order: stale first, approximate second. Stale shows when any price is older than 30 minutes (constant). Approximate shows when solverStatus is approximate; if optimalityGap exists, put it in the sentence. Not dismissible.
4.5 Parcel
One white surface, 14px radius, 1px --line, no nested cards. Header: seller name (600) and a badge, 'ارسال از دیجی‌کالا' in --saving or 'ارسال توسط فروشنده' neutral. Then the item rows. Footer on --paper: a shipping row (label, fee, reason chip; when discounted, show the original fee struck through beside 'رایگان'), then 'جمع این مرسوله' (600) which equals items plus shipping. Large items get the chip 'هزینهٔ ثابت کالای حجیم' and the Plus switch never changes their fee.
4.6 Item row
Container at least 560px: grid thumb 56 | title and variant (flex) | qty 72 | unit price 120 | line total 120, with one header row per parcel. Header text aligns to the same edge as its values (numbers align to inline-end). Below 560px: thumb 48 | title, then a second line 'qty × unit = total', and no header row.
• Title: 2-line clamp, link to the product page in a new tab, external-link icon, accessible name 'باز کردن صفحهٔ کالا'. Variant label in --muted as human text (for example '60 عددی'), never an ID.
• Change line: 'قبلاً: seller، price' plus a chip 'N کمتر' in --saving, or 'بدون تغییر' in muted.
• Two text buttons with 44px targets: 'چرا این فروشنده؟' and the seller control.
Why disclosure. Inline expand, no modal. Lists up to 3 alternative sellers: seller, unit price, effect on cart total (words and icon, not signs). A generated sentence explains the trade-off (template in section 9).
Seller control and lock. One control replaces 'هر فروشنده‌ای'. It shows 'پیشنهاد بز خر' (auto) or a lock icon with the seller name. It opens a popover radio list: auto first, then each seller with its price. Picking a seller locks the item to it; picking auto unlocks. A locked row gets a lock icon, a 'قفل‌شده' chip and a --paper background so it reads as fixed. Every change triggers a recompute.
4.7 Hints
After the parcels, titled 'صرفه‌جویی بیشتر'. Extra-unit promo suggestions only, for items already in the cart. Show a hint only if netDelta is at most HINT_TOLERANCE times the plan total (constant 0.02; hints that save money always pass). Never render a rejected hint: in the agreed example, item Z at 90 with 'free delivery if you buy 2' is dropped, while item Y at 5 with the same promo is shown. Max 3, sorted by netDelta ascending. Each hint has a sentence, an outcome line (--saving if it saves, neutral 'فقط X تومان بیشتر' otherwise), and the buttons 'افزودن به برنامه' and 'رد کردن'. Adding raises the quantity in the plan and recomputes. When hints exist, the hero shows a link that scrolls here.
4.8 Ledger
'جمع کالاها', 'جمع ارسال', 'مبلغ قابل پرداخت' (largest), then 'قدیمی‌ترین قیمت: ۱۵ ساعت پیش' (tooltip with the Jalali date and time) and the 'به‌روزرسانی قیمت‌ها' button. Invariant: ledger payable = sum of parcel totals = hero plan figure = action bar total. Assert it in development.
4.9 Sticky action bar
Pinned to the bottom of the container. Start side: 'مبلغ قابل پرداخت', the total (22px, 600) and 'در N مرسوله'. End side: the only primary button on the page, 'اعمال در سبد خرید' (--ink fill, 48px high, min 160px wide). Disabled with a visible reason while recomputing or when there is nothing to apply.
5. Apply-to-cart flow
Depend on an interface so the transport can change: CartApplier { preflight(plan), apply(plan, onProgress), undo(snapshot) }. Whether it uses Digikala's internal API or UI automation is a separate decision (section 10).
1. Preflight (no cart changes). Re-fetch every chosen offer: price, stock, seller still offers it. Show progress in the action bar. If anything changed, open the price-change sheet (new total, difference, three choices) or the out-of-stock prompt. Never continue silently.
2. Confirm. Dialog in the tab, bottom sheet in the panel. It states how many items move, that the old rows are removed, that the current cart is saved for undo, and that no payment happens. Focus trap, Esc closes.
3. Snapshot the current cart to extension storage before any mutation.
4. Apply each changed line sequentially: add the new offer, verify it is in the cart, then remove the old line. Never remove before the add is verified. Unchanged lines and locked items are left alone.
5. Progress list in the sheet, one row per line ('در انتظار', 'در حال افزودن', 'افزوده شد', 'ناموفق'), announced through a polite live region.
6. Result. Success: 'سبد خرید به‌روز شد', primary 'رفتن به سبد خرید', secondary 'برگرداندن سبد قبلی'. Partial failure: say how many failed, say their old rows are still in the cart, offer 'تلاش دوباره' per item and 'برگرداندن همه'. No automatic retries.
7. Undo restores the snapshot with the same progress UI; keep the snapshot until the next apply.
8. Never navigate on its own, never check out, never pay.
6. States
• Loading: skeleton with the final geometry (bar, two parcels) and the text 'در حال محاسبه…'. No bare spinner.
• Recompute (Plus, lock, hint): keep the previous plan visible at 60% opacity with aria-busy, a thin progress line under the header, and the Apply button disabled. On arrival, changed figures flash --saving-bg for 400ms. No layout shift.
• Already optimal or no saving: no bar and no Apply; show the already-optimal message with the current total.
• All items locked: message, no Apply.
• Errors (not logged in, empty cart, calculation failed): one --danger-bg block saying what happened and how to fix it. Never vague.
• Offline or blocked requests: same block with a retry button.
7. Formatting, accessibility, print
• <html lang='fa' dir='rtl'>. Logical CSS only (inline-start and inline-end). Mirror directional icons. Wrap Latin and numeric runs in <bdi> or unicode-bidi: isolate.
• Numbers: Intl.NumberFormat('fa-IR') for every figure including quantities and counts (Persian digits, '٬' separator). The currency unit follows the Digikala page setting (toman or rial; do not hard-code) and sits after the number in --muted. IDs and ISO strings never appear in the UI.
• Dates: never ISO. Relative with Intl.RelativeTimeFormat('fa'); absolute in a tooltip with fa-IR-u-ca-persian, time zone Asia/Tehran.
• Express differences in words ('کمتر', 'بیشتر') plus an icon, not +/- signs (bidi).
• WCAG AA contrast. 2px --ink focus ring with offset. Targets at least 44px. Every color status also has an icon and text. Disclosure buttons use aria-expanded. The seller popover is a radio group with roving tabindex. Sheets are role=dialog with aria-modal. Tab order follows the visual RTL order.
• Motion: only the one-time bar reveal and responses to actions (disclosure, sheet, number flash). None under prefers-reduced-motion.
• Print: hide the action bar, menu and buttons; expand the why sections; break-inside: avoid on parcels; black text; Jalali print date in the footer; fonts embedded.
8. Data the page needs
• Per item: variantId, productUrl, title, variantLabel, imageUrl, qty; chosen offer (sellerId, sellerName, unitPrice, shipSource 'digikala' or 'seller', capturedAt); original offer (sellerName, unitPrice); top 3 alternatives with their effect on the cart total; lockedSellerId or null.
• Per parcel: sellerName, shipSource, shippingFee, shippingFeeBeforeDiscount, shippingReason (flat, free_by_count, free_by_amount, plus, digikala, fixed_large) and its parameter.
• Global: baselineTotal (plus baselineItems and baselineShipping if known), planTotal, itemsTotal, shippingTotal, plusEnabled, plusDelta, solverStatus (optimal or approximate), optimalityGap, hints (itemId, vendor, extraUnits, netDelta, targetParcel), currencyUnit, computedAt.
• Money is integers in the site's unit. Derive display strings from the numbers, never the reverse.
9. Copy deck (final Persian)
Element
Text
Header label
برنامهٔ پیشنهادی
Menu
ذخیره به‌صورت PDF
H1
با این برنامه {saved} تومان کمتر می‌پردازید
Hero line
{n} کالا در {m} مرسوله، با هزینهٔ ارسال
Bar labels
سبد فعلی / با برنامهٔ بز خر / {pct}٪ کمتر / {saved} صرفه‌جویی
Plus switch
اشتراک دیجی‌کالا پلاس دارم. When on: هزینهٔ ارسال با مزایای پلاس حساب شده است. Delta: با پلاس {x} تومان کمتر
Stale notice
قیمت {n} کالا {ago} خوانده شده است. پیش از اعمال، قیمت‌ها دوباره بررسی می‌شوند. Action: به‌روزرسانی قیمت‌ها
Approximate notice
سبد بزرگ است و این برنامه تقریبی است؛ ممکن است کمی گران‌تر از بهترین حالت باشد. Action: محاسبهٔ دقیق‌تر
Ship badges
ارسال از دیجی‌کالا / ارسال توسط فروشنده
Shipping rows
هزینهٔ ارسال / رایگان / جمع این مرسوله
Reason chips
خرید {n} عدد از این فروشنده / خرید بالای {x} تومان / رایگان با پلاس / ارسال از دیجی‌کالا / هزینهٔ ثابت کالای حجیم
Item change
قبلاً: {seller}، {price} / {n} کمتر / بدون تغییر
Why
چرا این فروشنده؟ / باز کردن صفحهٔ کالا. Table: فروشنده / قیمت / اثر بر جمع سبد. Sentence: قیمت این کالا در «{seller}» {x} تومان کمتر است، اما با احتساب یک ارسال جداگانه، جمع سبد {y} تومان بیشتر می‌شود.
Seller control
پیشنهاد بز خر / قفل‌شده / باز کردن قفل. Helper: کالای قفل‌شده تغییر نمی‌کند و در بهینه‌سازی بررسی نمی‌شود.
Hints
صرفه‌جویی بیشتر. Sentence: «{item}» را ۱ عدد بیشتر بخرید تا ارسال «{vendor}» رایگان شود. Outcome: جمع سبد {x} تومان کمتر می‌شود / فقط {x} تومان بیشتر. Buttons: افزودن به برنامه / رد کردن. Hero link: {n} پیشنهاد برای صرفه‌جویی بیشتر
Ledger
جمع کالاها / جمع ارسال / مبلغ قابل پرداخت / قدیمی‌ترین قیمت: {ago}
Primary button
اعمال در سبد خرید. Running: در حال اعمال…
Preflight
در حال بررسی قیمت‌ها، {i} از {n}
Price changed
قیمت {n} کالا تغییر کرده است. مبلغ جدید {total} تومان ({delta} تومان بیشتر). Buttons: ادامه با قیمت جدید / محاسبهٔ دوباره / انصراف
Out of stock
{item} دیگر در این فروشنده موجود نیست. برنامه باید دوباره محاسبه شود.
Confirm
اعمال برنامه در سبد خرید؟ {n} کالا از {m} فروشنده به سبد شما اضافه و ردیف‌های قبلی حذف می‌شوند. سبد فعلی ذخیره می‌شود تا بتوانید آن را برگردانید. پرداختی انجام نمی‌شود.
Line status
در انتظار / در حال افزودن / افزوده شد / ناموفق
Success
سبد خرید به‌روز شد / رفتن به سبد خرید / برگرداندن سبد قبلی. After undo: سبد قبلی برگردانده شد
Partial failure
{k} از {n} کالا اعمال نشد. ردیف‌های قبلی این کالاها سر جایشان مانده‌اند. Buttons: تلاش دوباره / برگرداندن همه
Already optimal
سبد شما از قبل بهینه است. با قیمت‌های فعلی، ترکیب ارزان‌تری پیدا نشد.
All locked
همهٔ کالاها قفل‌شده‌اند؛ چیزی برای بهینه‌سازی نیست.
Errors
برای خواندن سبد باید وارد حساب دیجی‌کالا شوید. / سبد خرید شما خالی است. / محاسبه انجام نشد. دوباره تلاش کنید.
Loading
در حال محاسبه…
10. Open decisions (defaults to use)
1. Lock and shared shipping. The optimizer never moves a locked item. Default: its price and its seller's shipping stay in every total so the page matches the real cart, and other items may join that seller's parcel without a second fee. Needs the owner's confirmation.
2. Hint tolerance: 2% of the plan total, a code constant, not a UI setting.
3. Cart mutation transport (internal API or UI automation): hidden behind CartApplier.
4. Stale threshold: 30 minutes, a constant.
5. If the baseline split into items and shipping is unavailable, show totals only.
11. Acceptance checklist
• Apply works end to end, including price change, out of stock, partial failure and undo.
• Parcel total includes shipping; hero, ledger, parcels and action bar all agree.
• No ISO strings, no Latin digits and no missing unit anywhere in the UI.
• Lock, Plus switch, hints, shipped-by-Digikala badge and the why disclosure are all visible and working; rejected hints are never shown.
• Works at 360px and 760px with no horizontal scroll; print never splits a parcel.
• Keyboard-only and screen-reader pass for the apply flow; AA contrast.
• No red outside error states.