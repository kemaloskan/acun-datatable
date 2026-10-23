import {
  foldText, isDecimal, normalizeValue, type ColumnDef, type ColumnType,
} from '@acunsoft/datatable-core';
import { checkSheet, type Sheet, type SheetCell } from './sheet';

export interface ImportOptions {
  /**
   * Extra header names per column ID (`{ total: ['Tutar', 'Amount'] }`).
   * Headers always match a column's own header and ID, ignoring case,
   * accents and Turkish dotted/dotless i.
   */
  readonly headers?: Readonly<Record<string, string | readonly string[]>>;
  /** Column IDs that must have a value in every row (and a header). */
  readonly required?: readonly string[];
  /** How numbers are written in text cells. `','` reads `1.234,50`. Default `'.'`. */
  readonly decimalSeparator?: '.' | ',';
  /** Order of day, month and year in text dates such as `23.10.2026`. Default `'dmy'`; ISO `2026-10-23` always works. */
  readonly dateOrder?: 'dmy' | 'mdy';
  /** Stop collecting errors after this many. Default 1,000. */
  readonly maxErrors?: number;
}

export interface ImportedRow {
  /** Line in the file (the header is line 1). */
  readonly line: number;
  /**
   * Values by column ID: `number`, decimal text (`"1250.50"`, exact), `Date`
   * (dates at local midnight), `boolean`, `string`, or `null` when empty.
   */
  readonly values: Readonly<Record<string, string | number | boolean | Date | null>>;
}

export interface ImportIssue {
  /** Line in the file; `1` for header problems. */
  readonly line: number;
  readonly column: string;
  readonly value: string;
  readonly message: string;
}

export interface ImportResult {
  /** Rows without errors, in file order. */
  readonly rows: readonly ImportedRow[];
  readonly errors: readonly ImportIssue[];
  /** Headers in the file that matched no column. */
  readonly ignoredHeaders: readonly string[];
  /** True when more errors existed than `maxErrors`. */
  readonly truncated: boolean;
}

const TRUE = new Set(['true', '1', 'yes', 'evet', 'y', 'e', 'x', '✓']);
const FALSE = new Set(['false', '0', 'no', 'hayir', 'hayır', 'n', 'h', '']);
const NUMBER_TEXT = /^[+-]?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/i;

/**
 * Number text in plain `1234.5` form. Group separators are accepted only in
 * real groups of three (`1,234.5` / `1.234,5`), so `1,5` with `'.'` is an
 * error instead of silently becoming 15.
 */
function numberText(text: string, separator: '.' | ','): string {
  const clean = text.trim().replace(/[\s\u00a0\u202f']/g, '');
  const group = separator === '.' ? ',' : '.';
  const [int = '', ...rest] = clean.split(separator);
  if (rest.length > 1) return clean; // two decimal separators: left invalid
  const fraction = rest.length === 1 ? `.${rest[0]}` : '';
  if (!int.includes(group)) return int + fraction;
  return /^[+-]?\d{1,3}(?:[.,]\d{3})+$/.test(int) ? int.split(group).join('') + fraction : clean;
}

function textDate(text: string, order: 'dmy' | 'mdy', dayOnly: boolean): Date | undefined {
  const match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/.exec(text.trim());
  if (!match) return undefined;
  const [first, second, year] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const [day, month] = order === 'dmy' ? [first, second] : [second, first];
  const [hours, minutes, seconds] = dayOnly ? [0, 0, 0] : [Number(match[4] ?? 0), Number(match[5] ?? 0), Number(match[6] ?? 0)];
  const date = new Date(year, month - 1, day, hours, minutes, seconds);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day &&
    hours < 24 && minutes < 60 && seconds < 60 ? date : undefined;
}

type Value = string | number | boolean | Date | null;

function convert(cell: SheetCell, type: ColumnType | undefined, options: ImportOptions): Value | undefined {
  if (cell === null || (typeof cell === 'string' && cell.trim() === '')) return null;
  if (isDecimal(cell)) cell = cell.text;
  const separator = options.decimalSeparator ?? '.';
  switch (type) {
    case undefined:
    case 'text':
      return cell instanceof Date || typeof cell !== 'string' ? (normalizeValue(cell, 'text') as string) : cell.trim();
    case 'number': {
      if (typeof cell === 'number') return cell;
      if (typeof cell !== 'string') return undefined;
      const text = numberText(cell, separator);
      return NUMBER_TEXT.test(text) ? normalizeValue(text, 'number') as number | undefined : undefined;
    }
    case 'decimal': {
      const decimal = normalizeValue(typeof cell === 'string' ? numberText(cell, separator) : cell, 'decimal');
      return isDecimal(decimal) ? decimal.text : undefined;
    }
    case 'date':
    case 'datetime': {
      const dayOnly = type === 'date';
      if (typeof cell === 'string') {
        const local = textDate(cell, options.dateOrder ?? 'dmy', dayOnly);
        if (local) return local;
        if (!/^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(cell.trim())) return undefined;
        return normalizeValue(cell.trim().replace(' ', 'T'), type) as Date | undefined;
      }
      return cell instanceof Date ? normalizeValue(cell, type) as Date | undefined : undefined;
    }
    case 'boolean': {
      if (typeof cell === 'boolean') return cell;
      if (cell === 1 || cell === 0) return cell === 1;
      if (typeof cell !== 'string') return undefined;
      const text = foldText(cell.trim());
      if (TRUE.has(text)) return true;
      return FALSE.has(text) ? false : undefined;
    }
  }
}

const describe = (cell: SheetCell): string => (cell === null ? '' : isDecimal(cell) ? cell.text
  : cell instanceof Date ? cell.toISOString() : String(cell)).slice(0, 200);

/**
 * Read a sheet (from `parseCsv` or `readXlsx`) into typed values for the
 * given columns, and report every value that does not fit instead of
 * guessing. Headers are matched to columns by header text or ID
 * (case-, accent- and Turkish-insensitively, plus `options.headers`).
 * Nothing is saved anywhere: validate further and store the rows yourself.
 */
export function importRows<TData>(
  sheet: Sheet, columns: readonly ColumnDef<TData>[], options: ImportOptions = {},
): ImportResult {
  checkSheet(sheet);
  const maxErrors = options.maxErrors ?? 1_000;
  const required = new Set(options.required ?? []);
  const ids = new Set(columns.map(column => column.id));
  for (const id of [...required, ...Object.keys(options.headers ?? {})]) {
    if (!ids.has(id)) throw new Error(`unknown column ID: ${id}`);
  }
  const names = new Map<string, ColumnDef<TData>>();
  for (const column of columns) {
    const extra = options.headers?.[column.id];
    for (const name of [column.header, column.id, ...(typeof extra === 'string' ? [extra] : extra ?? [])]) {
      const key = foldText(name.trim());
      if (key !== '' && !names.has(key)) names.set(key, column);
    }
  }
  const errors: ImportIssue[] = [];
  let truncated = false;
  const report = (issue: ImportIssue): void => {
    if (errors.length < maxErrors) errors.push(Object.freeze(issue));
    else truncated = true;
  };

  const mapping: (ColumnDef<TData> | undefined)[] = [];
  const ignoredHeaders: string[] = [];
  const seen = new Set<string>();
  sheet.headers.forEach(header => {
    const column = names.get(foldText(header.trim()));
    if (!column) {
      if (header.trim() !== '') ignoredHeaders.push(header);
      mapping.push(undefined);
    } else if (seen.has(column.id)) {
      report({ line: 1, column: column.id, value: header, message: 'column appears twice; the first one is used' });
      mapping.push(undefined);
    } else {
      seen.add(column.id);
      mapping.push(column);
    }
  });
  for (const id of required) {
    if (!seen.has(id)) report({ line: 1, column: id, value: '', message: 'required column is missing' });
  }
  if (errors.some(error => error.line === 1 && error.message === 'required column is missing')) {
    return Object.freeze({ rows: Object.freeze([]), errors: Object.freeze(errors), ignoredHeaders: Object.freeze(ignoredHeaders), truncated });
  }

  const rows: ImportedRow[] = [];
  sheet.rows.forEach((cells, index) => {
    const line = index + 2;
    const values: Record<string, Value> = {};
    let valid = true;
    cells.forEach((cell, position) => {
      const column = mapping[position];
      if (!column) return;
      const value = convert(cell, column.type, options);
      if (value === undefined) {
        valid = false;
        report({ line, column: column.id, value: describe(cell), message: `not a valid ${column.type ?? 'text'} value` });
      } else if (value === null && required.has(column.id)) {
        valid = false;
        report({ line, column: column.id, value: '', message: 'required value is empty' });
      } else {
        values[column.id] = value;
      }
    });
    if (valid) rows.push(Object.freeze({ line, values: Object.freeze(values) }));
  });
  return Object.freeze({
    rows: Object.freeze(rows), errors: Object.freeze(errors), ignoredHeaders: Object.freeze(ignoredHeaders), truncated,
  });
}
