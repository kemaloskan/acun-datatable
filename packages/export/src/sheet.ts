import {
  isDecimal, normalizeValue, type ColumnDef, type ColumnType, type DataTable, type DecimalValue, type Row,
} from '@acunsoft/datatable-core';

/** One cell of a sheet. Decimals keep their exact text; `null` is an empty cell. */
export type SheetCell = string | number | boolean | Date | DecimalValue | null;

/** A rectangular table of typed cells with a header row. */
export interface Sheet {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly SheetCell[])[];
  /** Per column: tells writers whether a date is a day or an instant. */
  readonly types?: readonly (ColumnType | undefined)[];
}

/** Which rows of the table to export. */
export type ExportRows = 'all' | 'page' | 'selected';

export interface TableToSheetOptions<TData> {
  /**
   * `'all'` (default): every row matching the current filters and search, in
   * the current order (in server mode only the loaded page; export on the
   * server for everything). `'page'`: the current page. `'selected'`: the
   * selected rows the table holds.
   */
  readonly rows?: ExportRows;
  /** `'visible'` (default) or `'all'` columns, in column order. */
  readonly columns?: 'visible' | 'all';
  /** Per column ID: the exported value instead of the column's own. */
  readonly value?: Readonly<Record<string, (value: unknown, row: Row<TData>) => SheetCell>>;
}

const read = <TData>(column: ColumnDef<TData>, row: Row<TData>): unknown => column.accessorFn
  ? column.accessorFn(row.original)
  : (row.original as Record<PropertyKey, unknown>)[column.accessorKey as PropertyKey];

/** Turn any value into a sheet cell the way a column of `type` reads it. */
export function toCell(value: unknown, type: ColumnType | undefined): SheetCell {
  const normalized = type === undefined ? value : normalizeValue(value, type) ?? value;
  if (normalized === null || normalized === undefined) return null;
  if (typeof normalized === 'number') return Number.isFinite(normalized) ? normalized : null;
  if (typeof normalized === 'string' || typeof normalized === 'boolean') return normalized;
  if (normalized instanceof Date) return Number.isNaN(normalized.getTime()) ? null : normalized;
  if (isDecimal(normalized)) return normalized;
  if (typeof normalized === 'bigint') return String(normalized);
  return String(normalized);
}

/**
 * Build a sheet from a table: its headers, and the rows the user sees with
 * values read like the columns read them (typed columns give numbers,
 * decimals, dates and booleans). Nothing is formatted for display here, so
 * spreadsheets get real numbers and dates.
 */
export function tableToSheet<TData>(table: DataTable<TData>, options: TableToSheetOptions<TData> = {}): Sheet {
  const which = options.rows ?? 'all';
  if (!['all', 'page', 'selected'].includes(which)) throw new TypeError('rows must be "all", "page" or "selected"');
  const scope = options.columns ?? 'visible';
  if (scope !== 'visible' && scope !== 'all') throw new TypeError('columns must be "visible" or "all"');
  const columns = scope === 'all' ? table.getColumns() : table.getVisibleColumns();
  const known = new Set(table.getColumns().map(column => column.id));
  for (const [id, fn] of Object.entries(options.value ?? {})) {
    if (!known.has(id)) throw new Error(`unknown value column ID: ${id}`);
    if (typeof fn !== 'function') throw new TypeError(`value for column "${id}" must be a function`);
  }
  const rows = which === 'page' ? table.getPage().rows : which === 'selected' ? table.getSelectedRows() : table.getFilteredRows();
  return Object.freeze({
    headers: Object.freeze(columns.map(column => column.header)),
    types: Object.freeze(columns.map(column => column.type)),
    rows: Object.freeze(rows.map(row => Object.freeze(columns.map(column => {
      const raw = read(column, row);
      const custom = options.value?.[column.id];
      return custom ? toCell(custom(raw, row), undefined) : toCell(raw, column.type);
    })))),
  });
}

/** Check a sheet made by hand before writing it. */
export function checkSheet(sheet: Sheet): void {
  if (!sheet || !Array.isArray(sheet.headers) || !Array.isArray(sheet.rows)) {
    throw new TypeError('sheet must have headers and rows arrays');
  }
  if (sheet.headers.some(header => typeof header !== 'string')) throw new TypeError('sheet headers must be strings');
  const width = sheet.headers.length;
  sheet.rows.forEach((row, index) => {
    if (!Array.isArray(row) || row.length !== width) {
      throw new RangeError(`sheet row ${index + 1} must have ${width} cells`);
    }
  });
  if (sheet.types !== undefined && (!Array.isArray(sheet.types) || sheet.types.length !== width)) {
    throw new RangeError(`sheet types must have ${width} entries`);
  }
}
