// A back end that speaks the import protocol (acun-import/1) for the browser
// tests: the in-memory reference back end of @acunsoft/datatable-import (the
// built package), reading CSV and xlsx with @acunsoft/datatable-export.
// /e2e/api/import … the protocol; /e2e/api/import-records: what was imported.
import { DatabaseSync } from 'node:sqlite';
import { Readable } from 'node:stream';
import { parseCsv, readXlsx } from '../packages/export/dist/index.js';
import { createMemoryImportBackend } from '../packages/import/dist/testing.js';
import { createImportHandler } from '../packages/server/dist/import.js';

const text = cell => (cell === null ? null : cell instanceof Date ? cell.toISOString().slice(0, 10) : typeof cell === 'object' ? cell.text : String(cell));

const backend = createMemoryImportBackend({
  url: '/e2e/api/import',
  columns: [
    { id: 'email', title: 'E-mail', type: 'text', required: true },
    { id: 'name', title: 'Name' },
    { id: 'total', title: 'Total', type: 'decimal' },
  ],
  key: 'email',
  limits: { maxBytes: 64 * 1024, maxRows: 2000, accept: ['.csv', '.xlsx'] },
  backgroundFrom: 40,
  chunk: 5,
  stepMs: 100, // about a second for 60 rows, so the progress can be seen
  read: async ({ name, bytes }) => {
    const sheet = /\.xlsx$/i.test(name) ? await readXlsx(bytes) : parseCsv(new TextDecoder().decode(bytes));
    return { headers: sheet.headers, rows: sheet.rows.map(row => row.map(text)) };
  },
});

// The Node helper of @acunsoft/datatable-server (built) over SQLite, as an app would write it:
// /e2e/api/node-import … the protocol; /e2e/api/node-import-records: the imported orders.
const db = new DatabaseSync(':memory:');
db.exec('CREATE TABLE imported (owner TEXT, email TEXT, name TEXT, total TEXT, PRIMARY KEY (owner, email))');
const find = db.prepare('SELECT 1 FROM imported WHERE owner = ? AND email = ?');
const insert = db.prepare('INSERT INTO imported (owner, email, name, total) VALUES (?, ?, ?, ?)');
const update = db.prepare('UPDATE imported SET name = COALESCE(?, name), total = COALESCE(?, total) WHERE owner = ? AND email = ?');
const nodeImport = createImportHandler({
  url: '/e2e/api/node-import',
  columns: [
    { id: 'email', title: 'E-mail', required: true },
    { id: 'name', title: 'Name' },
    { id: 'total', title: 'Total', type: 'decimal' },
  ],
  importKey: 'email',
  authorize: () => true, // an app checks its session or token here
  owner: request => request.headers.get('x-user'),
  limits: { maxBytes: 64 * 1024, maxRows: 2000 },
  chunkSize: 10,
  background: ({ rows }) => rows >= 40,
  save: (rows, context) => {
    db.exec('BEGIN');
    for (const { line, values } of rows) {
      const exists = find.get(context.owner, values.email) !== undefined;
      if (exists && context.mode === 'insert') { context.reject(line, 'This e-mail exists already.', 'email', values.email); continue; }
      if (!exists && context.mode === 'update') { context.skipped(); continue; }
      if (exists) { update.run(values.name ?? null, values.total ?? null, context.owner, values.email); context.updated(); }
      else { insert.run(context.owner, values.email, values.name ?? null, values.total ?? null); context.inserted(); }
    }
    db.exec('COMMIT');
  },
});

/** Answer an import request (a Node request turned into a web Request, and back). */
export async function importApi(request, response) {
  const url = new URL(request.url, 'http://127.0.0.1');
  if (url.pathname === '/e2e/api/node-import-records') {
    const owner = `${request.headers['x-user'] ?? ''}|`;
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(JSON.stringify(db.prepare('SELECT email, name, total FROM imported WHERE owner = ? ORDER BY rowid').all(owner)));
    return;
  }
  if (url.pathname.startsWith('/e2e/api/node-import')) {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) if (typeof value === 'string') headers.set(name, value);
    const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : Readable.toWeb(request);
    const answer = await nodeImport.handle(new Request(url, { method: request.method, headers, body, duplex: 'half' }));
    response.writeHead(answer.status, Object.fromEntries(answer.headers)).end(Buffer.from(await answer.arrayBuffer()));
    return;
  }
  if (url.pathname === '/e2e/api/import-records') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(JSON.stringify([...backend.records].filter(([key]) => key.startsWith(`${request.headers['x-user'] ?? 'guest'}:`)).map(([, row]) => row)));
    return;
  }
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) if (typeof value === 'string') headers.set(name, value);
  const body = request.method === 'GET' || request.method === 'HEAD' ? undefined : Readable.toWeb(request);
  const answer = await backend.handle(new Request(url, { method: request.method, headers, body, duplex: 'half' }));
  response.writeHead(answer.status, Object.fromEntries(answer.headers)).end(Buffer.from(await answer.arrayBuffer()));
}
