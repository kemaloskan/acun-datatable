import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// DOM tests run in jsdom; core is resolved from source so tests need no prior build.
export default defineConfig({
  resolve: {
    alias: { '@acunsoft/datatable-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
  test: { environment: 'jsdom' },
});
