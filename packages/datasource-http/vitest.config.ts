import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Test against core sources so `npm test` does not depend on a prior build.
export default defineConfig({
  resolve: {
    alias: { '@acunsoft/datatable-core': fileURLToPath(new URL('../core/src/index.ts', import.meta.url)) },
  },
});
