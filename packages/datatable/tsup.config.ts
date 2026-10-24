import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // npm: ES module; the other packages stay dependencies.
    entry: { index: 'src/index.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    external: ['@acunsoft/datatable-core', '@acunsoft/datatable-dom', '@acunsoft/datatable-http'],
  },
  {
    // <script src="…/acun-datatable.min.js">: everything in one file, window.AcunDataTable.
    entry: { 'acun-datatable.min': 'src/global.ts' },
    format: ['iife'],
    minify: true,
    noExternal: [/^@acunsoft\//],
    outExtension: () => ({ js: '.js' }),
  },
]);
