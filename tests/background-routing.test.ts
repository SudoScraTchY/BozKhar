/**
 * Service-worker routing (D-46): the keepalive branch, progress delivery
 * to the initiating content script, and resolving a real Digikala tab for
 * a results-page crawl initiator.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CaptureProgressMessage } from '../src/capture/messaging';
import { handleCapturePdp } from '../src/capture/sw-controller';

const mockState = vi.hoisted(() => ({
  deps: null as unknown,
  tabId: undefined as number | undefined,
}));

vi.mock('../src/capture/sw-controller', () => ({
  handleCapturePdp: vi.fn(async () => ({
    ok: true,
    kind: 'pdp',
    snapshotId: 's1',
    offerCount: 1,
    variantLabel: 'v1',
  })),
  handleCrawlStart: vi.fn(
    async (deps: { onProgress?: (msg: CaptureProgressMessage) => void }, tabId?: number) => {
      mockState.deps = deps;
      mockState.tabId = tabId;
      return { ok: true, kind: 'crawl-start', itemCount: 1, done: 1, failed: 0 };
    },
  ),
  handleCrawlAbort: vi.fn(() => ({ ok: true, kind: 'crawl-abort' })),
  handleCartAdd: vi.fn(),
  handleCartRead: vi.fn(),
  handleCartRemove: vi.fn(),
  pickDigikalaTab: vi.fn((tabs: Array<{ id?: number }>) => tabs[0]?.id),
  syncBadge: vi.fn(async () => 0),
}));

type Listener = (
  raw: unknown,
  sender: chrome.runtime.MessageSender,
  sendResponse: (response?: unknown) => void,
) => boolean | undefined;

const chromeStub = {
  runtime: {
    onMessage: { addListener: vi.fn() },
    onInstalled: { addListener: vi.fn() },
    sendMessage: vi.fn(),
    lastError: undefined,
    getURL: (path: string) => `moz-extension://test/${path}`,
    getManifest: () => ({ version: '0.0.0-test' }),
    openOptionsPage: vi.fn(),
  },
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      clear: vi.fn(async () => {}),
    },
    onChanged: { addListener: vi.fn(), removeListener: vi.fn() },
  },
  tabs: {
    create: vi.fn(),
    query: vi.fn(async (): Promise<Array<{ id: number; url: string }>> => []),
    sendMessage: vi.fn(),
  },
  action: { setBadgeText: vi.fn() },
  scripting: { executeScript: vi.fn() },
};

let listener: Listener | undefined;

async function loadWorker(): Promise<Listener> {
  await import('../src/background/service-worker');
  if (!listener) throw new Error('the service worker did not register onMessage');
  return listener;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  listener = undefined;
  mockState.deps = null;
  mockState.tabId = undefined;
  chromeStub.runtime.onMessage.addListener.mockImplementation((fn: unknown) => {
    listener = fn as Listener;
  });
  chromeStub.tabs.query.mockResolvedValue([]);
  (globalThis as { chrome?: unknown }).chrome = chromeStub;
});

describe('service-worker routing (D-46)', () => {
  it('answers a keepalive synchronously and leaves other messages alone', async () => {
    const worker = await loadWorker();
    const sendResponse = vi.fn();
    const result = worker({ kind: 'runtime/keepalive' }, {}, sendResponse);
    expect(result).toBe(false);
    expect(sendResponse).toHaveBeenCalledTimes(1);
    expect(sendResponse).toHaveBeenCalledWith({ ok: true, kind: 'runtime/keepalive' });

    const unknownSend = vi.fn();
    expect(worker({ kind: 'not/ours' }, {}, unknownSend)).toBe(false);
    expect(unknownSend).not.toHaveBeenCalled();
  });

  it('sends progress to the initiating content-script tab and the extension pages', async () => {
    const worker = await loadWorker();
    const sendResponse = vi.fn();
    const sender = {
      tab: { id: 42, url: 'https://www.digikala.com/cart/' },
    } as chrome.runtime.MessageSender;

    expect(worker({ kind: 'capture/crawl-start' }, sender, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1));
    expect(mockState.tabId).toBe(42);
    expect(chromeStub.tabs.query).not.toHaveBeenCalled();

    const msg: CaptureProgressMessage = {
      kind: 'capture/progress',
      step: 1,
      total: 2,
      done: 1,
      failed: 0,
    };
    const deps = mockState.deps as { onProgress?: (m: CaptureProgressMessage) => void };
    deps.onProgress?.(msg);

    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(chromeStub.tabs.sendMessage).toHaveBeenCalledWith(42, msg, expect.any(Function));
    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledWith(msg, expect.any(Function));
  });

  it('resolves an open Digikala tab for a results-page crawl initiator', async () => {
    chromeStub.tabs.query.mockResolvedValue([{ id: 7, url: 'https://www.digikala.com/cart/' }]);
    const worker = await loadWorker();
    const sendResponse = vi.fn();
    const sender = {
      tab: { id: 99, url: 'chrome-extension://abc/src/results/index.html' },
    } as chrome.runtime.MessageSender;

    expect(worker({ kind: 'capture/crawl-start' }, sender, sendResponse)).toBe(true);
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalledTimes(1));
    expect(chromeStub.tabs.query).toHaveBeenCalledTimes(1);
    expect(mockState.tabId).toBe(7);

    const msg: CaptureProgressMessage = {
      kind: 'capture/progress',
      step: 2,
      total: 2,
      done: 2,
      failed: 0,
      finished: true,
    };
    const deps = mockState.deps as { onProgress?: (m: CaptureProgressMessage) => void };
    deps.onProgress?.(msg);

    // No content script started this crawl, so only the broadcast runs.
    expect(chromeStub.tabs.sendMessage).not.toHaveBeenCalled();
    expect(chromeStub.runtime.sendMessage).toHaveBeenCalledWith(msg, expect.any(Function));
  });

  it('passes the PDP tab to the capture controller', async () => {
    const worker = await loadWorker();
    const sendResponse = vi.fn();
    const sender = {
      tab: { id: 42, url: 'https://www.digikala.com/product/dkp-1/?variant_id=2' },
    } as chrome.runtime.MessageSender;

    expect(
      worker({ kind: 'capture/pdp', productId: '1', variantId: '2' }, sender, sendResponse),
    ).toBe(true);
    await vi.waitFor(() => expect(handleCapturePdp).toHaveBeenCalled());
    expect(handleCapturePdp).toHaveBeenCalledWith(expect.anything(), '1', '2', 42);
  });

  it('does not delegate a capture to a non-Digikala sender tab', async () => {
    const worker = await loadWorker();
    const sendResponse = vi.fn();
    const sender = {
      tab: { id: 99, url: 'chrome-extension://abc/src/results/index.html' },
    } as chrome.runtime.MessageSender;

    worker({ kind: 'capture/pdp', productId: '1', variantId: '2' }, sender, sendResponse);
    await vi.waitFor(() => expect(handleCapturePdp).toHaveBeenCalled());
    expect(handleCapturePdp).toHaveBeenCalledWith(expect.anything(), '1', '2', undefined);
  });
});
