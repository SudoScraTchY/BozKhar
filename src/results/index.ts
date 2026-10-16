/**
 * Results page entry (T05) - 09-ui-spec Surface 3.
 * Thin wiring only: the page logic lives in page.ts
 * (createReportPage) so it is testable with injected
 * storage; this module runs it against the real
 * IndexedDB + settings.
 *
 * Review fixes:
 *  - saveSettings is now wired. Without it the Plus switch only
 *    lived in memory and reverted on reload.
 *  - page.ts no longer renders on its own at boot; run() is the
 *    single entry, so the page is not rendered twice concurrently.
 *  - run() handles its own errors (localized, with retry), so no
 *    English fallback text is needed here.
 *
 * NOTE: `saveSettings` is assumed to be exported next to
 * `loadSettings`; adjust the import if it is named differently.
 */
import { loadSettings, saveSettings } from '../shared/settings/settings';
import { getAllItems, getAllSnapshots, getShipment, putItem } from '../shared/storage/db';
import { createReportPage } from './page';

void createReportPage({
  getItems: () => getAllItems(indexedDB),
  getSnapshots: () => getAllSnapshots(indexedDB),
  // D-19: the shipment quote captured with the crawl.
  getShipment: () => getShipment(indexedDB),
  putItem: (item) => putItem(indexedDB, item),
  loadSettings,
  saveSettings,
}).run();
