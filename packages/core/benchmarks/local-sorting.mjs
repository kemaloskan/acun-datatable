import { performance } from 'node:perf_hooks';
import { cpus, platform, release, arch } from 'node:os';
import assert from 'node:assert/strict';
import { createRows, createLocalRowModel } from '../dist/index.js';

// Fixed seed and duplicates exercise multi-column precedence and stable ties.
function dataset(size) {
  let seed = 42;
  return Array.from({ length: size }, (_, id) => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return { id, group: seed % 32, score: seed % 1009, name: `Kayıt ${seed % 100}` };
  });
}
const definitions = [
  { id: 'group', header: '', accessorKey: 'group', enableSorting: true },
  { id: 'score', header: '', accessorFn: row => row.score, enableSorting: true },
  { id: 'name', header: '', accessorKey: 'name', enableSorting: true },
];
const sorting = [
  { field: 'group', direction: 'asc' },
  { field: 'score', direction: 'desc' },
  { field: 'name', direction: 'asc' },
];
const measure = fn => {
  const start = performance.now();
  const value = fn();
  return { value, ms: performance.now() - start };
};
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const collator = new Intl.Collator('tr', { usage: 'sort', numeric: true }); // matches the model's natural order
console.log(JSON.stringify({ node: process.version, v8: process.versions.v8, icu: process.versions.icu,
  os: `${platform()} ${release()} ${arch()}`, cpu: cpus()[0]?.model,
  seed: 42, locale: 'tr', criteria: 3, warmups: 2, samples: 5,
  note: 'Local machine timings; data generation and correctness checks excluded. No rendering or performance guarantee.' }));
for (const size of [1_000, 10_000, 100_000]) {
  const data = dataset(size);
  const core = measure(() => createRows(data));
  const setup = measure(() => createLocalRowModel(core.value, definitions, { locale: 'tr' }));
  const model = setup.value;
  const cold = measure(() => model.getSortedRows(sorting));
  const expected = [...data].sort((a, b) => a.group - b.group || b.score - a.score || collator.compare(a.name, b.name));
  assert.deepEqual(cold.value.map(row => row.id), expected.map(row => String(row.id)));
  const times = [];
  for (let i = 0; i < 7; i++) {
    model.invalidate();
    const run = measure(() => model.getSortedRows(sorting));
    if (i >= 2) times.push(run.ms);
  }
  const cached = model.getSortedRows(sorting);
  const hits = measure(() => {
    for (let i = 0; i < 10_000; i++) assert.equal(model.getSortedRows(sorting), cached);
  });
  console.log(JSON.stringify({ rows: size, coreMs: core.ms, setupMs: setup.ms,
    coldSortMs: cold.ms, warmSortMedianMs: median(times), warmSortMinMs: Math.min(...times),
    warmSortMaxMs: Math.max(...times), cacheHitMeanMs: hits.ms / 10_000 }));
}
