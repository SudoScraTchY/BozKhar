/**
 * Crawl/capture messaging contracts (SDD 06: service worker owns the crawl;
 * content scripts only ask and render).
 *
 * All messages are runtime.sendMessage round trips with typed payloads and
 * typed responses. Progress goes to extension pages through
 * runtime.sendMessage and to the initiating content script through
 * tabs.sendMessage: runtime.sendMessage cannot reach content scripts in
 * Chrome or Firefox (D-46).
 */

import type { Snapshot } from '../shared/types';

/** Requests the content scripts send; the service worker answers. */
export type CaptureRequest =
  | {
      kind: 'capture/pdp';
      productId: string;
      variantId: string;
      variantLabel?: string;
    }
  | { kind: 'capture/crawl-start' }
  | { kind: 'capture/crawl-abort' }
  /** Toolbar badge reflects the comparison-list size (09 Surface 1). */
  | { kind: 'capture/badge-sync' }
  // D-30: the apply flow's cart calls. The results page has no
  // Digikala session of its own, so the worker runs them in an
  // open digikala tab's main world (a read, or one of the two
  // sanctioned writes).
  | { kind: 'capture/cart-read' }
  | { kind: 'capture/cart-add'; variantId: string }
  | { kind: 'capture/cart-remove'; cartItemId: string };

/** Responses mirror the success/failure of the underlying capture step. */
export type CaptureResponse =
  | { ok: true; kind: 'pdp'; snapshotId: string; offerCount: number; variantLabel: string }
  // done/failed let the content script close the crawl overlay
  // even if the final progress broadcast was missed (live report
  // 2026-10-08: the overlay stayed up after a completed crawl).
  | { ok: true; kind: 'crawl-start'; itemCount: number; done: number; failed: number }
  | { ok: true; kind: 'crawl-abort' }
  | { ok: true; kind: 'badge-sync'; count: number }
  /** The raw cart payload; the results page normalizes it (D-30). */
  | { ok: true; kind: 'cart-read'; data: unknown }
  | { ok: true; kind: 'cart-add' }
  | { ok: true; kind: 'cart-remove' }
  // `status` carries an HTTP failure code (401/403 => signed out)
  // so a caller can tell it from "no tab reachable" (D-30).
  | { ok: false; errorCode: string; message: string; status?: number };

/** Broadcast on every orchestrator progress step; no response expected. */
export interface CaptureProgressMessage {
  kind: 'capture/progress';
  step: number;
  total: number;
  done: number;
  failed: number;
  /** Present when the crawl finished (aborted or complete). */
  finished?: boolean;
  aborted?: boolean;
}

const REQUEST_KINDS = [
  'capture/pdp',
  'capture/crawl-start',
  'capture/crawl-abort',
  'capture/badge-sync',
  'capture/cart-read',
  'capture/cart-add',
  'capture/cart-remove',
] as const;

export function isCaptureRequest(raw: unknown): raw is CaptureRequest {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    'kind' in raw &&
    typeof (raw as { kind: unknown }).kind === 'string' &&
    (REQUEST_KINDS as readonly string[]).includes((raw as { kind: string }).kind)
  );
}

/** Message sent to open surfaces so they refresh stale views (FR-01). */
export interface CapturedNotice {
  kind: 'capture/captured';
  snapshot: Pick<Snapshot, 'snapshotId' | 'itemId' | 'capturedAt'>;
  offerCount: number;
}
