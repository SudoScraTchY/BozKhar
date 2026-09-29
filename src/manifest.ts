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
  permissions: ['storage', 'tabs'],
  host_permissions: ['https://*.digikala.com/*'],
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  options_ui: {
    page: 'src/options/index.html',
    open_in_tab: true,
  },
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
