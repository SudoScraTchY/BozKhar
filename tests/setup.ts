/**
 * Vitest setup: install fake-indexeddb as the global IndexedDB.
 * Test-only shim - runtime code never imports anything from tests/.
 */
import { IDBFactory } from 'fake-indexeddb';

globalThis.indexedDB = new IDBFactory();
