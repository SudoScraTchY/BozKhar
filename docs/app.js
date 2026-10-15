/**
 * BozKhar (بزخر) Landing Page Logic
 * Features:
 * - Interactive Cart Solver Simulation
 * - Digikala Plus toggle reactive re-calculation
 * - Tab switching for installation guides
 * - Copy to clipboard with toast notification
 */

(function () {
  'use strict';

  // Helper to convert English digits to Persian digits with thousands separator
  function formatToman(num) {
    var str = num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    var persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return str.replace(/\d/g, function (d) {
      return persianDigits[d];
    }) + ' تومان';
  }

  // Cart Data Sets
  var standardCart = {
    unoptimized: [
      { name: 'هندزفری بلوتوثی کیوسی‌وای T13', vendor: 'غرفه دیجی‌مارکت', price: 650000, shipFee: 75000, isFree: false },
      { name: 'قاب سیلیکونی گوشی شیائومی', vendor: 'موبایل آریانا', price: 120000, shipFee: 65000, isFree: false },
      { name: 'گلس محافظ صفحه سرامیکی', vendor: 'جانبی پرشین', price: 85000, shipFee: 65000, isFree: false },
      { name: 'کابل فست شارژ تایپ سی باسئوس', vendor: 'الکترو نوین', price: 235000, shipFee: 70000, isFree: false }
    ],
    optimized: [
      { name: 'هندزفری بلوتوثی کیوسی‌وای T13', vendor: 'غرفه دیجی‌پارس', price: 660000, shipFee: 0, isFree: true, note: 'ارسال رایگان غرفه' },
      { name: 'قاب سیلیکونی گوشی شیائومی', vendor: 'غرفه دیجی‌پارس', price: 125000, shipFee: 0, isFree: true, note: 'ارسال رایگان غرفه' },
      { name: 'گلس محافظ صفحه سرامیکی', vendor: 'غرفه دیجی‌پارس', price: 90000, shipFee: 0, isFree: true, note: 'ارسال رایگان غرفه' },
      { name: 'کابل فست شارژ تایپ سی باسئوس', vendor: 'الکترو نوین', price: 235000, shipFee: 75000, isFree: false }
    ],
    badgeOpt: 'تجمیع در ۲ غرفه + ارسال رایگان شرطی',
    hintText: 'با اینکه قیمت ۳ قلم جنس در «غرفه دیجی‌پارس» ۲۰ هزار تومان بالاتر بود، ولی جمع خرید از این غرفه از ۵۰۰ هزار تومان گذشت و ارسال آن کاملاً رایگان شد! ۳ مرسوله پستی مجزا حذف شدند.'
  };

  var plusCart = {
    unoptimized: [
      { name: 'هندزفری بلوتوثی کیوسی‌وای T13', vendor: 'انبار دیجی‌کالا (پلاس)', price: 670000, shipFee: 0, isFree: true, note: 'پوشش پلاس' },
      { name: 'قاب سیلیکونی گوشی شیائومی', vendor: 'غرفه متفرقه ب', price: 120000, shipFee: 65000, isFree: false, note: 'غیرپلاس' },
      { name: 'گلس محافظ صفحه سرامیکی', vendor: 'غرفه متفرقه ج', price: 85000, shipFee: 65000, isFree: false, note: 'غیرپلاس' },
      { name: 'کابل فست شارژ تایپ سی باسئوس', vendor: 'غرفه متفرقه د', price: 215000, shipFee: 70000, isFree: false, note: 'غیرپلاس' }
    ],
    optimized: [
      { name: 'هندزفری بلوتوثی کیوسی‌وای T13', vendor: 'انبار دیجی‌کالا (پلاس)', price: 650000, shipFee: 0, isFree: true, note: 'پوشش پلاس' },
      { name: 'قاب سیلیکونی گوشی شیائومی', vendor: 'انبار دیجی‌کالا (پلاس)', price: 120000, shipFee: 0, isFree: true, note: 'پوشش پلاس' },
      { name: 'گلس محافظ صفحه سرامیکی', vendor: 'انبار دیجی‌کالا (پلاس)', price: 85000, shipFee: 0, isFree: true, note: 'پوشش پلاس' },
      { name: 'کابل فست شارژ تایپ سی باسئوس', vendor: 'انبار دیجی‌کالا (پلاس)', price: 225000, shipFee: 0, isFree: true, note: 'پوشش پلاس' }
    ],
    badgeOpt: 'تجمیع کامل در انبار دیجی‌کالا (صفر شدن تمام ارسال‌ها)',
    hintText: 'با فعال بودن اشتراک دیجی‌پلاس، بزخر غرفه‌های اختصاصی را به نفع موجودی‌های رسمی و پوشش‌دار دیجی‌کالا جایگزین کرد تا تمامی هزینه‌های ارسال صفر شوند.'
  };

  // DOM Elements
  var plusToggle = document.getElementById('plusToggle');
  var optimizeBtn = document.getElementById('optimizeBtn');
  var unoptimizedItemsContainer = document.getElementById('unoptimizedItems');
  var optimizedItemsContainer = document.getElementById('optimizedItems');

  var rawItemsTotalEl = document.getElementById('rawItemsTotal');
  var rawShipTotalEl = document.getElementById('rawShipTotal');
  var rawGrandTotalEl = document.getElementById('rawGrandTotal');

  var optItemsTotalEl = document.getElementById('optItemsTotal');
  var optShipTotalEl = document.getElementById('optShipTotal');
  var optGrandTotalEl = document.getElementById('optGrandTotal');
  var optShipBadge = document.getElementById('optShipBadge');
  var savingAmountEl = document.getElementById('savingAmount');
  var simHintText = document.querySelector('.sim-hint-card .hint-text');

  var isOptimizedState = false;

  function renderList(container, items, isOptimized) {
    container.innerHTML = '';
    items.forEach(function (item) {
      var card = document.createElement('div');
      card.className = 'cart-item-card' + (isOptimized ? ' card-opt' : '');

      var mainCol = document.createElement('div');
      mainCol.className = 'item-main';

      var nameEl = document.createElement('span');
      nameEl.className = 'item-name';
      nameEl.textContent = item.name;

      var vendorEl = document.createElement('span');
      vendorEl.className = 'item-vendor';
      vendorEl.innerHTML = 'فروشنده: <span class="vendor-tag ' + (isOptimized ? 'vendor-tag-opt' : '') + '">' + item.vendor + '</span>';

      mainCol.appendChild(nameEl);
      mainCol.appendChild(vendorEl);

      var priceCol = document.createElement('div');
      priceCol.className = 'item-price-col';

      var priceEl = document.createElement('span');
      priceEl.className = 'item-price';
      priceEl.textContent = formatToman(item.price);

      var feeEl = document.createElement('span');
      if (item.isFree) {
        feeEl.className = 'ship-fee-tag ship-fee-free';
        feeEl.textContent = item.note || 'ارسال رایگان';
      } else {
        feeEl.className = 'ship-fee-tag';
        feeEl.textContent = 'ارسال: ' + formatToman(item.shipFee);
      }

      priceCol.appendChild(priceEl);
      priceCol.appendChild(feeEl);

      card.appendChild(mainCol);
      card.appendChild(priceCol);

      container.appendChild(card);
    });
  }

  function updateSimulator() {
    var data = plusToggle.checked ? plusCart : standardCart;

    // Calculate Unoptimized
    var rawItemsSum = data.unoptimized.reduce(function (sum, i) { return sum + i.price; }, 0);
    var rawShipSum = data.unoptimized.reduce(function (sum, i) { return sum + (i.isFree ? 0 : i.shipFee); }, 0);
    var rawGrand = rawItemsSum + rawShipSum;

    // Calculate Optimized
    var optItemsSum = data.optimized.reduce(function (sum, i) { return sum + i.price; }, 0);
    // Unique vendor shipping in optimized:
    var optShipSum = data.optimized.reduce(function (sum, i) { return sum + (i.isFree ? 0 : i.shipFee); }, 0);
    var optGrand = optItemsSum + optShipSum;
    var netSavings = rawGrand - optGrand;

    renderList(unoptimizedItemsContainer, data.unoptimized, false);
    renderList(optimizedItemsContainer, data.optimized, true);

    rawItemsTotalEl.textContent = formatToman(rawItemsSum);
    rawShipTotalEl.textContent = formatToman(rawShipSum);
    rawGrandTotalEl.textContent = formatToman(rawGrand);

    optItemsTotalEl.textContent = formatToman(optItemsSum);
    optShipTotalEl.textContent = formatToman(optShipSum);
    optGrandTotalEl.textContent = formatToman(optGrand);
    optShipBadge.textContent = data.badgeOpt;
    savingAmountEl.textContent = formatToman(netSavings);

    if (simHintText) {
      simHintText.innerHTML = '<strong>نکته هوشمند:</strong> ' + data.hintText;
    }
  }

  // Handle Optimize Button Click
  if (optimizeBtn) {
    optimizeBtn.addEventListener('click', function () {
      var optCol = document.getElementById('optimizedCol');
      optimizeBtn.style.transform = 'scale(0.95)';
      optimizeBtn.querySelector('.btn-text').textContent = 'در حال حل دقیق...';

      setTimeout(function () {
        optimizeBtn.style.transform = '';
        optimizeBtn.querySelector('.btn-text').textContent = 'بزخری شد!';
        
        optCol.style.boxShadow = '0 0 25px rgba(6, 122, 107, 0.45)';
        optCol.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

        setTimeout(function () {
          optCol.style.boxShadow = '';
          optimizeBtn.querySelector('.btn-text').textContent = 'بزخری کن!';
        }, 1500);
      }, 400);
    });
  }

  // Handle Plus Toggle
  if (plusToggle) {
    plusToggle.addEventListener('change', function () {
      updateSimulator();
    });
  }

  // Tabs Switching
  var tabButtons = document.querySelectorAll('.tab-btn');
  var tabContents = document.querySelectorAll('.tab-content');

  tabButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var targetTab = btn.getAttribute('data-tab');

      tabButtons.forEach(function (b) { b.classList.remove('active'); });
      tabContents.forEach(function (c) { c.classList.remove('active'); });

      btn.classList.add('active');
      var content = document.getElementById(targetTab);
      if (content) {
        content.classList.add('active');
      }
    });
  });

  // Copy to Clipboard & Toast
  var toast = document.getElementById('toast');
  var toastTimer = null;

  function showToast(msg) {
    if (!toast) return;
    toast.textContent = msg || 'کپی شد!';
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 2200);
  }

  var copyButtons = document.querySelectorAll('.btn-copy');
  copyButtons.forEach(function (btn) {
    btn.addEventListener('click', function () {
      var textToCopy = btn.getAttribute('data-copy');
      if (navigator.clipboard && textToCopy) {
        navigator.clipboard.writeText(textToCopy).then(function () {
          var originalText = btn.textContent;
          btn.textContent = '✓ کپی شد';
          showToast('در حافظه کلیپ‌بورد کپی شد');
          setTimeout(function () {
            btn.textContent = originalText;
          }, 2000);
        }).catch(function () {
          showToast('خطا در کپی');
        });
      }
    });
  });

  // Initial simulator render
  updateSimulator();

})();
