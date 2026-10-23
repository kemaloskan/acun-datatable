import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test against the sibling sources so `npm test` does not depend on a prior build.
export default defineConfig({
  resolve: {
    alias: {
      '@acunsoft/datatable-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)),
      '@acunsoft/datatable-dom': fileURLToPath(new URL('../renderer-dom/src/index.ts', import.meta.url)),
    },
  },
  test: { environment: 'jsdom' },
});
