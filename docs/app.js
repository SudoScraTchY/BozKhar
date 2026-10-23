/**
 * BozKhar landing page.
 *
 * The price lab is the only stateful piece: it renders a four-item cart,
 * walks through a short solve sequence, flies each item into its vendor
 * group, and prints the final receipt. Everything here is local and
 * static; no requests are made from this page.
 */
(function () {
  'use strict';

  var PERSIAN_DIGITS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var narrowScreen = window.matchMedia('(max-width: 860px)');

  var DATA = {
    items: [
      {
        id: 'headphone',
        name: 'هدفون انکر R50i NC',
        short: 'هدفون انکر',
        vendor: 'صدا۲۴',
        price: 4290000,
        fee: 179000,
        optVendor: 'تکمیل',
        optPrice: 4109000,
        icon: 'i-headphone',
      },
      {
        id: 'mouse',
        name: 'ماوس لاجیتک M185',
        short: 'ماوس لاجیتک',
        vendor: 'ماوس‌لند',
        price: 2950000,
        fee: 159000,
        optVendor: 'گجت‌سرا',
        optPrice: 2819000,
        icon: 'i-mouse',
      },
      {
        id: 'powerbank',
        name: 'پاوربانک شیائومی ۲۰٬۰۰۰',
        short: 'پاوربانک شیائومی',
        vendor: 'شارژینو',
        price: 3250000,
        fee: 149000,
        optVendor: 'تکمیل',
        optPrice: 3159000,
        icon: 'i-battery',
      },
      {
        id: 'hub',
        name: 'هاب USB-C یوگرین',
        short: 'هاب یوگرین',
        vendor: 'هاب‌مارکت',
        price: 3150000,
        fee: 129000,
        optVendor: 'تکمیل',
        optPrice: 3040000,
        icon: 'i-hub',
      },
    ],
    naiveItems: 13640000,
    naiveShipping: 616000,
    naiveTotal: 14256000,
    optItems: 13127000,
    optShipping: 159000,
    optTotal: 13286000,
    saving: 970000,
    plusSaving: 513000,
    threshold: 10000000,
    comboCount: 256,
  };

  var NOTE_STANDARD =
    '<strong>چه اتفاقی افتاد؟</strong> در سبد فعلی، هر چهار قلم از یک غرفه‌ی جدا آمده‌اند: ۶۱۶٬۰۰۰ تومان ارسال. بُزخَر سه قلم را به «تکمیل» برد؛ جمع آن غرفه از سقف ۱۰٬۰۰۰٬۰۰۰ تومان گذشت و ارسالش صفر شد. ماوس به «گجت‌سرا» رفت، چون ۱۳۱٬۰۰۰ تومان ارزان‌تر بود. خالص: ۹۷۰٬۰۰۰ تومان کمتر.';
  var NOTE_PLUS =
    '<strong>با دیجی‌پلاس چه شد؟</strong> ارسال عادی هر چهار غرفه صفر شد. حالا فقط اختلاف قیمت کالاها می‌ماند: ۵۱۳٬۰۰۰ تومان. کرایه‌ی کالای سنگین و حجیم جدا حساب می‌شود و پلاس پوشش نمی‌دهد.';

  function toPersianDigits(value) {
    return String(value).replace(/\d/g, function (digit) {
      return PERSIAN_DIGITS[Number(digit)];
    });
  }

  function formatNumber(value) {
    var text = String(Math.round(Number(value) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '٬');
    return toPersianDigits(text);
  }

  function formatToman(value) {
    return formatNumber(value) + ' تومان';
  }

  function icon(id, className) {
    return (
      '<svg class="icon ' +
      (className || '') +
      '" aria-hidden="true"><use href="#' +
      id +
      '"/></svg>'
    );
  }

  function easeOutCubic(progress) {
    return 1 - Math.pow(1 - progress, 3);
  }

  function animateNumber(element, from, to, duration, formatter, done) {
    if (!element) return;

    if (reduceMotion.matches || duration <= 0) {
      element.textContent = formatter(to);
      if (done) done();
      return;
    }

    var start = null;

    function frame(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      var value = from + (to - from) * easeOutCubic(progress);
      element.textContent = formatter(value);
      if (progress < 1) {
        window.requestAnimationFrame(frame);
      } else {
        element.textContent = formatter(to);
        if (done) done();
      }
    }

    window.requestAnimationFrame(frame);
  }

  // DOM ---------------------------------------------------------------------

  var cartList = document.getElementById('cartList');
  var rawTotal = document.getElementById('rawTotal');
  var vendorGroups = document.getElementById('vendorGroups');
  var optItems = document.getElementById('optItems');
  var optShip = document.getElementById('optShip');
  var optTotal = document.getElementById('optTotal');
  var savingAmount = document.getElementById('savingAmount');
  var receiptStamp = document.getElementById('receiptStamp');
  var offerMatrix = document.getElementById('offerMatrix');
  var comboCount = document.getElementById('comboCount');
  var solverCore = document.getElementById('solverCore');
  var solverLog = document.getElementById('solverLog');
  var labShell = document.getElementById('labShell');
  var labStatus = document.getElementById('labStatus');
  var labStatusText = document.getElementById('labStatusText');
  var labNote = document.getElementById('labNote');
  var labNoteText = labNote ? labNote.querySelector('p') : null;
  var plusToggle = document.getElementById('plusToggle');
  var replayBtn = document.getElementById('replayBtn');
  var optBadge = document.getElementById('optBadge');
  var toast = document.getElementById('toast');

  var state = {
    plus: false,
    isSolving: false,
    hasAutoPlayed: false,
    timers: [],
  };

  // Helpers -----------------------------------------------------------------

  function clearTimers() {
    state.timers.forEach(function (timer) {
      window.clearTimeout(timer);
    });
    state.timers = [];
  }

  function later(callback, delay) {
    var timer = window.setTimeout(callback, delay);
    state.timers.push(timer);
    return timer;
  }

  function setStatus(text, mode) {
    if (labStatusText) labStatusText.textContent = text;
    if (!labStatus) return;
    labStatus.classList.toggle('is-solving', mode === 'solving');
    labStatus.classList.toggle('is-done', mode === 'done');
  }

  function setStep(step) {
    if (!solverLog) return;
    Array.prototype.forEach.call(solverLog.children, function (item, index) {
      item.classList.toggle('is-active', index + 1 === step);
      item.classList.toggle('is-done', index + 1 < step);
    });
  }

  function finishSteps() {
    if (!solverLog) return;
    Array.prototype.forEach.call(solverLog.children, function (item) {
      item.classList.remove('is-active');
      item.classList.add('is-done');
    });
  }

  function setCombo(value) {
    if (comboCount) comboCount.textContent = toPersianDigits(value);
  }

  function animateCombo(to, duration) {
    if (!comboCount) return;
    if (reduceMotion.matches) {
      setCombo(to);
      return;
    }
    var from = 0;
    var start = null;

    function frame(timestamp) {
      if (start === null) start = timestamp;
      var progress = Math.min((timestamp - start) / duration, 1);
      setCombo(Math.round(from + (to - from) * easeOutCubic(progress)));
      if (progress < 1) window.requestAnimationFrame(frame);
      else setCombo(to);
    }

    window.requestAnimationFrame(frame);
  }

  function setNote(plus) {
    if (labNoteText) labNoteText.innerHTML = plus ? NOTE_PLUS : NOTE_STANDARD;
  }

  function clearCartScan() {
    if (!cartList) return;
    Array.prototype.forEach.call(cartList.querySelectorAll('.cart-item'), function (item) {
      item.classList.remove('is-scanning');
    });
  }

  function setSummary(mode) {
    var values;
    if (mode === 'before') {
      var ship = state.plus ? 0 : DATA.naiveShipping;
      values = {
        items: DATA.naiveItems,
        ship: ship,
        total: DATA.naiveItems + ship,
        saving: null,
      };
    } else if (mode === 'after') {
      var finalShip = state.plus ? 0 : DATA.optShipping;
      values = {
        items: DATA.optItems,
        ship: finalShip,
        total: DATA.optItems + finalShip,
        saving: state.plus ? DATA.plusSaving : DATA.saving,
      };
    } else {
      values = { items: null, ship: null, total: null, saving: null };
    }

    if (optItems) optItems.textContent = values.items === null ? '…' : formatNumber(values.items);
    if (optShip) optShip.textContent = values.ship === null ? '…' : formatNumber(values.ship);
    if (optTotal) optTotal.textContent = values.total === null ? '…' : formatNumber(values.total);
    if (savingAmount) {
      savingAmount.textContent = values.saving === null ? '…' : formatToman(values.saving);
    }
  }

  function animateSummary() {
    var finalShip = state.plus ? 0 : DATA.optShipping;
    var finalTotal = DATA.optItems + finalShip;
    var beforeShip = state.plus ? 0 : DATA.naiveShipping;
    var beforeTotal = DATA.naiveItems + beforeShip;
    var saving = state.plus ? DATA.plusSaving : DATA.saving;

    animateNumber(optItems, DATA.naiveItems, DATA.optItems, 650, formatNumber);
    animateNumber(optShip, beforeShip, finalShip, 650, formatNumber);
    animateNumber(optTotal, beforeTotal, finalTotal, 750, formatNumber);
    animateNumber(savingAmount, 0, saving, 750, formatToman);
  }

  function setCartFees() {
    if (!cartList) return;
    Array.prototype.forEach.call(cartList.querySelectorAll('.cart-item'), function (card) {
      var id = card.getAttribute('data-id');
      var item = DATA.items.find(function (entry) {
        return entry.id === id;
      });
      var fee = card.querySelector('.cart-fee');
      if (!item || !fee) return;
      if (state.plus) {
        fee.textContent = 'پلاس: ارسال رایگان';
        fee.classList.add('is-free');
      } else {
        fee.textContent = 'ارسال ' + formatNumber(item.fee);
        fee.classList.remove('is-free');
      }
    });
  }

  function updateNaiveTotal() {
    if (!rawTotal) return;
    var ship = state.plus ? 0 : DATA.naiveShipping;
    rawTotal.textContent = formatToman(DATA.naiveItems + ship);
  }

  // Rendering ---------------------------------------------------------------

  function renderCart() {
    if (!cartList) return;
    cartList.innerHTML = DATA.items
      .map(function (item) {
        return (
          '<article class="cart-item" data-id="' +
          item.id +
          '">' +
          '<span class="cart-icon">' +
          icon(item.icon) +
          '</span>' +
          '<div class="cart-main">' +
          '<span class="cart-name">' +
          item.name +
          '</span>' +
          '<span class="cart-vendor">' +
          item.vendor +
          '</span>' +
          '</div>' +
          '<div class="cart-price">' +
          '<b>' +
          formatNumber(item.price) +
          '</b>' +
          '<span class="cart-fee">ارسال ' +
          formatNumber(item.fee) +
          '</span>' +
          '</div>' +
          '</article>'
        );
      })
      .join('');
    updateNaiveTotal();
    setCartFees();
  }

  var OFFERS = {
    headphone: [
      { label: 'ص', best: false },
      { label: 'ت', best: true },
      { label: 'گ', best: false },
      { label: 'ه', best: false },
    ],
    mouse: [
      { label: 'م', best: false },
      { label: 'گ', best: true },
      { label: 'ص', best: false },
      { label: 'ت', best: false },
    ],
    powerbank: [
      { label: 'ش', best: false },
      { label: 'ت', best: true },
      { label: 'گ', best: false },
      { label: 'ه', best: false },
    ],
    hub: [
      { label: 'ه', best: false },
      { label: 'ت', best: true },
      { label: 'گ', best: false },
      { label: 'ص', best: false },
    ],
  };

  function renderOfferMatrix() {
    if (!offerMatrix) return;
    offerMatrix.innerHTML = DATA.items
      .map(function (item) {
        return (OFFERS[item.id] || [])
          .map(function (offer) {
            return (
              '<span class="offer-cell" data-best="' +
              String(offer.best) +
              '">' +
              offer.label +
              '</span>'
            );
          })
          .join('');
      })
      .join('');
  }

  function renderPlaceholder() {
    if (!vendorGroups) return;
    vendorGroups.innerHTML =
      '<div class="receipt-empty">' +
      icon('i-receipt') +
      '<span>دکمه را بزنید تا صورتحساب چاپ شود.</span>' +
      '</div>';
    setSummary('empty');
  }

  function renderVendorGroups(hidden) {
    if (!vendorGroups) return;
    var freeLabel = state.plus ? 'پلاس: ارسال رایگان' : 'ارسال رایگان';
    var mouseFeeLabel = state.plus ? 'پلاس: ارسال رایگان' : 'ارسال ' + formatNumber(DATA.optShipping);
    var groups = [
      {
        name: 'تکمیل',
        label: freeLabel,
        free: true,
        items: DATA.items.filter(function (item) {
          return item.optVendor === 'تکمیل';
        }),
      },
      {
        name: 'گجت‌سرا',
        label: mouseFeeLabel,
        free: state.plus,
        items: DATA.items.filter(function (item) {
          return item.optVendor === 'گجت‌سرا';
        }),
      },
    ];

    vendorGroups.innerHTML = groups
      .map(function (group) {
        return (
          '<div class="vendor-group">' +
          '<div class="vendor-head">' +
          '<span class="vendor-name">' +
          group.name +
          '</span>' +
          '<span class="vendor-ship' +
          (group.free ? ' is-free' : '') +
          '">' +
          group.label +
          '</span>' +
          '</div>' +
          group.items
            .map(function (item) {
              return (
                '<div class="vendor-item' +
                (hidden ? ' is-arriving' : '') +
                '" data-target-id="' +
                item.id +
                '">' +
                '<span class="vi-name">' +
                item.name +
                '</span>' +
                '<span class="vi-price">' +
                formatNumber(item.optPrice) +
                '</span>' +
                '</div>'
              );
            })
            .join('') +
          '</div>'
        );
      })
      .join('');
  }

  // Flight animation --------------------------------------------------------

  function flyItem(item, index, onArrive) {
    var source = cartList
      ? cartList.querySelector('.cart-item[data-id="' + item.id + '"]')
      : null;
    var target = vendorGroups
      ? vendorGroups.querySelector('[data-target-id="' + item.id + '"]')
      : null;

    if (!source || !target || reduceMotion.matches || narrowScreen.matches) {
      if (target) {
        target.classList.remove('is-arriving');
        target.classList.add('is-arrived');
      }
      return;
    }

    var sourceRect = source.getBoundingClientRect();
    var targetRect = target.getBoundingClientRect();
    var clone = document.createElement('div');
    clone.className = 'flight-card';
    clone.style.top = sourceRect.top + 'px';
    clone.style.left = sourceRect.left + 'px';
    clone.style.width = sourceRect.width + 'px';
    clone.innerHTML =
      '<span class="cart-icon">' +
      icon(item.icon) +
      '</span>' +
      '<span class="cart-name">' +
      item.short +
      '</span>' +
      '<span class="cart-price"><b>' +
      formatNumber(item.optPrice) +
      '</b></span>';

    var layer = document.querySelector('.flight-layer');
    if (!layer) {
      layer = document.createElement('div');
      layer.className = 'flight-layer';
      document.body.appendChild(layer);
    }
    layer.appendChild(clone);

    var dx = targetRect.left - sourceRect.left;
    var dy = targetRect.top - sourceRect.top;
    var midX = dx * 0.55;
    var midY = dy * 0.45 - 70;

    var animation = clone.animate(
      [
        { transform: 'translate(0, 0) scale(1)', opacity: 1 },
        {
          transform: 'translate(' + midX + 'px, ' + midY + 'px) scale(.88)',
          opacity: 0.95,
          offset: 0.45,
        },
        {
          transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(.5)',
          opacity: 0,
        },
      ],
      {
        duration: 620,
        delay: index * 90,
        easing: 'cubic-bezier(.2, .8, .2, 1)',
        fill: 'forwards',
      },
    );

    animation.onfinish = function () {
      clone.remove();
      target.classList.remove('is-arriving');
      target.classList.add('is-arrived');
      if (onArrive) onArrive();
    };
  }

  // Lab flow ----------------------------------------------------------------

  function resetLabVisuals() {
    clearTimers();
    state.isSolving = false;
    if (labShell) labShell.setAttribute('aria-busy', 'false');
    if (solverCore) solverCore.classList.remove('is-solving');
    if (receiptStamp) receiptStamp.classList.remove('is-stamped');
    if (cartList) {
      Array.prototype.forEach.call(cartList.querySelectorAll('.cart-item'), function (item) {
        item.classList.remove('is-scanning');
      });
    }
    if (offerMatrix) {
      Array.prototype.forEach.call(offerMatrix.querySelectorAll('.offer-cell'), function (cell) {
        cell.classList.remove('is-scanning', 'is-best');
      });
    }
    setCombo(0);
    setStep(0);
    setStatus('آماده', 'idle');
    setNote(state.plus);
    renderPlaceholder();
    updateNaiveTotal();
    setCartFees();
    if (plusToggle) plusToggle.disabled = false;
    if (replayBtn) replayBtn.disabled = false;
  }

  function showFinalState() {
    state.isSolving = false;
    clearCartScan();
    if (solverCore) solverCore.classList.remove('is-solving');
    renderVendorGroups(false);
    setSummary('after');
    setCombo(DATA.comboCount);
    finishSteps();
    setStatus('صورتحساب آماده است', 'done');
    setNote(state.plus);
    if (receiptStamp) {
      receiptStamp.classList.remove('is-stamped');
      void receiptStamp.offsetWidth;
      receiptStamp.classList.add('is-stamped');
    }
    if (labShell) labShell.setAttribute('aria-busy', 'false');
    if (plusToggle) plusToggle.disabled = false;
    if (replayBtn) replayBtn.disabled = false;
    if (optBadge) optBadge.textContent = '۲ غرفه';
  }

  function runSolve() {
    if (state.isSolving) return;
    if (reduceMotion.matches) {
      resetLabVisuals();
      showFinalState();
      return;
    }

    resetLabVisuals();
    state.isSolving = true;
    if (labShell) labShell.setAttribute('aria-busy', 'true');
    if (plusToggle) plusToggle.disabled = true;
    if (replayBtn) replayBtn.disabled = true;
    if (labStatus) {
      labStatus.classList.remove('is-done');
      labStatus.classList.add('is-solving');
    }

    setStatus('خواندن ۴ قلم و پیشنهادهای هر غرفه', 'solving');
    setStep(1);
    if (solverCore) solverCore.classList.add('is-solving');

    if (cartList) {
      Array.prototype.forEach.call(cartList.querySelectorAll('.cart-item'), function (item, index) {
        later(function () {
          item.classList.add('is-scanning');
        }, 80 + index * 90);
      });
    }

    later(function () {
      setStatus('مقایسه‌ی ۲۵۶ ترکیب و سقف ارسال', 'solving');
      setStep(2);
      animateCombo(DATA.comboCount, 900);
      if (offerMatrix) {
        Array.prototype.forEach.call(offerMatrix.querySelectorAll('.offer-cell'), function (cell, index) {
          later(function () {
            cell.classList.add('is-scanning');
          }, index * 42);
        });
      }
    }, 620);

    later(function () {
      setStatus('بهترین ترکیب پیدا شد', 'solving');
      setStep(3);
      if (solverCore) solverCore.classList.remove('is-solving');
      if (offerMatrix) {
        Array.prototype.forEach.call(offerMatrix.querySelectorAll('.offer-cell'), function (cell) {
          cell.classList.remove('is-scanning');
        });
        Array.prototype.forEach.call(offerMatrix.querySelectorAll('[data-best="true"]'), function (cell) {
          cell.classList.add('is-best');
        });
      }
      setSummary('before');
    }, 1600);

    later(function () {
      setStatus('چاپ صورتحساب', 'solving');
      setStep(4);
      renderVendorGroups(true);
      setSummary('before');

      DATA.items.forEach(function (item, index) {
        flyItem(item, index);
      });

      later(function () {
        clearCartScan();
        animateSummary();
        finishSteps();
        setStatus('صورتحساب آماده است', 'done');
        setNote(state.plus);
        if (receiptStamp) {
          receiptStamp.classList.remove('is-stamped');
          void receiptStamp.offsetWidth;
          receiptStamp.classList.add('is-stamped');
        }
        if (optBadge) optBadge.textContent = '۲ غرفه';
        state.isSolving = false;
        if (labShell) labShell.setAttribute('aria-busy', 'false');
        if (plusToggle) plusToggle.disabled = false;
        if (replayBtn) replayBtn.disabled = false;
      }, 980);
    }, 2100);
  }

  // Page interactions -------------------------------------------------------

  function setupMenu() {
    var toggle = document.getElementById('menuToggle');
    var nav = document.getElementById('siteNav');
    if (!toggle || !nav) return;

    function closeMenu() {
      nav.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'باز کردن منو');
    }

    toggle.addEventListener('click', function () {
      var open = !nav.classList.contains('is-open');
      nav.classList.toggle('is-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'بستن منو' : 'باز کردن منو');
    });

    Array.prototype.forEach.call(nav.querySelectorAll('a'), function (link) {
      link.addEventListener('click', closeMenu);
    });

    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape') closeMenu();
    });

    document.addEventListener('click', function (event) {
      if (!nav.classList.contains('is-open')) return;
      if (nav.contains(event.target) || toggle.contains(event.target)) return;
      closeMenu();
    });

    window.addEventListener('resize', function () {
      if (window.innerWidth > 980) closeMenu();
    });
  }

  function setupTabs() {
    var buttons = document.querySelectorAll('.tab-btn');
    if (!buttons.length) return;

    Array.prototype.forEach.call(buttons, function (button) {
      button.addEventListener('click', function () {
        var targetId = button.getAttribute('data-tab');
        var ticket = button.getAttribute('data-ticket');
        Array.prototype.forEach.call(buttons, function (other) {
          var isActive = other === button;
          other.classList.toggle('is-active', isActive);
          other.setAttribute('aria-selected', String(isActive));
        });
        Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (panel) {
          var isActive = panel.id === targetId;
          panel.classList.toggle('is-active', isActive);
          panel.hidden = !isActive;
        });
        if (ticket) {
          Array.prototype.forEach.call(document.querySelectorAll('.download-ticket'), function (card) {
            var isActive = card.getAttribute('data-ticket') === ticket;
            card.hidden = !isActive;
          });
        }
      });
    });
  }

  function showToast(message) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    window.clearTimeout(showToast.timer);
    showToast.timer = window.setTimeout(function () {
      toast.classList.remove('is-visible');
    }, 2200);
  }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text);
    }
    return new Promise(function (resolve, reject) {
      var area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try {
        var copied = document.execCommand('copy');
        area.remove();
        if (copied) resolve();
        else reject(new Error('copy failed'));
      } catch (error) {
        area.remove();
        reject(error);
      }
    });
  }

  function setupCopyButtons() {
    Array.prototype.forEach.call(document.querySelectorAll('.copy-btn'), function (button) {
      button.addEventListener('click', function () {
        var text = button.getAttribute('data-copy') || '';
        copyText(text)
          .then(function () {
            var original = button.textContent;
            button.textContent = 'کپی شد';
            showToast('در کلیپ‌بورد کپی شد');
            window.setTimeout(function () {
              button.textContent = original;
            }, 1800);
          })
          .catch(function () {
            showToast('کپی نشد؛ متن را دستی انتخاب کنید');
          });
      });
    });
  }

  function setupChartObserver() {
    var chart = document.querySelector('[data-chart]');
    if (!chart) return;

    if (!('IntersectionObserver' in window)) {
      chart.classList.add('is-visible');
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            chart.classList.add('is-visible');
            observer.disconnect();
          }
        });
      },
      { threshold: 0.3 },
    );
    observer.observe(chart);
  }

  function setupLabAutoPlay() {
    if (!labShell) return;
    if (reduceMotion.matches) {
      showFinalState();
      state.hasAutoPlayed = true;
      return;
    }

    if (!('IntersectionObserver' in window)) {
      later(runSolve, 500);
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting && !state.hasAutoPlayed) {
            state.hasAutoPlayed = true;
            observer.disconnect();
            later(runSolve, 320);
          }
        });
      },
      { threshold: 0.35 },
    );
    observer.observe(labShell);
  }

  function setupLabControls() {
    if (plusToggle) {
      plusToggle.addEventListener('change', function () {
        state.plus = plusToggle.checked;
        if (state.isSolving) return;
        if (reduceMotion.matches) {
          resetLabVisuals();
          showFinalState();
        } else {
          runSolve();
        }
      });
    }

    if (replayBtn) {
      replayBtn.addEventListener('click', function () {
        if (state.isSolving) return;
        state.hasAutoPlayed = true;
        runSolve();
      });
    }

    if (reduceMotion) {
      if (typeof reduceMotion.addEventListener === 'function') {
        reduceMotion.addEventListener('change', function () {
          if (reduceMotion.matches) {
            resetLabVisuals();
            showFinalState();
          }
        });
      }
    }
  }

  // Boot --------------------------------------------------------------------

  renderCart();
  renderOfferMatrix();
  resetLabVisuals();
  setupMenu();
  setupTabs();
  setupCopyButtons();
  setupChartObserver();
  setupLabControls();
  setupLabAutoPlay();
})();
