/**
 * BozKhar (بزخر) Landing Page Logic
 * Features:
 * - Interactive Cart Solver Simulation with multi-step realistic solving motion
 * - Number ticker / count-up animation
 * - Digikala Plus toggle reactive re-calculation
 * - Staggered card entry animations
 * - Tab switching for installation guides
 * - Copy to clipboard with toast notification
 * - IntersectionObserver scroll reveal
 */

(function () {
  'use strict';

  // Helper to convert English digits to Persian digits with thousands separator
  function formatToman(num) {
    var str = Math.round(num).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    var persianDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    return str.replace(/\d/g, function (d) {
      return persianDigits[d];
    }) + ' تومان';
  }

  // Number Ticker / Counter Animation
  function animateValue(element, start, end, duration) {
    if (!element) return;
    var startTime = null;
    element.classList.add('updating');

    function step(timestamp) {
      if (!startTime) startTime = timestamp;
      var progress = Math.min((timestamp - startTime) / duration, 1);
      // Ease out cubic
      var easeProgress = 1 - Math.pow(1 - progress, 3);
      var currentVal = Math.floor(start + (end - start) * easeProgress);
      element.textContent = formatToman(currentVal);

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        element.textContent = formatToman(end);
        setTimeout(function () {
          element.classList.remove('updating');
        }, 300);
      }
    }

    window.requestAnimationFrame(step);
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
  var savingBanner = document.getElementById('savingBanner');
  var simHintText = document.querySelector('.sim-hint-card .hint-text');

  var simStatus = document.getElementById('simStatus');
  var simStatusText = document.getElementById('simStatusText');
  var optCol = document.getElementById('optimizedCol');

  var isSolving = false;

  function renderList(container, items, isOptimized, withAnimation) {
    container.innerHTML = '';
    items.forEach(function (item, index) {
      var card = document.createElement('div');
      card.className = 'cart-item-card' + (isOptimized ? ' card-opt' : '') + (withAnimation ? ' animate-in' : '');

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

  function updateSimulator(withSolveAnimation) {
    var data = plusToggle.checked ? plusCart : standardCart;

    // Calculate Unoptimized
    var rawItemsSum = data.unoptimized.reduce(function (sum, i) { return sum + i.price; }, 0);
    var rawShipSum = data.unoptimized.reduce(function (sum, i) { return sum + (i.isFree ? 0 : i.shipFee); }, 0);
    var rawGrand = rawItemsSum + rawShipSum;

    // Calculate Optimized
    var optItemsSum = data.optimized.reduce(function (sum, i) { return sum + i.price; }, 0);
    var optShipSum = data.optimized.reduce(function (sum, i) { return sum + (i.isFree ? 0 : i.shipFee); }, 0);
    var optGrand = optItemsSum + optShipSum;
    var netSavings = rawGrand - optGrand;

    renderList(unoptimizedItemsContainer, data.unoptimized, false, false);

    if (withSolveAnimation) {
      renderList(optimizedItemsContainer, data.optimized, true, true);
      animateValue(optItemsTotalEl, rawItemsSum, optItemsSum, 700);
      animateValue(optShipTotalEl, rawShipSum, optShipSum, 700);
      animateValue(optGrandTotalEl, rawGrand, optGrand, 800);
      animateValue(savingAmountEl, 0, netSavings, 900);

      if (savingBanner) {
        savingBanner.classList.remove('pop');
        void savingBanner.offsetWidth; // trigger reflow
        savingBanner.classList.add('pop');
      }
    } else {
      renderList(optimizedItemsContainer, data.optimized, true, false);
      optItemsTotalEl.textContent = formatToman(optItemsSum);
      optShipTotalEl.textContent = formatToman(optShipSum);
      optGrandTotalEl.textContent = formatToman(optGrand);
      savingAmountEl.textContent = formatToman(netSavings);
    }

    rawItemsTotalEl.textContent = formatToman(rawItemsSum);
    rawShipTotalEl.textContent = formatToman(rawShipSum);
    rawGrandTotalEl.textContent = formatToman(rawGrand);

    optShipBadge.textContent = data.badgeOpt;

    if (simHintText) {
      simHintText.innerHTML = '<strong>نکته هوشمند:</strong> ' + data.hintText;
    }
  }

  // Handle Optimize Button Click with realistic multi-step solver motion
  if (optimizeBtn) {
    optimizeBtn.addEventListener('click', function () {
      if (isSolving) return;
      isSolving = true;

      optimizeBtn.classList.add('is-loading');
      if (simStatus) {
        simStatus.className = 'sim-status solving';
      }
      if (optCol) {
        optCol.classList.add('is-solving');
      }

      // Step 1: Extract vendor items
      if (simStatusText) {
        simStatusText.textContent = 'استخراج موجودی و بهای غرفه‌ها...';
      }

      // Step 2: Analyze promo thresholds
      setTimeout(function () {
        if (simStatusText) {
          simStatusText.textContent = 'تحلیل سقف‌های ارسال رایگان و تخفیف‌ها...';
        }
      }, 420);

      // Step 3: Exact solver computation
      setTimeout(function () {
        if (simStatusText) {
          simStatusText.textContent = 'محاسبه ارزان‌ترین ترکیب با حل‌کننده دقیق...';
        }
      }, 840);

      // Step 4: Solution found!
      setTimeout(function () {
        optimizeBtn.classList.remove('is-loading');
        if (optCol) {
          optCol.classList.remove('is-solving');
        }

        if (simStatus) {
          simStatus.className = 'sim-status done';
        }
        if (simStatusText) {
          simStatusText.textContent = '✓ بهترین ترکیب با کمترین هزینه کشف شد!';
        }

        updateSimulator(true);

        isSolving = false;
      }, 1250);
    });
  }

  // Handle Plus Toggle
  if (plusToggle) {
    plusToggle.addEventListener('change', function () {
      if (simStatus) {
        simStatus.className = 'sim-status';
      }
      if (simStatusText) {
        simStatusText.textContent = plusToggle.checked ? 'مدل اختصاصی دیجی‌پلاس فعال شد' : 'مدل عادی دیجی‌کالا فعال شد';
      }
      updateSimulator(true);
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
          btn.style.transform = 'scale(0.95)';
          showToast('در حافظه کلیپ‌بورد کپی شد');
          setTimeout(function () {
            btn.style.transform = '';
            btn.textContent = originalText;
          }, 2000);
        }).catch(function () {
          showToast('خطا در کپی');
        });
      }
    });
  });

  // IntersectionObserver for Reveal on Scroll
  if ('IntersectionObserver' in window) {
    var revealObserver = new IntersectionObserver(function (entries, observer) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          observer.unobserve(entry.target);
        }
      });
    }, {
      rootMargin: '0px 0px -50px 0px',
      threshold: 0.12
    });

    document.querySelectorAll('.reveal').forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    // Fallback for older browsers
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.classList.add('revealed');
    });
  }

  // Initial simulator render
  updateSimulator(false);

})();
