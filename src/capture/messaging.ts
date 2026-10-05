/**
 * Crawl/capture messaging contracts (SDD 06: service worker owns the crawl;
 * content scripts only ask and render).
 *
 * All messages are runtime.sendMessage round trips with typed payloads and
 * typed responses. Progress is broadcast (no sender) so any surface that is
 * open - cart page overlay or results page later (T05) - can render it.
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
  | { kind: 'capture/badge-sync' };

/** Responses mirror the success/failure of the underlying capture step. */
export type CaptureResponse =
  | { ok: true; kind: 'pdp'; snapshotId: string; offerCount: number; variantLabel: string }
  | { ok: true; kind: 'crawl-start'; itemCount: number }
  | { ok: true; kind: 'crawl-abort' }
  | { ok: true; kind: 'badge-sync'; count: number }
  | { ok: false; errorCode: string; message: string };

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
