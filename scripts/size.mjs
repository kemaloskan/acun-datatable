// Fails when a built file grows past its gzip budget (size-budget.json). Run after `npm run build`.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budgets = JSON.parse(readFileSync(new URL('../size-budget.json', import.meta.url), 'utf8'));
let failed = false;
for (const [file, budget] of Object.entries(budgets)) {
  if (file.startsWith('//')) continue;
  let size;
  try {
    size = gzipSync(readFileSync(new URL(`../${file}`, import.meta.url)), { level: 9 }).length;
  } catch {
    console.error(`missing ${file}: run npm run build first`);
    failed = true;
    continue;
  }
  const over = size > budget;
  failed ||= over;
  console.log(`${over ? '✗' : '✓'} ${file.padEnd(48)} ${(size / 1024).toFixed(1).padStart(6)} KB gzip  (budget ${(budget / 1024).toFixed(1)} KB)`);
}
if (failed) {
  console.error('\nA file is over its size budget. Make it smaller, or raise its budget in size-budget.json on purpose.');
  process.exit(1);
}
