import { formatLocalDate, type TableQuery } from '@acunsoft/datatable-core';

export interface DataTablesColumn {
  /** The field (DataTables `columns[i].data`). */
  readonly data: string;
  readonly searchable?: boolean;
  readonly orderable?: boolean;
}

/**
 * The query in DataTables' server-side protocol, for existing DataTables
 * back ends (yajra/laravel-datatables, DataTables' PHP SSP class, …):
 * `draw`, `start`, `length`, `search[value]`, `order[i][column|dir]` and
 * `columns[i][data|name|searchable|orderable|search][value]`. A `contains` or
 * `eq` filter goes into its column's `search[value]`, the closest DataTables
 * has; every filter is also sent in this package's `filters[i]` format for
 * servers that read it. `draw` counts the requests.
 */
export function serializeDataTablesQuery(query: TableQuery, columns: readonly DataTablesColumn[], draw: number): URLSearchParams {
  const params = new URLSearchParams();
  params.set('draw', String(draw));
  params.set('start', String((query.page - 1) * query.pageSize));
  params.set('length', String(query.pageSize));
  params.set('search[value]', query.globalSearch ?? '');
  params.set('search[regex]', 'false');
  const index = new Map(columns.map((column, position) => [column.data, position]));
  columns.forEach((column, position) => {
    const filter = query.filters.find(rule => rule.field === column.data && (rule.operator === 'contains' || rule.operator === 'eq'));
    params.set(`columns[${position}][data]`, column.data);
    params.set(`columns[${position}][name]`, column.data);
    params.set(`columns[${position}][searchable]`, String(column.searchable !== false));
    params.set(`columns[${position}][orderable]`, String(column.orderable !== false));
    params.set(`columns[${position}][search][value]`, filter && typeof filter.value !== 'object' ? String(filter.value) : '');
    params.set(`columns[${position}][search][regex]`, 'false');
  });
  query.sorting.forEach((rule, position) => {
    const column = index.get(rule.field);
    if (column === undefined) throw new Error(`sort field "${rule.field}" is not one of the DataTables columns`);
    params.set(`order[${position}][column]`, String(column));
    params.set(`order[${position}][dir]`, rule.direction);
  });
  query.filters.forEach((rule, position) => {
    params.set(`filters[${position}][field]`, rule.field);
    params.set(`filters[${position}][op]`, rule.operator);
    const text = (item: unknown): string => (item instanceof Date ? formatLocalDate(item) : String(item)); // local time, as the default format
    if (Array.isArray(rule.value)) rule.value.forEach((item, at) => params.set(`filters[${position}][value][${at}]`, text(item)));
    else if (rule.value !== undefined) params.set(`filters[${position}][value]`, text(rule.value));
  });
  return params;
}

/** DataTables' server answer `{ draw, recordsTotal, recordsFiltered, data }` as `{ rows, totalRows }`. */
export function fromDataTablesResponse(body: unknown): unknown {
  if (!body || typeof body !== 'object') return body;
  const { data, recordsFiltered, error } = body as { data?: unknown; recordsFiltered?: unknown; error?: unknown };
  if (typeof error === 'string' && error !== '') throw new Error(error);
  const total = typeof recordsFiltered === 'string' && /^\d+$/.test(recordsFiltered) ? Number(recordsFiltered) : recordsFiltered;
  return total === undefined ? { rows: data } : { rows: data, totalRows: total };
}
