import { isDecimal, normalizeValue, type ColumnDef, type Row, type SortRule } from '@acunsoft/datatable-core';
import { labelsEn, type DataTableLabels } from './labels';

/** Turns a cell value into plain text. It must return a string; HTML is never interpreted. */
export type CellFormatter<TData> = (value: unknown, row: Row<TData>) => string;

export interface CellTextOptions<TData> {
  /** Locale for numbers and dates. Default `'en'`. */
  readonly locale?: string;
  /** Per column ID. */
  readonly format?: Readonly<Record<string, CellFormatter<TData>>>;
  /** For `Yes` / `No`. */
  readonly labels?: Partial<DataTableLabels>;
}

/** Read a column's raw value from a row. */
export function cellValue<TData>(column: ColumnDef<TData>, row: Row<TData>): unknown {
  return column.accessorFn
    ? column.accessorFn(row.original)
    : (row.original as Record<PropertyKey, unknown>)[column.accessorKey as PropertyKey];
}

/**
 * The display text of cells, shared by every renderer (DOM, Vue, React):
 * a column formatter when given, otherwise locale-aware numbers, decimals with
 * their written scale, dates (date-times with the time), Yes/No, and empty
 * text for missing values. Typed columns read text values as their type; an
 * unreadable value is shown as written.
 */
export function createCellText<TData>(
  columns: readonly ColumnDef<TData>[], options: CellTextOptions<TData> = {},
): (column: ColumnDef<TData>, row: Row<TData>) => string {
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };
  const locale = options.locale ?? 'en';
  const ids = new Set(columns.map(column => column.id));
  for (const [id, formatter] of Object.entries(options.format ?? {})) {
    if (!ids.has(id)) throw new Error(`unknown format column ID: ${id}`);
    if (typeof formatter !== 'function') throw new TypeError(`format for column "${id}" must be a function`);
  }
  const numbers = new Intl.NumberFormat(locale);
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dateTimes = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const scaled = new Map<number, Intl.NumberFormat>();
  const decimalFormat = (scale: number): Intl.NumberFormat => {
    let format = scaled.get(scale);
    if (!format) {
      format = new Intl.NumberFormat(locale, { minimumFractionDigits: scale, maximumFractionDigits: scale });
      scaled.set(scale, format);
    }
    return format;
  };
  return (column, row) => {
    const raw = cellValue(column, row);
    const formatter = options.format?.[column.id];
    if (formatter) {
      const output = formatter(raw, row);
      if (typeof output !== 'string') throw new TypeError(`format for column "${column.id}" must return a string`);
      return output;
    }
    const value = column.type === undefined ? raw : normalizeValue(raw, column.type) ?? raw;
    if (value == null) return '';
    if (typeof value === 'number') return Number.isNaN(value) ? '' : numbers.format(value);
    if (isDecimal(value)) return decimalFormat(value.scale).format(Number(value.text));
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return '';
      return (column.type === 'datetime' ? dateTimes : dates).format(value);
    }
    if (typeof value === 'boolean') return value ? labels.yes : labels.no;
    return String(value);
  };
}

/**
 * The sorting after a header click: ascending → descending → none. With
 * `additive` (Shift+click) the column is added to or changed in a
 * multi-column sort instead of replacing it.
 */
export function nextSorting(current: readonly Readonly<SortRule>[], field: string, additive: boolean): SortRule[] {
  const existing = current.find(rule => rule.field === field);
  const direction = !existing ? 'asc' : existing.direction === 'asc' ? 'desc' : undefined;
  if (!additive) return direction ? [{ field, direction }] : [];
  if (!existing) return [...current, { field, direction: 'asc' }];
  return direction
    ? current.map(rule => (rule.field === field ? { field, direction } : rule))
    : current.filter(rule => rule.field !== field);
}

/** The accessible row name used for checkbox and action labels. */
export function rowName<TData>(row: Row<TData>, firstCellText: string, rowLabel?: (row: Row<TData>) => string): string {
  const name = rowLabel ? rowLabel(row) : firstCellText.trim();
  if (typeof name !== 'string') throw new TypeError('rowLabel must return a string');
  return name === '' ? row.id : name;
}
