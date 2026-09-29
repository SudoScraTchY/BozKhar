/**
 * In-memory stand-ins for the chrome.storage surface used in T02.
 * The fake area emits onChanged events exactly like chrome does when
 * set()/clear() run, so change subscriptions are testable.
 */
import type { StorageAreaLike } from '../src/shared/settings/settings';

export type FakeChanges = Record<string, { oldValue?: unknown; newValue?: unknown }>;
export type ChangeListener = (changes: FakeChanges, namespace: string) => void;

export class FakeStorageArea implements StorageAreaLike {
  private map = new Map<string, unknown>();
  private changeListeners = new Set<ChangeListener>();

  async get(keys?: string | string[] | null): Promise<Record<string, unknown>> {
    if (keys == null) return Object.fromEntries(this.map);
    const wanted = typeof keys === 'string' ? [keys] : keys;
    const out: Record<string, unknown> = {};
    for (const k of wanted) {
      if (this.map.has(k)) out[k] = this.map.get(k);
    }
    return out;
  }

  async set(items: Record<string, unknown>): Promise<void> {
    const changes: FakeChanges = {};
    for (const [k, v] of Object.entries(items)) {
      const oldValue = this.map.has(k) ? this.map.get(k) : undefined;
      this.map.set(k, structuredClone(v));
      changes[k] = { oldValue, newValue: structuredClone(v) };
    }
    this.emit(changes);
  }

  async clear(): Promise<void> {
    const changes: FakeChanges = {};
    for (const [k, v] of this.map) changes[k] = { oldValue: v, newValue: undefined };
    this.map.clear();
    this.emit(changes);
  }

  /** Mirrors chrome.storage.onChanged wiring; returns an unsubscribe fn. */
  subscribe(fn: ChangeListener): () => void {
    this.changeListeners.add(fn);
    return () => {
      this.changeListeners.delete(fn);
    };
  }

  private emit(changes: FakeChanges): void {
    for (const fn of this.changeListeners) fn(changes, 'local');
  }
}

/** Installs a global chrome stub backed by one shared FakeStorageArea. */
export function installChromeStorageStub(): FakeStorageArea {
  const area = new FakeStorageArea();
  const removers = new Map<ChangeListener, () => void>();
  (globalThis as Record<string, unknown>).chrome = {
    storage: {
      local: area,
      onChanged: {
        addListener: (fn: ChangeListener): void => {
          removers.set(fn, area.subscribe(fn));
        },
        removeListener: (fn: ChangeListener): void => {
          removers.get(fn)?.();
          removers.delete(fn);
        },
      },
    },
  };
  return area;
}
