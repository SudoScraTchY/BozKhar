/**
 * Event-page keepalive (D-46).
 *
 * Firefox MV3 has no background service worker: it runs an event page that
 * is unloaded after ~30 s of inactivity (`extensions.background.idle.timeout`).
 * Pending fetches and timers do not reset that timer; incoming extension
 * messages do. A cart crawl is one long `capture/crawl-start` response, so
 * the initiating page sends a tiny no-op message while it waits. Chrome's
 * service worker also resets its idle timer on messages, so this is safe
 * there and simply redundant.
 *
 * The opposite case needs no keepalive: the Insights page sends one short
 * message per request, and each one resets the timer on its own.
 */
export const KEEPALIVE_KIND = 'runtime/keepalive' as const;

/** Well under Firefox's 30 s idle timeout, with two missed ticks of margin. */
export const KEEPALIVE_INTERVAL_MS = 10_000;

/** Safety valve: a hung response must not keep the event page alive forever. */
export const KEEPALIVE_MAX_MS = 60 * 60_000;

export interface KeepaliveRequest {
  kind: typeof KEEPALIVE_KIND;
}

export interface KeepaliveResponse {
  ok: true;
  kind: typeof KEEPALIVE_KIND;
}

export function isKeepaliveRequest(raw: unknown): raw is KeepaliveRequest {
  return (
    typeof raw === 'object' && raw !== null && (raw as { kind?: unknown }).kind === KEEPALIVE_KIND
  );
}

export interface KeepaliveOptions {
  intervalMs?: number;
  maxDurationMs?: number;
}

/**
 * Sends one no-op message per interval until stopped. The first tick is
 * delayed: the operation's own request already woke the background.
 * Returns an idempotent stop function.
 */
export function startKeepalive(
  send: (req: KeepaliveRequest) => unknown,
  options: KeepaliveOptions = {},
): () => void {
  const intervalMs = options.intervalMs ?? KEEPALIVE_INTERVAL_MS;
  const maxDurationMs = options.maxDurationMs ?? KEEPALIVE_MAX_MS;
  let stopped = false;

  const tick = () => {
    if (stopped) return;
    try {
      const result = send({ kind: KEEPALIVE_KIND });
      if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
        // Promise-returning senders must not leave an unhandled rejection
        // when the background has gone away.
        void Promise.resolve(result).catch(() => {});
      }
    } catch {
      // A dead channel is retried on the next tick; it must not throw here.
    }
  };

  const interval = setInterval(tick, intervalMs);
  const deadline = setTimeout(() => stop(), maxDurationMs);

  function stop(): void {
    if (stopped) return;
    stopped = true;
    clearInterval(interval);
    clearTimeout(deadline);
  }

  return stop;
}
