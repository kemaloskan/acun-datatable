import { defineConfig } from 'tsup';

export default defineConfig([
  {
    // npm: the protocol, the client and the dialog; the test kit apart.
    entry: { index: 'src/index.ts', testing: 'src/testing.ts' },
    format: ['esm'],
    dts: true,
    clean: true,
    splitting: false,
  },
  {
    // <script src="…/acun-datatable-import.min.js">: window.AcunImport.
    entry: { 'acun-datatable-import.min': 'src/global.ts' },
    format: ['iife'],
    minify: true,
    outExtension: () => ({ js: '.js' }),
  },
]);
