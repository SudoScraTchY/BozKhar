/**
 * Order Insights entry (D-39). Thin wiring: the page logic is in page.ts
 * so jsdom tests can run it with injected storage and a fake client.
 */
import type { InsightsResponse } from './api';
import { clearInsightsCache, loadSnapshot } from './cache';
import { createInsightsPage } from './page';
import { createSyncCache } from './sync';
import { loadSettings, saveSettings } from '../shared/settings/settings';

void createInsightsPage({
  getSnapshot: () => loadSnapshot(indexedDB),
  cache: createSyncCache(indexedDB),
  clearCache: () => clearInsightsCache(indexedDB),
  loadSettings,
  saveSettings,
  send: (req, cb) => {
    chrome.runtime.sendMessage(req, (res: InsightsResponse | undefined) => {
      // Reading lastError inside the callback is what clears Chrome's
      // "unchecked runtime.lastError" warning; a lost worker is a
      // normal NETWORK outcome for the client.
      const error = chrome.runtime.lastError;
      cb(error ? undefined : res);
    });
  },
  openDigikala: () => {
    void chrome.tabs.create(
      { url: 'https://www.digikala.com/profile/orders/' },
      () => void chrome.runtime.lastError,
    );
  },
}).run();
