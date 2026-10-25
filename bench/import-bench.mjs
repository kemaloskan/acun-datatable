// Measures an import through the Node helper of @acunsoft/datatable-server
// (createImportHandler) into SQLite (node:sqlite): the upload (read the file,
// header and preview) and the import itself (read again, type every value,
// save in chunks), with the peak memory of the process. No speed is claimed
// without a measurement; run it on your own machine.
//
//   npm run build
//   node --expose-gc bench/import-bench.mjs --rows 100000 [--format csv|xlsx] [--chunk 1000] [--json FILE]
import { writeFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { parseArgs } from 'node:util';
import { toXlsx } from '../packages/export/dist/index.js';
import { createImportHandler } from '../packages/server/dist/import.js';

const { values: args } = parseArgs({
  options: {
    rows: { type: 'string', default: '100000' },
    format: { type: 'string', default: 'csv' },
    chunk: { type: 'string', default: '1000' },
    json: { type: 'string' },
  },
});
const rows = Number(args.rows);
const format = args.format === 'xlsx' ? 'xlsx' : 'csv';
const chunkSize = Number(args.chunk);

let peak = 0;
const sample = () => { peak = Math.max(peak, process.memoryUsage().rss); };
const sampler = setInterval(sample, 20);
const mb = bytes => Math.round(bytes / 1048576);
const seconds = ms => Math.round(ms) / 1000;

// The file: e-mail (the key), a Turkish name, a decimal total, a date; every 1,000th row has a bad total.
const names = ['Ayşe Yılmaz', 'Ali Kaya', 'İrem Şahin', 'Çağrı Öztürk', 'Zeynep Doğan', 'Ümit Kılıç'];
let generated = performance.now();
let bytes;
if (format === 'csv') {
  const lines = ['E-posta,Ad Soyad,Tutar,Tarih'];
  for (let i = 0; i < rows; i++) lines.push(`user${i}@example.com,${names[i % names.length]} ${i},${i % 1000 === 999 ? 'abc' : `${(i * 7919) % 100000}.${String(i % 100).padStart(2, '0')}`},2026-${String(1 + (i % 12)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`);
  bytes = new TextEncoder().encode(lines.join('\n'));
} else {
  const sheetRows = [];
  for (let i = 0; i < rows; i++) sheetRows.push([`user${i}@example.com`, `${names[i % names.length]} ${i}`, i % 1000 === 999 ? 'abc' : (i * 7919) % 100000 + (i % 100) / 100, new Date(Date.UTC(2026, i % 12, 1 + (i % 28)))]);
  bytes = toXlsx({ headers: ['E-posta', 'Ad Soyad', 'Tutar', 'Tarih'], rows: sheetRows, types: [undefined, undefined, 'number', 'date'] });
}
generated = performance.now() - generated;
globalThis.gc?.();
const baseline = process.memoryUsage().rss;
peak = baseline;

const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE customers (email TEXT PRIMARY KEY, name TEXT, total TEXT, joined TEXT)');
const upsert = db.prepare('INSERT INTO customers (email, name, total, joined) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO UPDATE SET name = excluded.name, total = excluded.total, joined = excluded.joined');
let saveMs = 0;
const handler = createImportHandler({
  url: '/import',
  columns: [
    { id: 'email', title: 'E-posta', required: true },
    { id: 'name', title: 'Ad Soyad' },
    { id: 'total', title: 'Tutar', type: 'decimal' },
    { id: 'joined', title: 'Tarih', type: 'date' },
  ],
  importKey: 'email',
  authorize: () => true,
  owner: () => 'bench',
  limits: { maxBytes: 2 * 1024 * 1024 * 1024, maxRows: rows },
  chunkSize,
  save: (chunk, context) => {
    const started = performance.now();
    db.exec('BEGIN');
    for (const { values } of chunk) {
      upsert.run(values.email, values.name, values.total, values.joined instanceof Date ? values.joined.toISOString().slice(0, 10) : null);
    }
    db.exec('COMMIT');
    context.inserted(chunk.length); // the bench table starts empty
    saveMs += performance.now() - started;
  },
});

const form = new FormData();
form.append('file', new File([bytes], `customers.${format}`));
let started = performance.now();
const uploaded = await (await handler.handle(new Request('http://bench/import', { method: 'POST', body: form }))).json();
const uploadMs = performance.now() - started;
sample();
started = performance.now();
const done = await (await handler.handle(new Request(`http://bench/import/${uploaded.id}/start`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ mapping: uploaded.mapping, mode: 'upsert' }),
}))).json();
const importMs = performance.now() - started;
sample();
clearInterval(sampler);

const result = {
  rows, format, chunkSize, fileMB: Math.round((bytes.length / 1048576) * 10) / 10,
  node: process.version, platform: `${process.platform} ${process.arch}`,
  uploadSeconds: seconds(uploadMs), importSeconds: seconds(importMs), saveSeconds: seconds(saveMs),
  rowsPerSecond: Math.round(rows / (importMs / 1000)),
  peakMemoryMB: mb(peak), aboveBaselineMB: mb(peak - baseline),
  status: done.status, inserted: done.inserted, failed: done.failed, stored: db.prepare('SELECT COUNT(*) AS n FROM customers').get().n,
  generateSeconds: seconds(generated),
};
console.table(result);
if (args.json) writeFileSync(args.json, `${JSON.stringify(result, null, 2)}\n`);
