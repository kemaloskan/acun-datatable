import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The dialog tests run in jsdom; the tests read files with the export package's sources, so `npm test` needs no prior build.
export default defineConfig({
  resolve: {
    alias: {
      '@acunsoft/datatable-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@acunsoft/datatable-export': fileURLToPath(new URL('../export/src/index.ts', import.meta.url)),
    },
  },
  test: { environment: 'node' }, // the dialog tests ask for jsdom themselves
});
