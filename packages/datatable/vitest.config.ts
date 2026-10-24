import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// Runs in jsdom; the other packages are resolved from source so tests need no prior build.
const source = (path: string) => fileURLToPath(new URL(path, import.meta.url));
export default defineConfig({
  resolve: {
    alias: {
      '@acunsoft/datatable-core': source('../core/src/index.ts'),
      '@acunsoft/datatable-dom': source('../renderer-dom/src/index.ts'),
      '@acunsoft/datatable-http': source('../datasource-http/src/index.ts'),
      '@acunsoft/datatable-export': source('../export/src/index.ts'),
    },
  },
  test: { environment: 'jsdom' },
});
