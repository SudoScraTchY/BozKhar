/**
 * Typed settings on chrome.storage.local (SDD 08 "Settings").
 * The area is injected so unit tests can pass an in-memory fake.
 */
import { DEFAULT_SETTINGS, type Settings } from '../types';

export const SETTINGS_KEY = 'settings';

export interface StorageAreaLike {
  get(keys?: string | string[] | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  clear(): Promise<void>;
}

/** Validates a parsed settings blob; unknown fields are dropped, bad values fall back to defaults. */
export function coerceSettings(raw: unknown): Settings {
  if (typeof raw !== 'object' || raw === null) return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  const num = (v: unknown, def: number, min: number, max: number): number =>
    typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  return {
    hasPlus: typeof r.hasPlus === 'boolean' ? r.hasPlus : DEFAULT_SETTINGS.hasPlus,
    tolerancePercent: num(r.tolerancePercent, DEFAULT_SETTINGS.tolerancePercent, 0, 100),
    uiLanguage: r.uiLanguage === 'en' ? 'en' : 'fa',
    crawlDelayMs: num(r.crawlDelayMs, DEFAULT_SETTINGS.crawlDelayMs, 0, 60000),
    stalenessWarnHours: num(r.stalenessWarnHours, DEFAULT_SETTINGS.stalenessWarnHours, 1, 24 * 30),
  };
}

export async function loadSettings(
  area: StorageAreaLike = chrome.storage.local,
): Promise<Settings> {
  const bag = await area.get(SETTINGS_KEY);
  return coerceSettings(bag[SETTINGS_KEY]);
}

export async function saveSettings(
  next: Settings,
  area: StorageAreaLike = chrome.storage.local,
): Promise<void> {
  await area.set({ [SETTINGS_KEY]: coerceSettings(next) });
}

/** Resets to defaults (part of FR-16 clear-all semantics). */
export async function resetSettings(area: StorageAreaLike = chrome.storage.local): Promise<void> {
  await saveSettings({ ...DEFAULT_SETTINGS }, area);
}

/**
 * Subscribes to settings changes; returns an unsubscribe function.
 * chrome.storage.onChanged is global (it fires for all areas), so the
 * 'local' namespace filter lives inside the listener - there is no
 * per-area handle to register against.
 */
export function onSettingsChanged(cb: (next: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, namespace: string) => {
    if (namespace !== 'local' || !(SETTINGS_KEY in changes)) return;
    cb(coerceSettings(changes[SETTINGS_KEY]?.newValue));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
