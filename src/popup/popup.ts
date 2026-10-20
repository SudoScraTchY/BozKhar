/**
 * Toolbar popup: the extension's front door. It reads only the local
 * order cache (D-39); the one network call it triggers is the release
 * check the worker runs when the popup opens (D-44), which sends
 * nothing and reads only GitHub's latest tag.
 */
import { aggregate } from '../insights/aggregate';
import { loadSnapshot } from '../insights/cache';
import { formatMoney, formatNumber, relativeTime } from '../results/format';
import { formatMessage, t, type MessageKey } from '../shared/i18n/messages';
import { loadSettings } from '../shared/settings/settings';
import type { UiLanguage } from '../shared/types';
import { RELEASES_URL, REPO_URL, type UpdateCheckResponse } from '../shared/update';

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
  for (const node of document.querySelectorAll<HTMLElement>('[data-i18n-title]')) {
    const text = t(lang, node.dataset.i18nTitle as MessageKey);
    node.title = text;
    node.setAttribute('aria-label', text);
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
  $('githubLink').addEventListener('click', (event) => {
    event.preventDefault();
    openTab(REPO_URL);
  });
  $('updateLink').addEventListener('click', (event) => {
    event.preventDefault();
    openTab(RELEASES_URL);
  });
}

function requestUpdateCheck(): Promise<UpdateCheckResponse | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { kind: 'update/check' },
      (response: UpdateCheckResponse | undefined) => {
        void chrome.runtime.lastError;
        resolve(response ?? null);
      },
    );
  });
}

/** A quiet footer pill, shown only when GitHub has a newer tag. */
async function showUpdateIfAny(lang: UiLanguage): Promise<void> {
  try {
    const result = await requestUpdateCheck();
    if (!result?.ok || !result.updateAvailable || !result.latest) return;
    const link = $<HTMLAnchorElement>('updateLink');
    link.textContent = formatMessage(lang, 'popupUpdateAvailable', { version: result.latest });
    link.title = t(lang, 'popupUpdateTitle');
    link.href = result.url ?? RELEASES_URL;
    link.hidden = false;
  } catch {
    // Offline or rate-limited: not worth a message in the popup.
  }
}

async function init(): Promise<void> {
  const settings = await loadSettings().catch(() => undefined);
  const lang: UiLanguage = settings?.uiLanguage ?? 'fa';
  applyI18n(lang);
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  wire();
  void showUpdateIfAny(lang);

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
