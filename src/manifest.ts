import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

/**
 * The manifest source of truth, typed against Chrome's MV3 schema.
 * NFR-06: permissions are exactly storage + tabs + *.digikala.com host.
 * Anything beyond this set requires a decision-log entry first (SDD 06).
 */
export const manifestSource: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: 'Digikala Cart Optimizer',
  short_name: 'DK Optimizer',
  version: pkg.version,
  description: pkg.description,
  // NOTE: no default_locale - the extension does its own catalog-based i18n
  // (src/shared/i18n). Declaring it without a _locales/ bundle makes Chrome
  // reject the whole extension at load time.
  // NFR-06: permissions are exactly storage + tabs + scripting +
  // *.digikala.com host. "scripting" was added for D-16 (main-world
  // fetch execution via chrome.scripting.executeScript - see the
  // decision log; script-tag injection from the content script does
  // not execute in the current Chromium, live-verified 2026-10-08).
  permissions: ['storage', 'tabs', 'scripting'],
  host_permissions: ['https://*.digikala.com/*'],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
  // Surface 3 (09-ui-spec): the results page. Registered as a
  // web-accessible resource ONLY so crxjs bundles it as an entry
  // point (D-18); "matches" is empty, so no web page can reach it -
  // it opens exclusively via chrome.runtime.getURL from the SW.
  web_accessible_resources: [
    {
      resources: ['src/results/index.html'],
      matches: [],
    },
  ],
  content_scripts: [
    {
      // Surfaces 1-2 (09-ui-spec): PDP "Add to comparison" + cart "Optimize".
      // Host matches stay inside the audited host_permissions set (NFR-06):
      // no new permission surface is introduced by content scripts.
      matches: ['https://*.digikala.com/*'],
      js: ['src/capture/content/index.ts'],
      run_at: 'document_idle',
    },
  ],
  action: {
    default_title: 'Digikala Cart Optimizer',
  },
};

/** crxjs-normalized manifest consumed by vite.config.ts. */
// One controlled cast at the tool boundary: crxjs's manifest type and
// @types/chrome disagree on an optional commands shape this extension
// never uses. Everything typed here is plain MV3 data.
export const manifest = defineManifest(
  manifestSource as unknown as Parameters<typeof defineManifest>[0],
);
