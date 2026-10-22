import {
  createTableQuery, validatePageResult,
  type DataSource, type PageResult, type TableQuery,
} from '@acunsoft/datatable-core';

/** Thrown for a non-2xx HTTP response. */
export class HttpError extends Error {
  readonly status: number;
  readonly statusText: string;
  constructor(status: number, statusText: string) {
    super(`request failed with HTTP ${status}${statusText ? ` ${statusText}` : ''}`);
    this.name = 'HttpError';
    this.status = status;
    this.statusText = statusText;
  }
}

export interface HttpDataSourceOptions {
  /** Endpoint URL, absolute or relative. Query parameters are appended. */
  readonly url: string | URL;
  /** Defaults to `globalThis.fetch`; inject one for tests or custom transports. */
  readonly fetch?: typeof fetch;
  /** Static headers, or a function (may be async) e.g. to attach a fresh auth token. */
  readonly headers?: HeadersInit | ((query: TableQuery) => HeadersInit | Promise<HeadersInit>);
  /** Defaults to `serializeTableQuery`. */
  readonly serializeQuery?: (query: TableQuery) => URLSearchParams;
  /** Map the server's JSON to `{ rows, totalRows?, nextCursor? }`, e.g. `fromLaravelPaginator`. */
  readonly parseResponse?: (body: unknown, query: TableQuery) => unknown;
  /** Largest page size this client will request. Default 100, at most 1000. */
  readonly maxPageSize?: number;
  readonly credentials?: RequestCredentials;
}

function encodeValue(value: unknown, field: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  throw new TypeError(`filter "${field}" value cannot be sent as a query parameter`);
}

/**
 * Default wire format, readable by PHP/Laravel and Node `qs` as nested arrays:
 * `page=2&pageSize=25&sort=total:desc,customer:asc`
 * `&filters[0][field]=total&filters[0][op]=gt&filters[0][value]=100&search=ayşe`.
 * Dates are sent as ISO 8601 strings. The server must re-validate everything.
 */
export function serializeTableQuery(query: TableQuery): URLSearchParams {
  const params = new URLSearchParams();
  params.set('page', String(query.page));
  params.set('pageSize', String(query.pageSize));
  if (query.sorting.length > 0) {
    params.set('sort', query.sorting.map(rule => `${rule.field}:${rule.direction}`).join(','));
  }
  query.filters.forEach((rule, index) => {
    params.set(`filters[${index}][field]`, rule.field);
    params.set(`filters[${index}][op]`, rule.operator);
    params.set(`filters[${index}][value]`, encodeValue(rule.value, rule.field));
  });
  if (query.globalSearch !== undefined) params.set('search', query.globalSearch);
  return params;
}

/** Parser for Laravel's `paginate()` JSON (`{ data, total, ... }`). */
export function fromLaravelPaginator(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const { data, total } = body as { data?: unknown; total?: unknown };
  return total === undefined ? { rows: data } : { rows: data, totalRows: total };
}

/**
 * A read-only `DataSource` over HTTP GET. Each request sends the validated
 * query, honours the abort signal, rejects non-2xx responses with `HttpError`
 * and validates the body against the `PageResult` contract.
 */
export function createHttpDataSource<TData = Record<string, unknown>>(options: HttpDataSourceOptions): DataSource<TData> {
  if (!options || typeof options !== 'object') throw new TypeError('options must be an object');
  const url = String(options.url ?? '');
  if (url.length === 0) throw new TypeError('url must be a non-empty string or URL');
  const fetchImpl = options.fetch ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch is not available; pass options.fetch');
  const maxPageSize = options.maxPageSize ?? 100;
  if (!Number.isSafeInteger(maxPageSize) || maxPageSize < 1 || maxPageSize > 1000) {
    throw new RangeError('maxPageSize must be an integer from 1 to 1000');
  }
  const serialize = options.serializeQuery ?? serializeTableQuery;

  return {
    async getPage(input, requestOptions = {}) {
      const query = createTableQuery(input);
      if (query.pageSize > maxPageSize) {
        throw new RangeError(`pageSize ${query.pageSize} exceeds maxPageSize ${maxPageSize}`);
      }
      const params = serialize(query).toString();
      const target = params ? `${url}${url.includes('?') ? '&' : '?'}${params}` : url;

      const headers = new Headers({ Accept: 'application/json' });
      const extra = typeof options.headers === 'function' ? await options.headers(query) : options.headers;
      if (extra !== undefined) new Headers(extra).forEach((value, key) => headers.set(key, value));

      const response = await fetchImpl(target, {
        method: 'GET',
        headers,
        ...(requestOptions.signal !== undefined ? { signal: requestOptions.signal as AbortSignal } : {}),
        ...(options.credentials !== undefined ? { credentials: options.credentials } : {}),
      });
      if (!response.ok) throw new HttpError(response.status, response.statusText);
      let body: unknown;
      try {
        body = await response.json();
      } catch (cause) {
        throw new TypeError('response body is not valid JSON', { cause });
      }
      const parsed = options.parseResponse ? options.parseResponse(body, query) : body;
      return validatePageResult(parsed, { pageSize: query.pageSize }) as PageResult<TData>;
    },
  };
}
