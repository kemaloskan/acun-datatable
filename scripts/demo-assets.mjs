// Copies the <script> build and the stylesheet into site/demo/, for the online demo
// (GitHub Pages) and for trying it locally. Run after `npm run build`.
import { copyFileSync, mkdirSync } from 'node:fs';

const target = new URL('../site/demo/', import.meta.url);
mkdirSync(target, { recursive: true });
for (const file of ['acun-datatable.min.js', 'styles.css']) {
  copyFileSync(new URL(`../packages/datatable/dist/${file}`, import.meta.url), new URL(file, target));
}
console.log('site/demo: acun-datatable.min.js, styles.css');
