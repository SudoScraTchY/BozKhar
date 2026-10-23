/**
 * Event-page keepalive (D-46): cadence, stop, failure containment and the
 * safety margin against Firefox's 30 s idle timeout.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KEEPALIVE_INTERVAL_MS,
  KEEPALIVE_MAX_MS,
  isKeepaliveRequest,
  startKeepalive,
} from '../src/shared/keepalive';

describe('startKeepalive (D-46)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('sends nothing before the first interval, then one message per tick', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    startKeepalive(send);

    expect(send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenLastCalledWith({ kind: 'runtime/keepalive' });

    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS * 2);
    expect(send).toHaveBeenCalledTimes(3);
  });

  it('stops on demand and is idempotent', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    const stop = startKeepalive(send);
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS);
    stop();
    stop();
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS * 5);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('keeps ticking after a synchronous send failure', () => {
    vi.useFakeTimers();
    let calls = 0;
    const stop = startKeepalive(() => {
      calls += 1;
      throw new Error('channel gone');
    });
    vi.advanceTimersByTime(KEEPALIVE_INTERVAL_MS * 3);
    expect(calls).toBe(3);
    stop();
  });

  it('swallows a rejected promise from a promise-style sender', async () => {
    vi.useFakeTimers();
    const send = vi.fn(() => Promise.reject(new Error('no receiver')));
    const stop = startKeepalive(send);
    await vi.advanceTimersByTimeAsync(KEEPALIVE_INTERVAL_MS * 2);
    expect(send).toHaveBeenCalledTimes(2);
    stop();
  });

  it('stops itself after the maximum duration', () => {
    vi.useFakeTimers();
    const send = vi.fn();
    startKeepalive(send, { intervalMs: 1_000, maxDurationMs: 2_500 });
    vi.advanceTimersByTime(10_000);
    // 1 s, 2 s, then the 2.5 s deadline stops it.
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('keeps the default interval well inside the Firefox idle window', () => {
    expect(KEEPALIVE_INTERVAL_MS).toBeLessThanOrEqual(15_000);
    expect(KEEPALIVE_MAX_MS).toBeGreaterThanOrEqual(10 * 60_000);
  });

  it('recognises only its own request shape', () => {
    expect(isKeepaliveRequest({ kind: 'runtime/keepalive' })).toBe(true);
    expect(isKeepaliveRequest({ kind: 'capture/crawl-start' })).toBe(false);
    expect(isKeepaliveRequest(null)).toBe(false);
    expect(isKeepaliveRequest('runtime/keepalive')).toBe(false);
  });
});
