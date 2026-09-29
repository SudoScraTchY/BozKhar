/**
 * Options page v0 (T02.6): edits all settings bilingually with live
 * RTL/LTR switching, JSON export, and confirmed clear-all (FR-16).
 * Advise-only tone throughout: the page informs, it never pushes (D-01).
 */
import { storage } from '../shared/storage';
import { loadSettings, resetSettings, saveSettings } from '../shared/settings/settings';
import { buildExportPayload, downloadJson } from '../shared/export/export';
import { t, type MessageKey } from '../shared/i18n/messages';
import type { Settings, UiLanguage } from '../shared/types';

/**
 * Extractor version of the capture pipeline. T02 has no extractor yet;
 * T03 owns the real value. Kept in one place so the options surface
 * already shows it (09-ui-spec Surface 4).
 */
const EXTRACTOR_VERSION = '0.0.0-t02';

const $ = <T extends HTMLElement>(sel: string): T => {
  const el = document.querySelector<T>(sel);
  if (!el) throw new Error(`Missing element: ${sel}`);
  return el;
};

let current: Settings = {
  hasPlus: false,
  tolerancePercent: 2,
  uiLanguage: 'fa',
  crawlDelayMs: 1500,
  stalenessWarnHours: 24,
};

function applyI18n(): void {
  const lang = current.uiLanguage;
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'fa' ? 'rtl' : 'ltr';
  for (const el of document.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = el.dataset.i18n as MessageKey;
    el.textContent = t(lang, key);
  }
  $('title').textContent = t(lang, 'optionsTitle');

  const fa = $('#lang-fa');
  const en = $('#lang-en');
  fa.classList.toggle('active', lang === 'fa');
  en.classList.toggle('active', lang === 'en');
  fa.setAttribute('aria-checked', String(lang === 'fa'));
  en.setAttribute('aria-checked', String(lang === 'en'));
}

function fillForm(): void {
  ($('#hasPlus') as HTMLInputElement).checked = current.hasPlus;
  ($('#tolerancePercent') as HTMLInputElement).value = String(current.tolerancePercent);
  $('#toleranceOut').textContent = `${current.tolerancePercent}%`;
  ($('#crawlDelayMs') as HTMLInputElement).value = String(current.crawlDelayMs);
  ($('#stalenessWarnHours') as HTMLInputElement).value = String(current.stalenessWarnHours);
}

let toastTimer: number | undefined;
function toast(msg: string): void {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    el.hidden = true;
  }, 2200);
}

async function persist(): Promise<void> {
  current = {
    hasPlus: ($('#hasPlus') as HTMLInputElement).checked,
    tolerancePercent: Number(($('#tolerancePercent') as HTMLInputElement).value),
    uiLanguage: current.uiLanguage,
    crawlDelayMs: Number(($('#crawlDelayMs') as HTMLInputElement).value),
    stalenessWarnHours: Number(($('#stalenessWarnHours') as HTMLInputElement).value),
  };
  await saveSettings(current);
}

async function onExport(): Promise<void> {
  const [items, latestSnapshots] = await Promise.all([
    storage.getAllItems(),
    Array.from((await storage.getLatestSnapshots()).values()),
  ]);
  const payload = buildExportPayload(items, latestSnapshots, current);
  downloadJson(payload);
  toast(`JSON - ${payload.items.length} / ${payload.latestSnapshots.length}`);
}

async function onClear(): Promise<void> {
  const ok = window.confirm(t(current.uiLanguage, 'clearAllConfirm'));
  if (!ok) return;
  const removed = await storage.clearAll();
  await resetSettings();
  current = {
    ...current,
    hasPlus: false,
    tolerancePercent: 2,
    crawlDelayMs: 1500,
    stalenessWarnHours: 24,
  };
  fillForm();
  toast(`${t(current.uiLanguage, 'clearAll')}: ${removed}`);
}

function wire(): void {
  $('#lang-fa').addEventListener('click', async () => {
    current.uiLanguage = 'fa' satisfies UiLanguage;
    await saveSettings(current);
    applyI18n();
  });
  $('#lang-en').addEventListener('click', async () => {
    current.uiLanguage = 'en' satisfies UiLanguage;
    await saveSettings(current);
    applyI18n();
  });
  $('#hasPlus').addEventListener('change', persist);
  $('#tolerancePercent').addEventListener('input', () => {
    $('#toleranceOut').textContent = `${($('#tolerancePercent') as HTMLInputElement).value}%`;
  });
  $('#tolerancePercent').addEventListener('change', persist);
  $('#crawlDelayMs').addEventListener('change', persist);
  $('#stalenessWarnHours').addEventListener('change', persist);
  $('#exportBtn').addEventListener('click', () => void onExport());
  $('#clearBtn').addEventListener('click', () => void onClear());
}

async function init(): Promise<void> {
  current = await loadSettings();
  applyI18n();
  fillForm();
  wire();
  $('#extractorVersion').textContent = EXTRACTOR_VERSION;
}

void init();
