import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// The tests read files with the export package's sources, so `npm test` does not depend on a prior build.
export default defineConfig({
  resolve: {
    alias: {
      '@acunsoft/datatable-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@acunsoft/datatable-export': fileURLToPath(new URL('../export/src/index.ts', import.meta.url)),
    },
  },
});
