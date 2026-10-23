/**
 * SPA pathname poll (D-46): the Firefox fallback when the content script's
 * history patch does not reach the page's own pushState calls.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startPathPolling } from '../src/capture/content/route-watch';

describe('startPathPolling (D-46)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('does nothing while the pathname is unchanged', () => {
    vi.useFakeTimers();
    const location = { pathname: '/product/dkp-1/' };
    const onChange = vi.fn();
    const stop = startPathPolling(onChange, location);
    vi.advanceTimersByTime(2_000);
    expect(onChange).not.toHaveBeenCalled();
    stop();
  });

  it('calls once per observed change', () => {
    vi.useFakeTimers();
    const location = { pathname: '/product/dkp-1/' };
    const onChange = vi.fn();
    const stop = startPathPolling(onChange, location);

    location.pathname = '/cart/';
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledTimes(1);

    location.pathname = '/profile/orders/';
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledTimes(2);
    stop();
  });

  it('coalesces several changes inside one tick', () => {
    vi.useFakeTimers();
    const location = { pathname: '/a/' };
    const onChange = vi.fn();
    const stop = startPathPolling(onChange, location);

    location.pathname = '/b/';
    location.pathname = '/c/';
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledTimes(1);

    // The latest path is the baseline; no delayed second callback.
    vi.advanceTimersByTime(500);
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
  });

  it('stops polling', () => {
    vi.useFakeTimers();
    const location = { pathname: '/a/' };
    const onChange = vi.fn();
    const stop = startPathPolling(onChange, location);
    stop();
    location.pathname = '/b/';
    vi.advanceTimersByTime(5_000);
    expect(onChange).not.toHaveBeenCalled();
  });
});
