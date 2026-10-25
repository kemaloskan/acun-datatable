// A back end that speaks the import protocol (acun-import/1) for the browser
// tests: the in-memory reference back end of @acunsoft/datatable-import (the
// built package), reading CSV and xlsx with @acunsoft/datatable-export.
// /e2e/api/import … the protocol; /e2e/api/import-records: what was imported.
import { Readable } from 'node:stream';
import { parseCsv, readXlsx } from '../packages/export/dist/index.js';
import { createMemoryImportBackend } from '../packages/import/dist/testing.js';

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

/** Answer an import request (a Node request turned into a web Request, and back). */
export async function importApi(request, response) {
  const url = new URL(request.url, 'http://127.0.0.1');
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
