import type { FilterRule } from './filtering';
import { createPagination, createTableState, type SortRule } from './index';

/** Query a remote data source answers. Pages are 1-based. */
export interface TableQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sorting: readonly Readonly<SortRule>[];
  readonly filters: readonly Readonly<FilterRule>[];
  /** Omitted when there is no search text. */
  readonly globalSearch?: string;
}

/** One page of records returned by a data source. */
export interface PageResult<TData> {
  readonly rows: readonly TData[];
  /** Total matching records; omitted when the server does not know it. */
  readonly totalRows?: number;
  /** Reserved for cursor pagination (future). */
  readonly nextCursor?: string;
}

/**
 * Structural subset of `AbortSignal`. Core stays free of DOM types; transports
 * pass a real `AbortSignal`.
 */
export interface AbortSignalLike {
  readonly aborted: boolean;
}

export interface DataSourceRequestOptions {
  readonly signal?: AbortSignalLike;
}

/**
 * Read-only source of pages. `getPage` must not have side effects on the
 * server, so retrying a request can never duplicate a write.
 */
export interface DataSource<TData> {
  getPage(query: TableQuery, options?: DataSourceRequestOptions): Promise<PageResult<TData>>;
}

export interface TableQueryInput {
  readonly page: number;
  readonly pageSize: number;
  readonly sorting?: readonly SortRule[];
  readonly filters?: readonly FilterRule[];
  readonly globalSearch?: string;
}

/**
 * Build a frozen, validated `TableQuery`, e.g. from `createDataTable().getState()`.
 * Search text is trimmed and omitted when empty. Filter values are passed through
 * unchanged; the server must validate them against its own allowlist.
 */
export function createTableQuery(input: TableQueryInput): TableQuery {
  if (!input || typeof input !== 'object') throw new TypeError('query input must be an object');
  const { page, pageSize } = createPagination(input.page, input.pageSize);
  const sorting = createTableState({ sorting: input.sorting ?? [] }).getState().sorting;
  const filters = input.filters ?? [];
  if (!Array.isArray(filters)) throw new TypeError('filters must be an array');
  const copied = Object.freeze(filters.map((rule, index) => {
    if (!rule || typeof rule.field !== 'string' || rule.field.trim().length === 0 || typeof rule.operator !== 'string') {
      throw new TypeError(`filters[${index}] must have a non-empty field and an operator`);
    }
    return Object.freeze({ field: rule.field, operator: rule.operator, value: rule.value });
  }));
  const search = input.globalSearch ?? '';
  if (typeof search !== 'string') throw new TypeError('globalSearch must be a string');
  const trimmed = search.trim();
  return Object.freeze({
    page, pageSize, sorting, filters: copied,
    ...(trimmed === '' ? {} : { globalSearch: trimmed }),
  });
}

export interface PageResultValidation {
  /** Requested page size; a response with more rows is rejected. */
  readonly pageSize?: number;
}

/**
 * Check an untrusted response against the `PageResult` contract and return a
 * frozen copy with only the known fields. Row values are not inspected beyond
 * being objects: treat them as untrusted and render them as text.
 */
export function validatePageResult(value: unknown, options: PageResultValidation = {}): PageResult<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError('page result must be an object');
  }
  const { rows, totalRows, nextCursor } = value as { rows?: unknown; totalRows?: unknown; nextCursor?: unknown };
  if (!Array.isArray(rows)) throw new TypeError('page result rows must be an array');
  rows.forEach((row, index) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new TypeError(`page result rows[${index}] must be an object`);
    }
  });
  if (options.pageSize !== undefined && rows.length > options.pageSize) {
    throw new RangeError(`page result has ${rows.length} rows, more than the requested page size ${options.pageSize}`);
  }
  if (totalRows !== undefined) {
    if (typeof totalRows !== 'number' || !Number.isSafeInteger(totalRows) || totalRows < 0) {
      throw new TypeError('page result totalRows must be a non-negative safe integer');
    }
    if (totalRows < rows.length) throw new RangeError('page result totalRows is smaller than the number of rows');
  }
  if (nextCursor !== undefined && (typeof nextCursor !== 'string' || nextCursor.length === 0)) {
    throw new TypeError('page result nextCursor must be a non-empty string');
  }
  return Object.freeze({
    rows: Object.freeze([...rows]) as readonly Record<string, unknown>[],
    ...(totalRows !== undefined ? { totalRows } : {}),
    ...(nextCursor !== undefined ? { nextCursor } : {}),
  });
}
