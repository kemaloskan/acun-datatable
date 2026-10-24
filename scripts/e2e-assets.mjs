// Bundles the React and Vue fixtures (e2e/fixtures/apps) against the built
// packages, into e2e/fixtures/build/. Run after `npm run build`.
import { build } from 'esbuild';

await build({
  entryPoints: ['e2e/fixtures/apps/react-app.jsx', 'e2e/fixtures/apps/vue-app.js'],
  outdir: 'e2e/fixtures/build',
  bundle: true,
  format: 'esm',
  jsx: 'automatic',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"development"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
});
console.log('e2e/fixtures/build: react-app.js, vue-app.js');
