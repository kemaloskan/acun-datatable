import { FILTER_OPERATORS, MAX_IN_VALUES, splitSearchTerms, type FilterOperator, type SortRule } from '@acunsoft/datatable-core';
import type { ServerColumn } from './columns';

/** A request that does not fit the endpoint: answer 422 (or DataTables' `error`) with `message`. */
export class TableQueryError extends Error {
  constructor(public readonly field: string, message: string) {
    super(message);
    this.name = 'TableQueryError';
  }
}

/** A filter checked against its column, with a value of the column's type. */
export interface ServerFilter {
  readonly column: ServerColumn;
  readonly operator: FilterOperator;
  /** number, decimal text (`"12.50"`), `YYYY-MM-DD`, `Date`, boolean, text, or a list for `between` / `in`. */
  readonly value?: unknown;
}

/** The checked query of one request. */
export interface ServerTableQuery {
  readonly page: number;
  readonly pageSize: number;
  readonly sorting: readonly { readonly column: ServerColumn; readonly direction: SortRule['direction'] }[];
  readonly filters: readonly ServerFilter[];
  readonly search: string;
  /** The search split into words (`"quoted phrases"` stay together), at most 10. */
  readonly terms: readonly string[];
  /** Keyset paging asked for (`paging=cursor`). */
  readonly cursorPaging: boolean;
  /** The previous page's `nextCursor`. */
  readonly cursor: string | undefined;
  /** DataTables' request counter when the request used its protocol. */
  readonly draw: number | undefined;
}

export interface ReadTableQueryOptions {
  /** Largest page size accepted. Default 100, at most 1000. */
  readonly maxPageSize?: number;
  /** Page size when the request has none. Default 25. */
  readonly defaultPageSize?: number;
}

const MAX_PAGE = 1_000_000;
const MAX_TEXT = 200;
const MAX_FILTERS = 20;
const MAX_SORT = 5;
const MAX_TERMS = 10;

type Input = URLSearchParams | FormData | Readonly<Record<string, unknown>>;

/**
 * Read a table query from a request — `URLSearchParams` (GET), `FormData`
 * (POST form) or a parsed JSON body — in this package's format (`page`,
 * `pageSize`, `sort`, `filters[i][field|op|value]`, `search`, `paging`,
 * `cursor`) or DataTables' protocol (`draw`, `start`, `length`, `order`,
 * `columns`, `search[value]`). Everything is checked against `columns`: only
 * listed IDs may be sorted, filtered or searched, values must fit their type,
 * and sizes are limited. Throws `TableQueryError`.
 */
export function readTableQuery(input: Input, columns: readonly ServerColumn[], options: ReadTableQueryOptions = {}): ServerTableQuery {
  const maxPageSize = options.maxPageSize ?? 100;
  const defaultPageSize = Math.min(options.defaultPageSize ?? 25, maxPageSize);
  if (!Number.isInteger(maxPageSize) || maxPageSize < 1 || maxPageSize > 1000) throw new RangeError('maxPageSize must be from 1 to 1000');
  const raw = toObject(input);
  const byId = new Map(columns.map(column => [column.id, column]));
  return raw['draw'] !== undefined ? fromDataTables(raw, byId, maxPageSize, defaultPageSize) : fromTable(raw, byId, maxPageSize, defaultPageSize);
}

function fromTable(raw: Record<string, unknown>, byId: Map<string, ServerColumn>, maxPageSize: number, defaultPageSize: number): ServerTableQuery {
  const page = integer(raw['page'] ?? 1, 'page', 1, MAX_PAGE);
  const pageSize = integer(raw['pageSize'] ?? defaultPageSize, 'pageSize', 1, maxPageSize);
  const search = text(raw['search'] ?? '', 'search');
  const cursor = raw['cursor'] === undefined || raw['cursor'] === '' ? undefined : text(raw['cursor'], 'cursor', 4096);
  if (cursor !== undefined && !/^[A-Za-z0-9_-]+$/.test(cursor)) throw new TableQueryError('cursor', 'cursor must be the nextCursor of a previous page');
  return Object.freeze({
    page, pageSize,
    sorting: sorting(raw['sort'] ?? '', byId),
    filters: filters(raw['filters'], byId),
    search, terms: Object.freeze(splitSearchTerms(search).slice(0, MAX_TERMS)),
    cursorPaging: raw['paging'] === 'cursor' || cursor !== undefined,
    cursor,
    draw: undefined,
  });
}

function fromDataTables(raw: Record<string, unknown>, byId: Map<string, ServerColumn>, maxPageSize: number, defaultPageSize: number): ServerTableQuery {
  const listed = list(raw['columns']).map((column, index) => {
    const entry = column as Record<string, unknown> | undefined;
    const id = entry?.['data'] ?? entry?.['name'];
    if (typeof id !== 'string') throw new TableQueryError(`columns.${index}.data`, 'columns[].data must be a column ID');
    const search = (entry?.['search'] as Record<string, unknown> | undefined)?.['value'];
    return { id, search: typeof search === 'string' ? search : '' };
  });
  const lengthRaw = raw['length'] ?? defaultPageSize;
  const length = lengthRaw === '-1' || lengthRaw === -1 ? -1 : integer(lengthRaw, 'length', 1, 1_000_000);
  const pageSize = length === -1 ? maxPageSize : Math.min(length, maxPageSize);
  const start = integer(raw['start'] ?? 0, 'start', 0, MAX_PAGE * maxPageSize);
  const sort = list(raw['order']).map((rule, index) => {
    const entry = rule as Record<string, unknown> | undefined;
    const position = Number(entry?.['column']);
    const column = Number.isInteger(position) ? listed[position] : undefined;
    if (!column) throw new TableQueryError(`order.${index}.column`, 'order[].column must be the index of a column');
    return `${column.id}:${entry?.['dir'] === 'desc' ? 'desc' : 'asc'}`;
  });
  const extra = list(raw['filters']);
  for (const column of listed) {
    if (column.search.trim() !== '') extra.push({ field: column.id, op: 'contains', value: column.search });
  }
  const searchRaw = raw['search'];
  const search = text(typeof searchRaw === 'object' && searchRaw !== null ? (searchRaw as Record<string, unknown>)['value'] ?? '' : searchRaw ?? '', 'search');
  return Object.freeze({
    page: Math.floor(start / pageSize) + 1,
    pageSize,
    sorting: sorting([...new Set(sort)].join(','), byId),
    filters: filters(extra, byId),
    search, terms: Object.freeze(splitSearchTerms(search).slice(0, MAX_TERMS)),
    cursorPaging: false,
    cursor: undefined,
    draw: integer(raw['draw'], 'draw', 0, 999_999_999),
  });
}

function sorting(value: unknown, byId: Map<string, ServerColumn>): ServerTableQuery['sorting'] {
  const textValue = text(value, 'sort', 500);
  if (textValue === '') return Object.freeze([]);
  const seen = new Set<string>();
  const rules = textValue.split(',').map(part => {
    const match = /^([A-Za-z][A-Za-z0-9_.-]{0,63}):(asc|desc)$/.exec(part);
    if (!match) throw new TableQueryError('sort', `sort rule "${part}" must be field:asc or field:desc`);
    const column = byId.get(match[1]!);
    if (!column) throw new TableQueryError('sort', `unknown column "${match[1]}"`);
    if (!column.sortable) throw new TableQueryError('sort', `column "${column.id}" cannot be sorted`);
    if (seen.has(column.id)) throw new TableQueryError('sort', `column "${column.id}" is sorted twice`);
    seen.add(column.id);
    return Object.freeze({ column, direction: match[2] as SortRule['direction'] });
  });
  if (rules.length > MAX_SORT) throw new TableQueryError('sort', `at most ${MAX_SORT} sort rules`);
  return Object.freeze(rules);
}

function filters(value: unknown, byId: Map<string, ServerColumn>): readonly ServerFilter[] {
  const rules = list(value);
  if (rules.length > MAX_FILTERS) throw new TableQueryError('filters', `at most ${MAX_FILTERS} filters`);
  const out: ServerFilter[] = [];
  rules.forEach((rule, index) => {
    const entry = rule as Record<string, unknown> | undefined;
    const at = `filters.${index}`;
    const column = byId.get(String(entry?.['field'] ?? ''));
    if (!column) throw new TableQueryError(`${at}.field`, `unknown column "${String(entry?.['field'])}"`);
    if (!column.filterable) throw new TableQueryError(`${at}.field`, `column "${column.id}" cannot be filtered`);
    const operator = String(entry?.['op'] ?? entry?.['operator'] ?? '') as FilterOperator;
    if (!FILTER_OPERATORS.includes(operator)) throw new TableQueryError(`${at}.op`, `unknown operator "${operator}"`);
    const raw = entry?.['value'];
    if (operator === 'empty' || operator === 'notEmpty') {
      out.push(Object.freeze({ column, operator }));
      return;
    }
    if (operator === 'between' || operator === 'in') {
      const values = list(raw);
      if (operator === 'between' && values.length !== 2) throw new TableQueryError(`${at}.value`, 'between needs two values');
      if (operator === 'in' && (values.length === 0 || values.length > MAX_IN_VALUES)) throw new TableQueryError(`${at}.value`, `in needs 1 to ${MAX_IN_VALUES} values`);
      out.push(Object.freeze({ column, operator, value: Object.freeze(values.map(item => typed(column, item, `${at}.value`))) }));
      return;
    }
    if (operator === 'contains' || operator === 'startsWith') {
      const term = text(raw, `${at}.value`);
      if (term.trim() === '') return; // constrains nothing, as in the browser
      out.push(Object.freeze({ column, operator, value: term }));
      return;
    }
    out.push(Object.freeze({ column, operator, value: typed(column, raw, `${at}.value`) }));
  });
  return Object.freeze(out);
}

/** A filter value as the column's type. */
function typed(column: ServerColumn, raw: unknown, field: string): unknown {
  const value = typeof raw === 'string' ? raw.trim() : raw;
  const fail = (): never => { throw new TableQueryError(field, `"${String(raw)}" is not a valid ${column.type} for "${column.id}"`); };
  switch (column.type) {
    case 'number': {
      const number = typeof value === 'number' ? value : typeof value === 'string' && /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(value) ? Number(value) : NaN;
      return Number.isFinite(number) ? number : fail();
    }
    case 'decimal': {
      const decimal = typeof value === 'number' && Number.isFinite(value) ? String(value) : value;
      return typeof decimal === 'string' && /^[+-]?\d{1,30}(\.\d{1,30})?$/.test(decimal) ? decimal : fail();
    }
    case 'date':
      return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value.slice(0, 10))) ? value.slice(0, 10) : fail();
    case 'datetime': {
      if (typeof value !== 'string' || value.length > 40) return fail();
      const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00`) : new Date(value);
      return Number.isNaN(date.getTime()) ? fail() : date;
    }
    case 'boolean':
      if (value === true || value === 'true' || value === '1' || value === 1) return true;
      if (value === false || value === 'false' || value === '0' || value === 0) return false;
      return fail();
    default:
      return text(value, field);
  }
}

function integer(value: unknown, field: string, min: number, max: number): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' && /^\d{1,12}$/.test(value) ? Number(value) : NaN;
  if (!Number.isSafeInteger(number) || number < min || number > max) throw new TableQueryError(field, `${field} must be a whole number from ${min} to ${max}`);
  return number;
}

function text(value: unknown, field: string, max = MAX_TEXT): string {
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value !== 'string' || value.length > max) throw new TableQueryError(field, `${field} must be text of at most ${max} characters`);
  return value;
}

/** An array, or the values of an object with numeric keys (`filters[0]…` parsed from a query string). */
function list(value: unknown): unknown[] {
  if (value === undefined || value === null || value === '') return [];
  if (Array.isArray(value)) return [...value];
  if (typeof value === 'object') return Object.keys(value).filter(key => /^\d+$/.test(key)).sort((a, b) => Number(a) - Number(b)).map(key => (value as Record<string, unknown>)[key]);
  return [value];
}

/** URLSearchParams / FormData with `a[b][0]` keys as nested objects; plain objects as they are. */
function toObject(input: Input): Record<string, unknown> {
  if (typeof (input as URLSearchParams).entries !== 'function' || typeof (input as URLSearchParams).getAll !== 'function') {
    if (!input || typeof input !== 'object') throw new TableQueryError('query', 'the query must be an object');
    return { ...(input as Record<string, unknown>) };
  }
  const out: Record<string, unknown> = {};
  let count = 0;
  for (const [key, value] of (input as URLSearchParams).entries()) {
    if (++count > 2000) throw new TableQueryError('query', 'too many parameters');
    if (typeof value !== 'string') continue; // files in a form are not part of a query
    const path = /^([^[\]]+)((?:\[[^[\]]*\])*)$/.exec(key);
    if (!path) continue;
    const parts = [path[1]!, ...[...path[2]!.matchAll(/\[([^[\]]*)\]/g)].map(match => match[1]!)];
    if (parts.length > 6 || parts.some(part => part === '__proto__' || part === 'constructor' || part === 'prototype')) continue;
    let node = out;
    parts.forEach((part, index) => {
      if (index === parts.length - 1) {
        node[part] = value;
        return;
      }
      const next = node[part];
      node[part] = next && typeof next === 'object' ? next : {};
      node = node[part] as Record<string, unknown>;
    });
  }
  return out;
}
