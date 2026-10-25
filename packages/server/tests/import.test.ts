import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runImportConformance } from '@acunsoft/datatable-import/testing';
import { toXlsx } from '@acunsoft/datatable-export';
import {
  createImportHandler, directoryImportStore, memoryImportStore, toNodeListener,
  type ImportHandlerOptions, type ImportRow, type ImportSaveContext,
} from '../src/import';

const URL_BASE = 'http://app.test/api/orders/import';
const folders: string[] = [];
afterAll(() => folders.forEach(folder => rmSync(folder, { recursive: true, force: true })));

/** A "database": orders by customer, per tenant, with the save() an app would write. */
function setup(overrides: Partial<ImportHandlerOptions> = {}) {
  const orders = new Map<string, Record<string, unknown>>();
  const save = async (rows: readonly ImportRow[], context: ImportSaveContext): Promise<void> => {
    for (const row of rows) {
      const key = `${context.tenant}:${String(row.values['customer'])}`;
      const exists = orders.has(key);
      if (exists && context.mode === 'insert') { context.reject(row.line, 'This customer exists already.', 'customer', String(row.values['customer'])); continue; }
      if (!exists && context.mode === 'update') { context.skipped(); continue; }
      orders.set(key, { ...orders.get(key), ...row.values });
      if (exists) context.updated(); else context.inserted();
    }
  };
  const handler = createImportHandler({
    url: '/api/orders/import',
    columns: [
      { id: 'customer', title: 'Customer', required: true, aliases: ['Müşteri'] },
      { id: 'city', title: 'City' },
      { id: 'total', title: 'Total', type: 'decimal' },
    ],
    importKey: 'customer',
    authorize: request => request.headers.get('x-deny') === null,
    owner: request => request.headers.get('x-user'),
    tenant: request => request.headers.get('x-tenant'),
    save,
    limits: { maxBytes: 64 * 1024, maxRows: 500 },
    chunkSize: 3,
    ...overrides,
  });
  const fetch = ((input: RequestInfo | URL, init?: RequestInit) => handler.handle(new Request(new URL(String(input), URL_BASE), init))) as typeof globalThis.fetch;
  return { handler, orders, fetch };
}
const as = (user: string, tenant = 't1') => ({ 'X-User': user, 'X-Tenant': tenant });
const csv = (text: string, name = 'orders.csv') => new File([text], name, { type: 'text/csv' });
const upload = (fetch: typeof globalThis.fetch, file: File, headers: Record<string, string> = as('u1')) => {
  const form = new FormData();
  form.append('file', file);
  return fetch(URL_BASE, { method: 'POST', body: form, headers });
};
const start = (fetch: typeof globalThis.fetch, id: string, body: unknown, headers: Record<string, string> = as('u1')) =>
  fetch(`${URL_BASE}/${id}/start`, { method: 'POST', body: JSON.stringify(body), headers: { ...headers, 'Content-Type': 'application/json' } });
const instant = () => new Promise<void>(resolve => setTimeout(resolve, 0)); // a macrotask, so background work can run

describe('createImportHandler', () => {
  it('passes the conformance run of @acunsoft/datatable-import, at once and in the background', async () => {
    for (const overrides of [{}, { background: () => true }]) {
      const { fetch } = setup(overrides);
      const result = await runImportConformance({
        url: URL_BASE, fetch, headers: as('conformance'), delay: instant,
        file: csv('Customer,City,Total\nAyşe,İzmir,1250.50\n,Nowhere,1\nAli,Ankara,abc\n'),
      });
      expect(result.checks.filter(check => !check.ok)).toEqual([]);
    }
  });

  it('passes with the folder store too, and an import outlives a restart', async () => {
    const folder = mkdtempSync(`${tmpdir()}/adt-import-`);
    folders.push(folder);
    const first = setup({ store: directoryImportStore(folder) });
    const result = await runImportConformance({ url: URL_BASE, fetch: first.fetch, headers: as('c'), delay: instant, file: csv('Customer,Total\nA,1\n') });
    expect(result.checks.filter(check => !check.ok)).toEqual([]);
    const id = ((await (await upload(first.fetch, csv('Customer,Total\nB,2\n'))).json()) as { id: string }).id;
    const restarted = setup({ store: directoryImportStore(folder) }); // a new process, the same folder
    expect(await (await start(restarted.fetch, id, { mapping: ['customer', 'total'], mode: 'upsert' })).json()).toMatchObject({ status: 'done', inserted: 1 });
  });

  it('suggests the mapping, previews, and imports at once with insert, update and upsert', async () => {
    const { fetch, orders } = setup();
    const uploaded = await (await upload(fetch, csv('Müşteri,CITY,Total,Not\nAyşe,İzmir,"1250,50",x\nAli,Ankara,90,\n'))).json() as Record<string, unknown>;
    expect(uploaded).toMatchObject({
      protocol: 'acun-import/1', status: 'mapping', headers: ['Müşteri', 'CITY', 'Total', 'Not'], mapping: ['customer', 'city', 'total', null],
      preview: [{ line: 2, cells: ['Ayşe', 'İzmir', '1250,50', 'x'] }, { line: 3, cells: ['Ali', 'Ankara', '90', null] }],
      modes: ['upsert', 'insert', 'update'], mode: 'upsert', file: { name: 'orders.csv', rows: 2 },
    });
    const done = await (await start(fetch, uploaded['id'] as string, { mapping: ['customer', 'city', 'total', null], mode: 'upsert' })).json();
    expect(done).toMatchObject({ status: 'done', inserted: 1, failed: 1, errors: [{ line: 2, column: 'total', code: 'invalid' }] }); // "1250,50" with the "." separator
    expect(orders.get('t1:Ali')).toEqual({ customer: 'Ali', city: 'Ankara', total: '90' });

    const second = await (await upload(fetch, csv('Customer,Total\nAli,95\nNew,1\n'))).json() as { id: string };
    expect(await (await start(fetch, second.id, { mapping: ['customer', 'total'], mode: 'insert' })).json())
      .toMatchObject({ inserted: 1, failed: 1, errors: [{ line: 2, column: 'customer', value: 'Ali', code: 'refused', message: 'This customer exists already.' }] });
    const third = await (await upload(fetch, csv('Customer,Total\nAli,99\nNobody,1\n'))).json() as { id: string };
    expect(await (await start(fetch, third.id, { mapping: ['customer', 'total'], mode: 'update' })).json()).toMatchObject({ updated: 1, skipped: 1 });
  });

  it('reads xlsx, and Turkish decimals with read options', async () => {
    const { fetch, orders } = setup({ read: { decimalSeparator: ',', locale: 'tr' } });
    const workbook = new File([toXlsx({ headers: ['Customer', 'Total'], rows: [['Deniz', 12.5]] }) as BlobPart], 'orders.xlsx');
    const uploaded = await (await upload(fetch, workbook)).json() as { id: string; mapping: unknown };
    expect(uploaded.mapping).toEqual(['customer', 'total']);
    await start(fetch, uploaded.id, { mapping: ['customer', 'total'], mode: 'upsert' });
    const text = await (await upload(fetch, csv('Customer,Total\nEce,"1.234,50"\n'))).json() as { id: string };
    await start(fetch, text.id, { mapping: ['customer', 'total'], mode: 'upsert' });
    expect([orders.get('t1:Deniz')?.['total'], orders.get('t1:Ece')?.['total']]).toEqual(['12.5', '1234.50']);
  });

  it('checks its limits and the file signature on every upload', async () => {
    const { fetch } = setup();
    expect((await upload(fetch, csv('a'.repeat(70 * 1024)))).status).toBe(413);
    expect((await upload(fetch, csv('Customer', 'orders.pdf'))).status).toBe(415);
    expect((await upload(fetch, csv('not a zip', 'orders.xlsx'))).status).toBe(415);
    expect((await upload(fetch, csv('Customer\u0000binary'))).status).toBe(415);
    expect(await (await upload(fetch, csv(`Customer\n${'x\n'.repeat(501)}`))).json()).toEqual({ message: 'The file has more than 500 rows.', errors: { file: ['The file has more than 500 rows.'] } });
    expect((await upload(fetch, csv(''))).status).toBe(422);
    expect((await fetch(URL_BASE, { method: 'POST', body: new FormData(), headers: as('u1') })).status).toBe(422);
    // A declared size past the limit is refused before the body is read.
    expect((await fetch(URL_BASE, { method: 'POST', headers: { ...as('u1'), 'Content-Length': String(10 * 1024 * 1024) }, body: 'x' })).status).toBe(413);
  });

  it('refuses a zip bomb: 207 KB that inflates to 200 MB, claiming 1 KB', async () => {
    const { fetch } = setup({ limits: { maxBytes: 1024 * 1024 } });
    const bomb = new File([readFileSync(new URL('fixtures/zip-bomb.xlsx', import.meta.url))], 'orders.xlsx');
    const before = process.memoryUsage().rss;
    const started = performance.now();
    const answer = await upload(fetch, bomb);
    expect(answer.status).toBe(422); // counted while inflating, whatever the archive claims
    expect(await answer.json()).toMatchObject({ errors: { file: ['The file cannot be read.'] } });
    expect(performance.now() - started).toBeLessThan(5_000);
    expect(process.memoryUsage().rss - before).toBeLessThan(150 * 1024 * 1024);
  });

  it('keeps imports per user and tenant; 401 without an owner, 403 when not authorized', async () => {
    const { fetch } = setup();
    const { id } = await (await upload(fetch, csv('Customer\nA\n'))).json() as { id: string };
    expect((await fetch(`${URL_BASE}/${id}`, { headers: as('u1') })).status).toBe(200);
    expect((await fetch(`${URL_BASE}/${id}`, { headers: as('u2') })).status).toBe(404);
    expect((await fetch(`${URL_BASE}/${id}`, { headers: as('u1', 't2') })).status).toBe(404);
    expect((await fetch(`${URL_BASE}/${id}`, { method: 'DELETE', headers: as('u2') })).status).toBe(404);
    expect((await fetch(URL_BASE, {})).status).toBe(401);
    expect((await fetch(URL_BASE, { headers: { ...as('u1'), 'X-Deny': '1' } })).status).toBe(403);
    expect((await fetch('http://app.test/api/other', { headers: as('u1') })).status).toBe(404);
  });

  it('runs on your queue when it says so, and stops between chunks when cancelled', async () => {
    const jobs: (() => Promise<void>)[] = [];
    const { fetch } = setup({ background: ({ rows }) => rows > 5, schedule: run => { jobs.push(run); } });
    const { id } = await (await upload(fetch, csv(`Customer\n${Array.from({ length: 9 }, (_, i) => `C${i}`).join('\n')}\n`))).json() as { id: string };
    expect(await (await start(fetch, id, { mapping: ['customer'], mode: 'insert' })).json()).toMatchObject({ status: 'queued', retryAfter: 1000, cancellable: true });
    expect(jobs).toHaveLength(1);
    expect(await (await fetch(`${URL_BASE}/${id}`, { method: 'DELETE', headers: as('u1') })).json()).toMatchObject({ status: 'cancelled' });
    await jobs[0]!();
    expect(await (await fetch(`${URL_BASE}/${id}`, { headers: as('u1') })).json()).toMatchObject({ status: 'cancelled', inserted: 0 });
    expect((await fetch(`${URL_BASE}/${id}`, { method: 'DELETE', headers: as('u1') })).status).toBe(409);
  });

  it('a save() that throws fails the import as a whole, with a general message', async () => {
    const onError = vi.fn();
    const { fetch } = setup({ save: () => { throw new Error('database is down: secret details'); }, onError });
    const { id } = await (await upload(fetch, csv('Customer\nA\n'))).json() as { id: string };
    const failed = await (await start(fetch, id, { mapping: ['customer'], mode: 'insert' })).json();
    expect(failed).toMatchObject({ status: 'failed', message: 'The import could not be completed.' });
    expect(JSON.stringify(failed)).not.toContain('secret');
    expect(onError).toHaveBeenCalledWith(expect.any(Error), id);
  });

  it('writes a formula-guarded error report', async () => {
    const { fetch } = setup();
    const { id } = await (await upload(fetch, csv('Customer,Total\nA,=1+2\n'))).json() as { id: string };
    await start(fetch, id, { mapping: ['customer', 'total'], mode: 'upsert' });
    expect(await (await fetch(`${URL_BASE}/${id}/errors.csv`, { headers: as('u1') })).text()).toBe("line,column,value,message\n2,Total,'=1+2,not a valid decimal value");
  });

  it('refuses wrong options early', () => {
    const base = { url: '/x', columns: [{ id: 'a' }], authorize: () => true, owner: () => 'u', save: () => undefined };
    expect(() => createImportHandler({ ...base, url: 'x' })).toThrow('url must be a path');
    expect(() => createImportHandler({ ...base, importKey: 'b' })).toThrow('importKey "b" is not a column');
    expect(() => createImportHandler({ ...base, modes: [] })).toThrow('modes must offer');
    expect(() => createImportHandler({ ...base, save: undefined as never })).toThrow('save must be a function');
    expect(memoryImportStore()).toBeDefined();
  });

  it('serves node:http (Express, Fastify) through toNodeListener', async () => {
    const { handler } = setup();
    const server = createServer(toNodeListener(handler.handle) as never);
    await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as { port: number };
    try {
      const result = await runImportConformance({
        url: `http://127.0.0.1:${port}/api/orders/import`, headers: as('http'), delay: instant,
        file: csv('Customer,Total\nA,1\n,2\n'),
      });
      expect(result.checks.filter(check => !check.ok)).toEqual([]);
    } finally {
      server.close();
    }
  });
});
