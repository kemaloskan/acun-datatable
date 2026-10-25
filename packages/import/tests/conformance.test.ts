import { describe, expect, it } from 'vitest';
import { runImportConformance } from '../src/testing';
import { backend, instant, orders, URL_BASE } from './fixtures';

const run = (fetch: typeof globalThis.fetch, rows = 3) => runImportConformance({
  url: URL_BASE, fetch, file: orders(rows, [1]), mapping: () => ['email', 'name', 'total', null], delay: instant,
});
const failed = (result: Awaited<ReturnType<typeof run>>) => result.checks.filter(check => !check.ok).map(check => check.name);

/** A back end that breaks one rule: the request is answered by `change`, else by the good one. */
const broken = (change: (request: Request, good: (request: Request) => Promise<Response>) => Promise<Response> | undefined): typeof fetch => {
  const server = backend();
  const handle = (request: Request) => change(request, server.handle) ?? server.handle(request);
  return ((input: RequestInfo | URL, init?: RequestInit) => handle(new Request(new URL(String(input)), init))) as typeof fetch;
};

describe('runImportConformance', () => {
  it('passes the in-memory back end, at once and in the background', async () => {
    for (const server of [backend(), backend({ backgroundFrom: 2, chunk: 1 })]) {
      const result = await run(server.fetch);
      expect(failed(result)).toEqual([]);
      expect(result.ok).toBe(true);
      expect(result.checks.find(check => check.name.startsWith('errorReport'))).toMatchObject({ ok: true, detail: '2 lines' });
    }
  });

  it('finds a back end that ignores the Idempotency-Key', async () => {
    const result = await run(broken((request, good) => {
      if (request.method !== 'POST' || !request.url.endsWith('/import')) return undefined;
      const headers = new Headers(request.headers);
      headers.delete('idempotency-key'); // as if the back end never read it
      return good(new Request(request, { headers }));
    }));
    expect(failed(result)).toContain('upload: the same Idempotency-Key gives the same import');
  });

  it('finds a back end that trusts the mapping from the browser', async () => {
    const server = backend();
    const result = await run(broken(async (request, good) => {
      if (!request.url.endsWith('/start')) return good(request);
      const id = new URL(request.url).pathname.split('/').at(-2)!;
      // Starts whatever it is sent: the wrong mappings are accepted.
      return good(new Request(request.url, { method: 'POST', headers: request.headers, body: JSON.stringify({ mapping: ['email', 'name', 'total', null], mode: 'upsert' }) }))
        .then(response => (response.status === 409 ? new Response(JSON.stringify({ id, status: 'done' }), { headers: { 'Content-Type': 'application/json' } }) : response));
    }));
    void server;
    expect(failed(result)).toEqual(expect.arrayContaining([
      'start: a mapping of the wrong length is refused (422)',
      'start: an unknown column is refused (422)',
      'start: a missing required column is refused (422)',
    ]));
  });

  it('finds an unsafe error report and an answer that breaks the protocol', async () => {
    const unsafe = await run(broken(async (request, good) => {
      const response = await good(request);
      if (request.method !== 'GET' || !/imp_[^/]+$/.test(request.url)) return response;
      const body = await response.json() as Record<string, unknown>;
      return new Response(JSON.stringify({ ...body, errorReport: body['errorReport'] ? 'javascript:alert(1)' : null }), { headers: { 'Content-Type': 'application/json' } });
    }), 60);
    expect(failed(unsafe)).toContain('errorReport: absent or a safe http(s) URL');

    const wrong = await run(broken(request => (request.method === 'POST' && request.url.endsWith('/import')
      ? Promise.resolve(new Response(JSON.stringify({ id: 'x', status: 'mapping' }), { status: 201, headers: { 'Content-Type': 'application/json' } }))
      : undefined)));
    expect(wrong.ok).toBe(false);
    expect(wrong.checks[1]).toMatchObject({ name: 'upload: answers an import that follows the protocol', ok: false });
    expect(wrong.checks[1]!.detail).toContain('protocol');
  });
});
