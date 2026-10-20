/**
 * Toolbar popup: the extension's front door. It reads only the local
 * order cache (no network, D-39) and links to every user-facing surface.
 * Clicking the toolbar icon must reveal useful content, not a hidden
 * settings page.
 */
import { aggregate } from '../insights/aggregate';
import { loadSnapshot } from '../insights/cache';
import { formatMoney, formatNumber, relativeTime } from '../results/format';
import { t, type MessageKey } from '../shared/i18n/messages';
import { loadSettings } from '../shared/settings/settings';
import type { UiLanguage } from '../shared/types';

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing element: ${id}`);
  return node as T;
};

function applyI18n(lang: UiLanguage): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    node.textContent = t(lang, node.dataset.i18n as MessageKey);
  }
}

function openTab(url: string): void {
  void chrome.tabs.create({ url }, () => void chrome.runtime.lastError);
  window.close();
}

function wire(): void {
  $('insightsBtn').addEventListener('click', () =>
    openTab(chrome.runtime.getURL('src/insights/index.html')),
  );
  $('resultsBtn').addEventListener('click', () =>
    openTab(chrome.runtime.getURL('src/results/index.html')),
  );
  $('settingsBtn').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
  $('ordersBtn').addEventListener('click', () =>
    openTab('https://www.digikala.com/profile/orders/'),
  );
}

async function init(): Promise<void> {
  const settings = await loadSettings().catch(() => undefined);
  const lang: UiLanguage = settings?.uiLanguage ?? 'fa';
  applyI18n(lang);
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  wire();

  try {
    const snapshot = await loadSnapshot(indexedDB);
    const agg = aggregate(snapshot, { includeInProgress: true });
    if (snapshot.orders.length === 0) {
      $('syncLine').textContent = t(lang, 'popupNoData');
      return;
    }
    $('ordersValue').textContent = formatNumber(agg.paidOrders, lang);
    $('paidValue').textContent = formatMoney(agg.netPaidToman, lang, 'toman');
    if (snapshot.syncedAt > 0) {
      $('syncLine').textContent = t(lang, 'popupLastSync').replaceAll(
        '{time}',
        relativeTime(new Date(snapshot.syncedAt).toISOString(), lang),
      );
    }
  } catch {
    $('syncLine').textContent = t(lang, 'popupNoData');
  }
}

void init();
