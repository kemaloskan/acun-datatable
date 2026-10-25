// Prepares site/demo/ for the online demo (GitHub Pages) and for trying it
// locally. Run after `npm run build`:
// - copies the <script> build and the stylesheet;
// - bundles the React and Vue demos (site/demo/src) against the built packages.
import { copyFileSync, mkdirSync } from 'node:fs';
import { build } from 'esbuild';

const target = new URL('../site/demo/', import.meta.url);
mkdirSync(target, { recursive: true });
for (const file of ['acun-datatable.min.js', 'styles.css']) {
  copyFileSync(new URL(`../packages/datatable/dist/${file}`, import.meta.url), new URL(file, target));
}

const shared = {
  bundle: true, format: 'esm', minify: true, legalComments: 'none', logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'true', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
};
await build({ ...shared, entryPoints: ['site/demo/src/react-demo.jsx'], outfile: 'site/demo/react-demo.js', jsx: 'automatic' });
// The full Vue build: the demo's component has its template as a string, as an SFC would.
await build({ ...shared, entryPoints: ['site/demo/src/vue-demo.js'], outfile: 'site/demo/vue-demo.js', alias: { vue: 'vue/dist/vue.esm-bundler.js' } });
console.log('site/demo: acun-datatable.min.js, styles.css, react-demo.js, vue-demo.js');
