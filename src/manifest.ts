import { defineManifest } from '@crxjs/vite-plugin';
import pkg from '../package.json';

/**
 * One mark everywhere: the 3D BozKhar badge, cut at each size Chrome
 * asks for from the single source in brand/BozKhar_Main_Icon.png.
 * The toolbar no longer has its own line-art glyph - the same art is
 * used for the action button and the app icon.
 *
 * Paths resolve through publicDir: crxjs emits manifest assets from the
 * project root first, then public/.
 */
const ICONS: Record<string, string> = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
};

/**
 * The manifest source of truth, typed against Chrome's MV3 schema.
 * NFR-06: permissions are exactly storage + tabs + *.digikala.com host.
 * Anything beyond this set requires a decision-log entry first (SDD 06).
 */
export const manifestSource: chrome.runtime.ManifestV3 = {
  manifest_version: 3,
  name: 'BozKhar',
  short_name: 'BozKhar',
  version: pkg.version,
  description: pkg.description,
  icons: { ...ICONS },
  // NOTE: no default_locale - the extension does its own catalog-based i18n
  // (src/shared/i18n). Declaring it without a _locales/ bundle makes Chrome
  // reject the whole extension at load time.
  // NFR-06: permissions are exactly storage + tabs + scripting +
  // *.digikala.com host. "scripting" was added for D-16 (main-world
  // fetch execution via chrome.scripting.executeScript - see the
  // decision log; script-tag injection from the content script does
  // not execute in the current Chromium, live-verified 2026-10-08).
  // D-42 adds the Torob API host: it is contacted only after an explicit
  // PDP click, with the public product title, no credentials/referrer.
  permissions: ['storage', 'tabs', 'scripting'],
  host_permissions: ['https://*.digikala.com/*', 'https://api.torob.com/*'],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
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
    default_title: 'BozKhar — افزونه بُزخَر',
    default_icon: { ...ICONS },
    // The toolbar icon opens a real dashboard-style popup: order cache
    // summary plus links to every surface. Settings stay reachable from
    // there instead of hiding behind the extension details page.
    default_popup: 'src/popup/index.html',
  },
};

/** crxjs-normalized manifest consumed by vite.config.ts. */
// One controlled cast at the tool boundary: crxjs's manifest type and
// @types/chrome disagree on an optional commands shape this extension
// never uses. Everything typed here is plain MV3 data.
export const manifest = defineManifest(
  manifestSource as unknown as Parameters<typeof defineManifest>[0],
);
