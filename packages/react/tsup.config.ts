import { defineConfig } from 'tsup';

// "use client": the components use hooks, so React Server Component frameworks
// (Next.js App Router) must treat this package as client code.
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: false, // declarations come from tsc (see tsconfig.build.json)
  clean: true,
  external: ['react', '@acunsoft/datatable-core', '@acunsoft/datatable-dom'],
  banner: { js: '"use client";' },
});
