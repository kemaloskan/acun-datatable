import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test against the sources (core, export, the import test kit) so `npm test` does not depend on a prior build.
export default defineConfig({
  resolve: {
    alias: {
      '@acunsoft/datatable-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@acunsoft/datatable-export': fileURLToPath(new URL('../export/src/index.ts', import.meta.url)),
      '@acunsoft/datatable-import/testing': fileURLToPath(new URL('../import/src/testing.ts', import.meta.url)),
    },
  },
});
