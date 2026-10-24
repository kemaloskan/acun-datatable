import { TableQueryError, type ServerTableQuery } from './query';

export interface TableResponseOptions<TRow> {
  /** With cursor paging: `cursorOf` from `sqlQuery` / `prismaQuery`, for `nextCursor`. */
  readonly cursorOf?: (row: TRow) => string;
  /** DataTables' `recordsTotal` (every row before filters). Default: the filtered total. */
  readonly recordsTotal?: number;
  /** Map each row to what the browser should get (leave out what it must not see). */
  readonly map?: (row: TRow) => unknown;
}

/**
 * The answer for the browser, in the format the request used: this
 * package's `{ rows, totalRows, nextCursor? }`, or DataTables'
 * `{ draw, recordsTotal, recordsFiltered, data }`. With cursor paging the
 * page was read one row longer: the extra row is dropped and only tells
 * that there is a next page. `total` may be left out when not counted.
 */
export function tableResponse<TRow extends Record<string, unknown>>(query: ServerTableQuery, rows: readonly TRow[], total?: number | bigint | string, options: TableResponseOptions<TRow> = {}): Record<string, unknown> {
  const more = query.cursorPaging && rows.length > query.pageSize;
  const page = more ? rows.slice(0, query.pageSize) : rows;
  const count = total === undefined ? undefined : Number(total); // drivers return COUNT(*) as bigint or text
  if (count !== undefined && (!Number.isSafeInteger(count) || count < 0)) throw new TypeError('total must be a whole number');
  const out = options.map ? page.map(options.map) : [...page];
  if (query.draw !== undefined) {
    return { draw: query.draw, recordsTotal: options.recordsTotal ?? count ?? out.length, recordsFiltered: count ?? out.length, data: out };
  }
  if (more && !options.cursorOf) throw new TypeError('cursor paging needs options.cursorOf for nextCursor');
  return {
    rows: out,
    ...(count === undefined ? {} : { totalRows: count }),
    ...(more ? { nextCursor: options.cursorOf!(page[page.length - 1]!) } : {}),
  };
}

/**
 * Status and body for an error while reading the query: 422 with
 * `{ message, errors: { field: message } }`, or for a DataTables request a 200
 * with its `error`, as DataTables expects. Other errors are thrown on.
 */
export function tableError(error: unknown, input?: { readonly draw?: unknown } | URLSearchParams | FormData): { status: number; body: Record<string, unknown> } {
  if (!(error instanceof TableQueryError)) throw error;
  const draw = typeof (input as URLSearchParams | undefined)?.get === 'function' ? (input as URLSearchParams).get('draw') : (input as { draw?: unknown } | undefined)?.draw;
  if (draw !== undefined && draw !== null) {
    return { status: 200, body: { draw: Number(draw) || 0, error: error.message, data: [], recordsTotal: 0, recordsFiltered: 0 } };
  }
  return { status: 422, body: { message: error.message, errors: { [error.field]: error.message } } };
}
