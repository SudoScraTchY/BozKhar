/**
 * FR-16 export payload: lossless serialization of items + latest
 * snapshots + settings, with a stable self-describing envelope.
 */
import { describe, expect, it } from 'vitest';
import { buildExportPayload } from '../src/shared/export/export';
import { DEFAULT_SETTINGS, type ComparisonItem, type Snapshot } from '../src/shared/types';

const item: ComparisonItem = {
  itemId: { productId: 'dkp-1', variantId: 'v1' },
  product: { id: 'dkp-1', title: 'P' },
  variant: { id: 'v1', label: 'L' },
  quantity: 1,
  lock: { mode: 'none', vendorIds: [] },
  addedAt: '2026-09-30T00:00:00.000Z',
};

const snap: Snapshot = {
  snapshotId: 's1',
  itemId: { productId: 'dkp-1', variantId: 'v1' },
  offers: [],
  promos: [],
  capturedAt: '2026-09-30T00:00:00.000Z',
  extractorVersion: '0.0.0-t02',
};

describe('export payload', () => {
  it('carries the full input losslessly', () => {
    const payload = buildExportPayload([item], [snap], DEFAULT_SETTINGS);
    const json = JSON.parse(JSON.stringify(payload)) as typeof payload;
    expect(json.items).toEqual([item]);
    expect(json.latestSnapshots).toEqual([snap]);
    expect(json.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('is self-describing and versioned', () => {
    const payload = buildExportPayload([], [], DEFAULT_SETTINGS);
    expect(payload.kind).toBe('digikala-cart-optimizer-export');
    expect(typeof payload.schemaVersion).toBe('number');
    expect(typeof payload.exportedAt).toBe('string');
  });
});
