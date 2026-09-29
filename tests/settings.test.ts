/**
 * T02.4 settings tests: defaults, coercion semantics, subscription wiring.
 * chrome.storage.local is replaced by an in-memory fake that emits
 * onChanged events like the real area.
 *
 * Coercion semantic (deliberate): type violations fall back to the field
 * default; numeric range violations CLAMP to the nearest bound so partial
 * corruption keeps as much user intent as possible.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  coerceSettings,
  loadSettings,
  onSettingsChanged,
  resetSettings,
  saveSettings,
} from '../src/shared/settings/settings';
import { DEFAULT_SETTINGS } from '../src/shared/types';
import { FakeStorageArea, installChromeStorageStub } from './fakes';

beforeEach(() => {
  installChromeStorageStub();
});

afterEach(() => {
  (globalThis as { chrome?: unknown }).chrome = undefined;
});

describe('settings', () => {
  it('returns documented defaults on empty storage', async () => {
    expect(await loadSettings(new FakeStorageArea())).toEqual(DEFAULT_SETTINGS);
  });

  it('round-trips through save/load', async () => {
    const area = new FakeStorageArea();
    await saveSettings({ ...DEFAULT_SETTINGS, hasPlus: true, uiLanguage: 'en' }, area);
    const loaded = await loadSettings(area);
    expect(loaded.hasPlus).toBe(true);
    expect(loaded.uiLanguage).toBe('en');
  });

  it('falls back per-field on type violations and clamps numeric ranges', () => {
    expect(
      coerceSettings({
        hasPlus: 'yes',
        tolerancePercent: 999,
        uiLanguage: 'de',
        crawlDelayMs: -5,
        stalenessWarnHours: 'x',
      }),
    ).toEqual({
      hasPlus: false,
      tolerancePercent: 100,
      uiLanguage: 'fa',
      crawlDelayMs: 0,
      stalenessWarnHours: 24,
    });
  });

  it('keeps valid values untouched', () => {
    const s = {
      hasPlus: true,
      tolerancePercent: 3.5,
      uiLanguage: 'en' as const,
      crawlDelayMs: 2000,
      stalenessWarnHours: 48,
    };
    expect(coerceSettings(s)).toEqual(s);
  });

  it('reset restores defaults (FR-16 clear-all semantics)', async () => {
    const area = new FakeStorageArea();
    await saveSettings({ ...DEFAULT_SETTINGS, hasPlus: true }, area);
    await resetSettings(area);
    expect((await loadSettings(area)).hasPlus).toBe(false);
  });

  it('fires change subscriptions for the settings key and stops after unsubscribe', async () => {
    const area = installChromeStorageStub(); // chrome.storage.local === area
    const seen: number[] = [];
    const unsubscribe = onSettingsChanged((s) => seen.push(s.tolerancePercent));

    await saveSettings({ ...DEFAULT_SETTINGS, tolerancePercent: 5 }, area);
    await area.set({ unrelated: 1 }); // non-settings key: no event for the subscriber
    unsubscribe();
    await saveSettings({ ...DEFAULT_SETTINGS, tolerancePercent: 7 }, area);

    expect(seen).toEqual([5]);
  });
});
