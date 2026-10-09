/**
 * Results page entry (T05) - 09-ui-spec Surface 3.
 * Thin wiring only: the page logic lives in page.ts
 * (createReportPage) so it is testable with injected
 * storage; this module runs it against the real
 * IndexedDB + settings.
 */
import { loadSettings } from '../shared/settings/settings';
import { getAllItems, getAllSnapshots, putItem } from '../shared/storage/db';
import { createReportPage } from './page';

createReportPage({
  getItems: () => getAllItems(indexedDB),
  getSnapshots: () => getAllSnapshots(indexedDB),
  putItem: (item) => putItem(indexedDB, item),
  loadSettings,
})
  .run()
  .catch((err) => {
    // Never a silent blank page (NFR-05): the error is visible.
    const content = document.getElementById('content');
    if (content) {
      const p = document.createElement('p');
      p.className = 'note warn';
      p.textContent = `Results failed to build: ${String(err)}`;
      content.append(p);
    }
  });
