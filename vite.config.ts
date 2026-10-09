import { defineConfig } from 'vite';
import { crx } from '@crxjs/vite-plugin';
import { manifest } from './src/manifest';

export default defineConfig({
  plugins: [crx({ manifest })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // The results page (T05, D-18) is a plain extension page
    // outside the manifest's html-entry fields (options_ui), so
    // it is registered here as an explicit HTML entry: vite then
    // rewrites its module script + stylesheet to bundled assets
    // (web_accessible_resources alone would only copy the raw
    // file, leaving ./index.ts un-bundled).
    rollupOptions: {
      input: { results: 'src/results/index.html' },
    },
  },
});
