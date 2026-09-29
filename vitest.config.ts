import { defineConfig } from 'vitest/config';

// Tests run in plain node; IndexedDB comes from fake-indexeddb (tests/setup.ts).
// Runtime code must never import test shims; the solver (T04) must stay browser-free.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**'],
    },
  },
});
