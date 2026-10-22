import { describe, expect, it, vi } from 'vitest';
import { createTableQuery } from '@acunsoft/datatable-core';
import {
  createHttpDataSource, createQueryRunner, formatLocalDate, fromLaravelPaginator, HttpError, serializeTableQuery,
} from '../src/index';

const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });
const okFetch = (body: unknown = { rows: [{ id: 1 }], totalRows: 1 }) =>
  vi.fn<typeof fetch>(async () => json(body));
const query = createTableQuery({ page: 2, pageSize: 25 });
const sized = (page: number, pageSize: number) => createTableQuery({ page, pageSize });

describe('serializeTableQuery', () => {
  it('encodes paging, sorting, indexed filters and search', () => {
    const params = serializeTableQuery(createTableQuery({
      page: 2, pageSize: 25,
      sorting: [{ field: 'total', direction: 'desc' }, { field: 'customer', direction: 'asc' }],
      filters: [
        { field: 'total', operator: 'gt', value: 100 },
        { field: 'total', operator: 'lt', value: 500 },
        { field: 'createdAt', operator: 'gt', value: new Date(2025, 0, 1) }, // a date picker's local midnight
        { field: 'active', operator: 'eq', value: true },
      ],
      globalSearch: ' Ayşe & co ',
    }));
    expect(Object.fromEntries(params)).toEqual({
      page: '2', pageSize: '25', sort: 'total:desc,customer:asc',
      'filters[0][field]': 'total', 'filters[0][op]': 'gt', 'filters[0][value]': '100',
      'filters[1][field]': 'total', 'filters[1][op]': 'lt', 'filters[1][value]': '500',
      'filters[2][field]': 'createdAt', 'filters[2][op]': 'gt', 'filters[2][value]': '2025-01-01',
      'filters[3][field]': 'active', 'filters[3][op]': 'eq', 'filters[3][value]': 'true',
      search: 'Ayşe & co',
    });
    expect(params.toString()).toContain('search=Ay%C5%9Fe+%26+co'); // encoded safely
  });

  it('omits empty sorting, filters and search', () => {
    expect(serializeTableQuery(query).toString()).toBe('page=2&pageSize=25');
  });

  it('refuses values it cannot represent', () => {
    // createTableQuery already rejects them; a hand-built query is caught by the serializer.
    expect(() => createTableQuery({ page: 2, pageSize: 25, filters: [{ field: 'x', operator: 'eq', value: {} }] }))
      .toThrow('eq value must be a string, number, boolean or valid Date');
    const handMade = { page: 1, pageSize: 10, sorting: [], filters: [{ field: 'x', operator: 'eq' as const, value: {} }] };
    expect(() => serializeTableQuery(handMade)).toThrow('filter "x" value cannot be sent');
  });

  it('sends dates in local time so the calendar day never shifts', () => {
    expect(formatLocalDate(new Date(2026, 9, 23))).toBe('2026-10-23');
    const withTime = new Date(2026, 9, 23, 14, 5, 9, 7);
    const sent = formatLocalDate(withTime);
    expect(sent).toMatch(/^2026-10-23T14:05:09\.007[+-]\d{2}:\d{2}$/);
    expect(new Date(sent).getTime()).toBe(withTime.getTime()); // same instant
  });

  it('leaves out empty contains filters, which Laravel would reject with 422', () => {
    const params = serializeTableQuery(createTableQuery({
      page: 1, pageSize: 10, filters: [{ field: 'name', operator: 'contains', value: '  ' }], globalSearch: '  ',
    }));
    expect(params.toString()).toBe('page=1&pageSize=10');
  });
});

describe('createHttpDataSource', () => {
  it('sends a GET with the query, Accept header and abort signal', async () => {
    const fetch = okFetch();
    const controller = new AbortController();
    const source = createHttpDataSource({ url: '/api/orders', fetch });
    const result = await source.getPage(query, { signal: controller.signal });
    expect(result).toEqual({ rows: [{ id: 1 }], totalRows: 1 });
    const [target, init] = fetch.mock.calls[0]!;
    expect(target).toBe('/api/orders?page=2&pageSize=25');
    expect(init).toMatchObject({ method: 'GET', signal: controller.signal });
    expect(new Headers(init!.headers).get('accept')).toBe('application/json');
  });

  it('appends to an existing query string and accepts URL objects', async () => {
    const fetch = okFetch();
    await createHttpDataSource({ url: '/api/orders?tenant=7', fetch }).getPage(query);
    await createHttpDataSource({ url: new URL('https://example.test/api'), fetch }).getPage(query);
    expect(fetch.mock.calls.map(([target]) => target)).toEqual([
      '/api/orders?tenant=7&page=2&pageSize=25',
      'https://example.test/api?page=2&pageSize=25',
    ]);
  });

  it('adds static or per-request headers, e.g. a fresh token', async () => {
    const fetch = okFetch();
    const token = vi.fn(async () => ({ Authorization: 'Bearer t1' }));
    await createHttpDataSource({ url: '/a', fetch, headers: { 'X-Tenant': '7' } }).getPage(query);
    await createHttpDataSource({ url: '/a', fetch, headers: token, credentials: 'include' }).getPage(query);
    expect(new Headers(fetch.mock.calls[0]![1]!.headers).get('x-tenant')).toBe('7');
    expect(new Headers(fetch.mock.calls[1]![1]!.headers).get('authorization')).toBe('Bearer t1');
    expect(fetch.mock.calls[1]![1]).toMatchObject({ credentials: 'include' });
    expect(token).toHaveBeenCalledWith(expect.objectContaining({ page: 2 }));
  });

  it('enforces maxPageSize before sending', async () => {
    const fetch = okFetch();
    const source = createHttpDataSource({ url: '/a', fetch, maxPageSize: 50 });
    await expect(source.getPage(sized(1, 51))).rejects.toThrow('pageSize 51 exceeds maxPageSize 50');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('rejects HTTP errors, invalid JSON and malformed bodies', async () => {
    const status = createHttpDataSource({ url: '/a', fetch: async () => new Response('no', { status: 403, statusText: 'Forbidden' }) });
    const error = await status.getPage(query).catch(e => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error).toMatchObject({ status: 403, statusText: 'Forbidden', message: 'request failed with HTTP 403 Forbidden' });

    const text = createHttpDataSource({ url: '/a', fetch: async () => new Response('<html>') });
    await expect(text.getPage(query)).rejects.toThrow('response body is not valid JSON');

    const shape = createHttpDataSource({ url: '/a', fetch: okFetch({ data: [] }) });
    await expect(shape.getPage(query)).rejects.toThrow('rows must be an array');

    const tooMany = createHttpDataSource({ url: '/a', fetch: okFetch({ rows: [{}, {}, {}] }) });
    await expect(tooMany.getPage(sized(1, 2))).rejects.toThrow('more than the requested page size');
  });

  it('maps a Laravel paginator response', async () => {
    const body = { data: [{ id: 1 }, { id: 2 }], total: 42, per_page: 2, current_page: 1 };
    const source = createHttpDataSource({ url: '/a', fetch: okFetch(body), parseResponse: fromLaravelPaginator });
    expect(await source.getPage(sized(1, 2))).toEqual({ rows: [{ id: 1 }, { id: 2 }], totalRows: 42 });
    expect(fromLaravelPaginator({ data: [] })).toEqual({ rows: [] });
    expect(fromLaravelPaginator(null)).toBe(null);
  });

  it('uses a custom serializer', async () => {
    const fetch = okFetch();
    await createHttpDataSource({
      url: '/a', fetch, serializeQuery: q => new URLSearchParams({ offset: String((q.page - 1) * q.pageSize), limit: String(q.pageSize) }),
    }).getPage(query);
    expect(fetch.mock.calls[0]![0]).toBe('/a?offset=25&limit=25');
  });

  it('rejects invalid options', () => {
    expect(() => createHttpDataSource(null as never)).toThrow('options must be an object');
    expect(() => createHttpDataSource({ url: '' })).toThrow('url must be a non-empty');
    expect(() => createHttpDataSource({ url: '/a', fetch: 'x' as never })).toThrow('fetch is not available');
    expect(() => createHttpDataSource({ url: '/a', fetch: okFetch(), maxPageSize: 0 })).toThrow('maxPageSize must be');
    expect(() => createHttpDataSource({ url: '/a', fetch: okFetch(), maxPageSize: 1001 })).toThrow('maxPageSize must be');
  });

  it('works end to end with the runner, aborting superseded requests', async () => {
    const signals: AbortSignal[] = [];
    const fetchMock = vi.fn<typeof globalThis.fetch>((_, init) => new Promise((resolve, reject) => {
      const signal = init!.signal!;
      signals.push(signal);
      signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
      setTimeout(() => resolve(json({ rows: [{ id: signals.length }], totalRows: 2 })), 5);
    }));
    const runner = createQueryRunner(createHttpDataSource({ url: '/a', fetch: fetchMock }));
    const first = runner.run({ page: 1, pageSize: 10 });
    const second = runner.run({ page: 2, pageSize: 10 });
    await Promise.all([first, second]);
    expect(signals[0]!.aborted).toBe(true);
    expect(runner.getState()).toMatchObject({ status: 'success', query: { page: 2 }, result: { rows: [{ id: 2 }] } });
  });
});
