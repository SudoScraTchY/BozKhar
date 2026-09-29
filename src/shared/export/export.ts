/**
 * FR-16 export: serializes comparison items + latest snapshots + settings
 * to a plain JSON object. Lossless by construction: the shape is exactly
 * what the storage layer returns.
 */
import type { ComparisonItem, Settings, Snapshot } from '../types';
import { SCHEMA_VERSION } from '../types';

export interface ExportPayload {
  kind: 'digikala-cart-optimizer-export';
  schemaVersion: number;
  exportedAt: string;
  items: ComparisonItem[];
  latestSnapshots: Snapshot[];
  settings: Settings;
}

export function buildExportPayload(
  items: ComparisonItem[],
  latestSnapshots: Snapshot[],
  settings: Settings,
): ExportPayload {
  return {
    kind: 'digikala-cart-optimizer-export',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    items,
    latestSnapshots,
    settings,
  };
}

export function downloadJson(payload: ExportPayload): void {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `digikala-cart-optimizer-export-${payload.exportedAt.replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
