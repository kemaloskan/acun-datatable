import { describe, expect, it } from 'vitest';
import { createImportClient, ImportRequestError, nextPoll } from '../src/index';
import { backend, csv, instant, orders, URL_BASE, xlsxFile } from './fixtures';

const client = (server = backend(), user = 'ayse') => createImportClient({
  url: URL_BASE, fetch: server.fetch, headers: { 'X-User': user }, delay: instant,
});

describe('the import client against the in-memory back end', () => {
  it('uploads, shows the mapping and preview, starts at once and reports', async () => {
    const server = backend();
    const imports = client(server);
    expect(await imports.capabilities()).toMatchObject({ maxBytes: 1024 * 1024, accept: ['.csv', '.xlsx'] });
    const uploaded = await imports.upload(orders(3));
    expect(uploaded).toMatchObject({
      status: 'mapping', headers: ['E-posta', 'Ad', 'Tutar', 'Not'], mapping: [null, null, null, null], file: { name: 'orders.csv', rows: 3 },
    });
    expect(uploaded.preview?.[0]).toEqual({ line: 2, cells: ['user0@example.com', 'User 0', '0.50', null] });
    const done = await imports.start(uploaded.id, { mapping: ['email', 'name', 'total', null], mode: 'upsert' });
    expect(done).toMatchObject({ status: 'done', inserted: 3, updated: 0, failed: 0, errorReport: null });
    expect(server.records.size).toBe(3);
  });

  it('suggests a mapping from the headers (case, accents and Turkish i ignored)', async () => {
    const uploaded = await client().upload(xlsxFile());
    expect(uploaded.mapping).toEqual(['email', 'name', 'total']);
  });

  it('follows a background import to its end; upsert updates on the key', async () => {
    const server = backend({ backgroundFrom: 20, chunk: 7 });
    const imports = client(server);
    const first = await imports.upload(orders(30, [1000 + 5]));
    const queued = await imports.start(first.id, { mapping: ['email', 'name', 'total', null], mode: 'upsert' });
    expect(queued.status).toBe('queued');
    const seen: number[] = [];
    const done = await imports.wait(first.id, { onState: state => seen.push(state.processed ?? 0) });
    expect(done).toMatchObject({ status: 'done', inserted: 29, failed: 1, total: 30, processed: 30 });
    expect(done.errors[0]).toMatchObject({ line: 7, column: 'total', code: 'invalid' });
    expect(seen.length).toBeGreaterThan(1);
    expect(imports.resolve(done.errorReport!)).toBe(`http://test.local/api/orders/import/${first.id}/errors.csv`);

    const again = await imports.upload(orders(25));
    await imports.start(again.id, { mapping: ['email', 'name', 'total', null], mode: 'upsert' });
    expect(await imports.wait(again.id)).toMatchObject({ inserted: 1, updated: 24 }); // user5 was refused the first time
  });

  it('turns refusals into ImportRequestError with the back end message', async () => {
    const imports = client(backend({ limits: { maxBytes: 10 } }));
    const error = await imports.upload(orders(3)).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ImportRequestError);
    expect(error).toMatchObject({ status: 413, problem: { errors: { file: ['The file is larger than 10 bytes.'] } } });
    await expect(client(backend({ limits: { accept: ['.xlsx'] } })).upload(orders(1))).rejects.toMatchObject({ status: 415 });
    await expect(client().upload(csv([''], 'empty.csv'))).rejects.toMatchObject({ status: 422 });
  });

  it('keeps imports per user and cancels', async () => {
    const server = backend();
    const uploaded = await client(server, 'ayse').upload(orders(2));
    await expect(client(server, 'ali').state(uploaded.id)).rejects.toMatchObject({ status: 404 }); // another user's import
    expect(await client(server, 'ayse').cancel(uploaded.id)).toMatchObject({ status: 'cancelled', cancellable: false });
    await expect(client(server, 'ayse').cancel(uploaded.id)).rejects.toMatchObject({ status: 409 });
  });

  it('waits as the back end asks: retryAfter within 250 ms – 60 s, else 1 s then 5 s', () => {
    expect(nextPoll({ retryAfter: 10 }, 0)).toBe(250);
    expect(nextPoll({ retryAfter: 120_000 }, 0)).toBe(60_000);
    expect(nextPoll({}, 1_000)).toBe(1_000);
    expect(nextPoll({}, 61_000)).toBe(5_000);
  });

  it('downloads the error report with the client headers (a bearer token), only over http(s)', async () => {
    const server = backend();
    const seen: Headers[] = [];
    const imports = createImportClient({
      url: URL_BASE, headers: { 'X-User': 'ayse', Authorization: 'Bearer t0k3n' }, delay: instant,
      fetch: (input, init) => { seen.push(new Headers(init?.headers)); return server.fetch(input, init); },
    });
    const uploaded = await imports.upload(orders(2, [0]));
    const done = await imports.start(uploaded.id, { mapping: ['email', 'name', 'total', null], mode: 'upsert' });
    const report = await imports.file(done.errorReport!);
    expect(await report.text()).toContain('line,column,value,message');
    expect(seen.at(-1)!.get('authorization')).toBe('Bearer t0k3n');
    await expect(imports.file('javascript:alert(1)')).rejects.toThrow('Not an http(s) URL.');
  });

  it('sends the configured headers and an Idempotency-Key', async () => {
    const seen: Headers[] = [];
    const server = backend();
    const imports = createImportClient({
      url: URL_BASE, headers: async () => ({ 'X-CSRF-Token': 'abc' }), delay: instant,
      fetch: (input, init) => { seen.push(new Headers(init?.headers)); return server.fetch(input, init); },
    });
    await imports.upload(orders(1), { idempotencyKey: 'key-1' });
    expect(seen[0]!.get('x-csrf-token')).toBe('abc');
    expect(seen[0]!.get('idempotency-key')).toBe('key-1');
    expect(() => createImportClient({ url: ' ' })).toThrow('createImportClient needs a url');
  });
});
