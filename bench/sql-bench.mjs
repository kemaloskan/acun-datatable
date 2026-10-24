#!/usr/bin/env node
// Measures the SQL that @acunsoft/datatable-server writes, on a real database
// of any size: the table is generated inside the database (no rows travel
// from here), then each request type runs several times and is reported as
// p50 / p95. Run `npm run build` first.
//
//   node bench/sql-bench.mjs --db postgres://postgres@127.0.0.1:5432/adt_bench --rows 5000000
//   node bench/sql-bench.mjs --db mysql://root:secret@127.0.0.1:3306/adt_bench --rows 5000000
//
// Options: --rows N (default 1,000,000), --runs N (default 7), --timeout S
// (seconds per statement, default 60), --keep (keep the table for the next
// run; it is reused when it has the same size), --json FILE (write results).
// Only the table `adt_perf` is created and dropped; use a database of its own.
import { writeFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { parseArgs } from 'node:util';
import { defineColumns, readTableQuery, sqlQuery } from '../packages/server/dist/index.js';

const { values: args } = parseArgs({
  options: {
    db: { type: 'string' }, rows: { type: 'string', default: '1000000' }, runs: { type: 'string', default: '7' },
    timeout: { type: 'string', default: '60' }, keep: { type: 'boolean', default: false }, json: { type: 'string' },
  },
});
if (!args.db) throw new Error('--db is required, e.g. postgres://postgres@127.0.0.1:5432/adt_bench');
const ROWS = Number(args.rows);
const RUNS = Number(args.runs);
const TIMEOUT = Number(args.timeout);
if (!Number.isSafeInteger(ROWS) || ROWS < 1000) throw new Error('--rows must be a whole number of at least 1000');
const dialect = args.db.startsWith('postgres') ? 'postgres' : args.db.startsWith('mysql') ? 'mysql' : undefined;
if (!dialect) throw new Error('--db must be a postgres:// or mysql:// URL (MySQL and MariaDB)');

// The data: Turkish names (and their folded copies, as foldText writes them), cities, statuses, six years of dates.
const NAMES = ['Ayşe Yılmaz', 'Ali Kaya', 'İrem Şahin', 'Çağrı Öztürk', 'Zeynep Doğan', 'Ümit Kılıç', 'Deniz Ak', 'Gülşen Erdoğan', 'Hakan Çelik', 'Şule Aydın',
  'Mehmet Öz', 'Ebru Güneş', 'Oğuz Kara', 'Selin Arslan', 'Burak Yıldız', 'Nur Koç', 'Emre Polat', 'Ceren Uçar', 'İsmail Tekin', 'Özge Bulut'];
const fold = text => text.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
const CITIES = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya', 'Adana', 'Gaziantep'];
const STATUSES = ['new', 'paid', 'shipped', 'cancelled'];
const SECONDS = 6 * 365 * 24 * 3600;
const columns = defineColumns({
  customer: { sortable: true, filterable: true, search: 'customer_search' },
  city: { sortable: true, filterable: true, nullable: true },
  total: { type: 'decimal', sortable: true, filterable: true },
  status: { sortable: true, filterable: true },
  ordered: { sql: 'ordered_at', type: 'datetime', sortable: true, filterable: true },
});

const db = await connect();
const started = performance.now();
await seed();
console.error(`table ready (${((performance.now() - started) / 1000).toFixed(1)} s)`);

const pageSize = 25;
// The page in the middle of the table (the wire format allows pages up to 1,000,000).
const deep = Math.min(1_000_000, Math.floor(ROWS / 2 / pageSize));
const results = [];
const measure = async (name, params, { count = true } = {}) => {
  const query = readTableQuery(new URLSearchParams(params), columns, { maxPageSize: 100 });
  const sql = sqlQuery(query, columns, { dialect, table: 'adt_perf' });
  // The limited count of the Laravel adapter: matches are counted only up to 10,001.
  const probe = { text: sql.count.text.replace(/^SELECT COUNT\(\*\) AS \S+ FROM /, 'SELECT COUNT(*) AS n FROM (SELECT 1 AS m FROM ') + ' LIMIT 10001) AS probe', values: sql.count.values };
  const page = [];
  const counts = [];
  const probes = [];
  for (let run = 0; run < RUNS; run++) {
    page.push(await timed(sql.page));
    if (count) {
      counts.push(await timed(sql.count));
      probes.push(await timed(probe));
    }
  }
  const row = { name, params, page: stats(page), ...(count ? { count: stats(counts), limited: stats(probes) } : {}), plan: await plan(sql.page) };
  results.push(row);
  console.error(`${name}: page ${show(row.page)}${count ? `, count ${show(row.count)}, limited count ${show(row.limited)}` : ''}`);
  return sql;
};

await measure('first page (newest first)', `pageSize=${pageSize}&sort=ordered:desc`);
await measure('page 2', `pageSize=${pageSize}&sort=ordered:desc&page=2`, { count: false });
await measure(`page ${deep.toLocaleString('en')} by OFFSET`, `pageSize=${pageSize}&sort=ordered:desc&page=${deep}`, { count: false });
// Deep in the table by cursor: after the row in the middle by key (keyset cost does not depend on the depth).
const [middle] = await db.all({ text: `SELECT id, ordered_at FROM adt_perf WHERE id = ${Math.floor(ROWS / 2)}`, values: [] });
const cursorSql = sqlQuery(readTableQuery(new URLSearchParams(`pageSize=${pageSize}&sort=ordered:desc&paging=cursor`), columns), columns, { dialect, table: 'adt_perf' });
await measure('deep page by cursor', `pageSize=${pageSize}&sort=ordered:desc&paging=cursor&cursor=${cursorSql.cursorOf(middle)}`, { count: false });
await measure('filter status, sort by total', `pageSize=${pageSize}&sort=total:desc&filters[0][field]=status&filters[0][op]=eq&filters[0][value]=paid`);
await measure('one month, newest first', `pageSize=${pageSize}&sort=ordered:desc&filters[0][field]=ordered&filters[0][op]=between&filters[0][value][0]=2023-03-01&filters[0][value][1]=2023-03-31`);
await measure('search "ayse" (folded column)', `pageSize=${pageSize}&sort=ordered:desc&search=ayse`);
await measure('search a rare word (3 columns, 1 indexed)', `pageSize=${pageSize}&search=zzqx`);
await measure('two filters no index serves, many matches', `pageSize=${pageSize}&filters[0][field]=city&filters[0][op]=eq&filters[0][value]=Konya&filters[1][field]=status&filters[1][op]=eq&filters[1][value]=cancelled`);
await measure('a rare word in the indexed column', `pageSize=${pageSize}&filters[0][field]=customer&filters[0][op]=contains&filters[0][value]=zzqx`);

await db.close();
console.log(report());
if (args.json) writeFileSync(args.json, `${JSON.stringify({ dialect, rows: ROWS, runs: RUNS, server: db.version, results }, null, 2)}\n`);

// ---------------------------------------------------------------------------

async function timed(statement) {
  const start = performance.now();
  try {
    await db.all(statement);
  } catch (error) {
    if (db.isTimeout(error)) return Infinity;
    throw error;
  }
  return performance.now() - start;
}

function stats(times) {
  const sorted = [...times].sort((a, b) => a - b);
  const at = share => sorted[Math.min(sorted.length - 1, Math.ceil(share * sorted.length) - 1)];
  return { p50: at(0.5), p95: at(0.95) };
}

function show(value) {
  const ms = time => (time === Infinity ? `> ${TIMEOUT} s` : time >= 1000 ? `${(time / 1000).toFixed(2)} s` : `${time.toFixed(1)} ms`);
  return `${ms(value.p50)} / ${ms(value.p95)}`;
}

function report() {
  const lines = [
    `${dialect} ${db.version}, ${ROWS.toLocaleString('en')} rows, ${RUNS} runs each, p50 / p95`,
    '',
    '| Request | Page | Count | Count up to 10,001 | Plan |',
    '|---|---|---|---|---|',
    ...results.map(row => `| ${row.name} | ${show(row.page)} | ${row.count ? show(row.count) : '–'} | ${row.limited ? show(row.limited) : '–'} | ${row.plan} |`),
  ];
  return lines.join('\n');
}

async function plan(statement) {
  try {
    if (dialect === 'postgres') {
      const [row] = await db.all({ text: `EXPLAIN (FORMAT JSON) ${statement.text}`, values: statement.values });
      const scans = new Set();
      const walk = node => { if (/Scan/.test(node['Node Type'])) scans.add(`${node['Node Type']}${node['Index Name'] ? ` ${node['Index Name']}` : ''}`); (node.Plans ?? []).forEach(walk); };
      walk(row['QUERY PLAN'][0].Plan);
      return [...scans].join(', ');
    }
    const rows = await db.all({ text: `EXPLAIN ${statement.text}`, values: statement.values });
    return rows.map(row => `${row.type}${row.key ? ` ${row.key}` : ''}`).join(', ');
  } catch {
    return '?';
  }
}

async function connect() {
  if (dialect === 'postgres') {
    const { default: pg } = await import('pg');
    const client = new pg.Client({ connectionString: args.db });
    await client.connect();
    await client.query(`SET statement_timeout = ${TIMEOUT * 1000}`);
    const version = (await client.query('SHOW server_version')).rows[0].server_version;
    return {
      version,
      all: async ({ text, values }) => (await client.query(text, [...values])).rows,
      run: text => client.query(text),
      isTimeout: error => error?.code === '57014',
      close: () => client.end(),
    };
  }
  const { default: mysql } = await import('mysql2/promise');
  const connection = await mysql.createConnection({ uri: args.db, multipleStatements: false });
  const [[{ version }]] = await connection.query('SELECT VERSION() AS version');
  const maria = /mariadb/i.test(version);
  await connection.query(maria ? `SET SESSION max_statement_time = ${TIMEOUT}` : `SET SESSION max_execution_time = ${TIMEOUT * 1000}`);
  return {
    version,
    all: async ({ text, values }) => (await connection.query(text, [...values]))[0],
    run: text => connection.query(text),
    isTimeout: error => error?.errno === 3024 || error?.errno === 1969,
    close: () => connection.end(),
  };
}

async function seed() {
  const existing = await db.all({ text: dialect === 'postgres'
    ? "SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_name = 'adt_perf'"
    : "SELECT count(*) AS n FROM information_schema.tables WHERE table_name = 'adt_perf' AND table_schema = DATABASE()", values: [] });
  if (Number(existing[0].n) > 0) {
    const [{ n }] = await db.all({ text: 'SELECT max(id) AS n FROM adt_perf', values: [] });
    if (Number(n) === ROWS) return;
    await db.run('DROP TABLE adt_perf');
  }
  const pick = (list, expression) => (dialect === 'postgres'
    ? `(ARRAY[${list.map(item => `'${item}'`).join(', ')}])[(${expression}) % ${list.length} + 1]`
    : `ELT((${expression}) % ${list.length} + 1, ${list.map(item => `'${item}'`).join(', ')})`);
  const values = n => [
    n,
    `${pick(NAMES, `${n} * 7`)}`,
    `${pick(NAMES.map(fold), `${n} * 7`)}`,
    `CASE WHEN ${n} % 11 = 0 THEN NULL ELSE ${pick(CITIES, `${n} * 13`)} END`,
    `(${n} * 7919 % 10000000) / 100.0`,
    pick(STATUSES, `${n} * 3`),
    dialect === 'postgres'
      ? `TIMESTAMP '2020-01-01' + ((${n} * 2654435761) % ${SECONDS}) * INTERVAL '1 second'`
      : `TIMESTAMP '2020-01-01 00:00:00' + INTERVAL ((${n} * 2654435761) % ${SECONDS}) SECOND`,
  ].join(', ');
  if (dialect === 'postgres') {
    await db.run(`CREATE ${args.keep ? '' : 'UNLOGGED '}TABLE adt_perf (id bigint PRIMARY KEY, customer text, customer_search text, city text,
      total numeric(12,2), status text, ordered_at timestamp(3))`);
  } else {
    await db.run(`CREATE TABLE adt_perf (id bigint PRIMARY KEY, customer varchar(60), customer_search varchar(60), city varchar(40),
      total decimal(12,2), status varchar(20), ordered_at datetime(3)) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  }
  const CHUNK = 1_000_000;
  for (let from = 1; from <= ROWS; from += CHUNK) {
    const to = Math.min(ROWS, from + CHUNK - 1);
    if (dialect === 'postgres') {
      await db.run(`INSERT INTO adt_perf SELECT ${values('n')} FROM generate_series(${from}::bigint, ${to}::bigint) AS n`);
    } else {
      // A million numbers from six digits (MySQL has no generate_series, and cannot open a temporary
      // table twice in one query: a CTE; the same SQL runs on MariaDB).
      const n = `(${from} + a.d + b.d * 10 + c.d * 100 + d.d * 1000 + e.d * 10000 + f.d * 100000)`;
      const digits = 'WITH digits (d) AS (SELECT 0 UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9)';
      await db.run(`INSERT INTO adt_perf ${digits} SELECT ${values(n)} FROM digits a, digits b, digits c, digits d, digits e, digits f WHERE ${n} <= ${to}`);
    }
    console.error(`  ${to.toLocaleString('en')} rows`);
  }
  // The indexes the docs recommend: (sort column, key) and (filter, sort column, key).
  for (const index of ['(ordered_at, id)', '(total, id)', '(status, total, id)', '(customer_search)']) {
    await db.run(`CREATE INDEX adt_perf_${index.replace(/\W+/g, '_').replace(/^_|_$/g, '')} ON adt_perf ${index}`);
  }
  if (dialect === 'postgres') {
    try {
      await db.run('CREATE EXTENSION IF NOT EXISTS pg_trgm');
      await db.run('CREATE INDEX adt_perf_customer_trgm ON adt_perf USING gin (customer_search gin_trgm_ops)');
    } catch {
      console.error('  pg_trgm is not available: search runs without a trigram index');
    }
    await db.run('ANALYZE adt_perf');
  } else {
    await db.run('ANALYZE TABLE adt_perf');
  }
}

if (!args.keep) {
  // Dropped at the end unless --keep (a new connection: the measuring one is closed).
  const again = await connect();
  await again.run('DROP TABLE IF EXISTS adt_perf');
  await again.close();
}
