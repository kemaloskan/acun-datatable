import { createColumns, type ColumnDef } from './columns';
import { checkFilterRule, isNoOpRule, splitSearchTerms, type FilterOperator, type FilterRule } from './filter-rules';
import type { Row } from './rows';
import {
  compareNormalized, foldText, formatLocalDate, isDateOnlyText, isDecimal, isLocalMidnight, isMissing, normalizeValue,
  type ColumnType, type DecimalValue,
} from './values';

/** Half-open time range `[start, end)` in milliseconds. */
interface Span { readonly start: number; readonly end: number }
const DAY_SPAN = Symbol('day span');
/** A datetime filter value: one instant, or a whole local day for date-only input. */
const toSpan = (input: unknown, date: Date): Span & { readonly [DAY_SPAN]: true } => {
  const day = isDateOnlyText(input) || (input instanceof Date && isLocalMidnight(date));
  const start = date.getTime();
  const end = day ? new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() : start + 1;
  return { start, end, [DAY_SPAN]: true };
};
const isSpan = (value: unknown): value is Span => typeof value === 'object' && value !== null && DAY_SPAN in value;

export { FILTER_OPERATORS, MAX_IN_VALUES, splitSearchTerms, type FilterOperator, type FilterRule } from './filter-rules';

export interface FilterQuery {
  readonly filters?: readonly FilterRule[];
  /** Smart search over every filterable column, see `filterRows`. */
  readonly globalSearch?: string;
}

export interface FilterOptions {
  /** Locale for number/date text in search and for string ordering. Default `'en'`. */
  readonly locale?: string;
  /** Searchable words for `true` / `false`. Default Evet/Hayır for `tr*`, otherwise Yes/No. */
  readonly booleanLabels?: readonly [string, string];
  /**
   * Reuse cell values and folded search text between calls (see
   * `createFilterCache`). `createDataTable` uses one automatically.
   */
  readonly cache?: FilterCache;
}

interface CellEntry {
  readonly value: unknown;
  folded?: readonly string[];
}
interface CacheState {
  definitions: unknown;
  signature: string;
  rows: WeakMap<object, Map<string, CellEntry>>;
}
/** Opaque cache handle from `createFilterCache`. */
export interface FilterCache {
  readonly kind: 'filter-cache';
}
const caches = new WeakMap<FilterCache, CacheState>();

/**
 * Create a cache for `filterRows`. It remembers, per `Row` wrapper and column,
 * the value read for the column type and its folded search text, so repeated
 * searches over the same rows skip number/date formatting and text folding.
 *
 * Entries belong to the `Row` objects (held weakly), so replacing the rows with
 * `createRows` naturally starts fresh. Like the sorting cache, it assumes
 * records are not mutated in place; the cache resets itself when it is used
 * with other column definitions, another locale or other boolean labels.
 */
export function createFilterCache(): FilterCache {
  const handle: FilterCache = Object.freeze({ kind: 'filter-cache' });
  caches.set(handle, { definitions: undefined, signature: '', rows: new WeakMap() });
  return handle;
}

const UNSET: unique symbol = Symbol('unset');
const pad = (value: number): string => String(value).padStart(2, '0');
const isoDate = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

/**
 * Return the rows that match every column filter and the global search.
 *
 * - Text matching (`contains`, `startsWith`, global search) is case-, accent-
 *   and Turkish-insensitive (`isparta` finds `ISPARTA`, `ayse` finds `Ayşe`) and
 *   also sees numbers as written in the locale (`1234,5`, `1.234,5`), dates
 *   (`2026-10-23`, `23.10.2026`) and booleans (`evet`/`yes`). Blank text
 *   constrains nothing.
 * - Global search is "smart", like DataTables: every word must match in some
 *   filterable column (not necessarily the same one), and a quoted phrase is
 *   one term: `ali ankara`, `"new york" 2026`.
 * - `eq`, `gt`, `lt`, `gte`, `lte`, `between`, `in` compare values of the same type. With a
 *   column `type`, text such as `"100.00"` or `"2026-10-23"` is read as that type
 *   first; without one, values are compared as they are and never coerced.
 * - Days: a `date` column compares calendar days. In a `datetime` column a
 *   date-only value (`"2026-10-23"` or a local midnight) means that whole day:
 *   `eq` matches any time on it, `gt` starts the next day, `lt` ends before it,
 *   `gte` starts on it, `lte` ends with it, `between` covers both end days.
 * - `empty` matches missing values (`null`, `undefined`, `NaN`, invalid `Date`,
 *   unreadable typed values) and blank text; `notEmpty` the rest. Every other
 *   operator never matches a missing value. Only `enableFiltering` columns can
 *   be filtered.
 *
 * Input order is preserved, so filtering the output of `getSortedRows` equals
 * sorting the filtered rows. The input is never mutated; the result is a frozen
 * array of the same `Row` wrappers.
 */
export function filterRows<TData>(
  rows: readonly Row<TData>[],
  definitions: readonly ColumnDef<TData>[],
  query: FilterQuery,
  options: FilterOptions = {},
): readonly Row<TData>[] {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array from createRows');
  const columns = new Map(createColumns(definitions).map(column => [column.id, column]));
  if (!query || typeof query !== 'object') throw new TypeError('query must be an object');
  const locale = options.locale ?? 'en';
  if (typeof locale !== 'string' || locale.length === 0) throw new TypeError('locale must be a non-empty string');
  const collator = new Intl.Collator(locale, { usage: 'sort', numeric: true });
  const labels = options.booleanLabels ?? (locale.toLowerCase().startsWith('tr') ? ['Evet', 'Hayır'] : ['Yes', 'No']);
  if (!Array.isArray(labels) || labels.length !== 2 || labels.some(label => typeof label !== 'string')) {
    throw new TypeError('booleanLabels must be two strings');
  }
  let store: CacheState | undefined;
  if (options.cache !== undefined) {
    store = caches.get(options.cache);
    if (!store) throw new TypeError('cache must come from createFilterCache');
    const signature = JSON.stringify([locale, labels]);
    if (store.definitions !== definitions || store.signature !== signature) {
      store.definitions = definitions;
      store.signature = signature;
      store.rows = new WeakMap();
    }
  }

  const compare = (cell: unknown, target: unknown, type: ColumnType | undefined): number | undefined => {
    if (type !== undefined) return compareNormalized(cell, target, type, collator);
    if (typeof cell === 'number' && typeof target === 'number') return cell === target ? 0 : cell < target ? -1 : 1;
    if (typeof cell === 'string' && typeof target === 'string') return collator.compare(cell, target);
    if (cell instanceof Date && target instanceof Date) return Math.sign(cell.getTime() - target.getTime());
    return undefined; // Different types never compare; no coercion.
  };

  const filters = query.filters ?? [];
  if (!Array.isArray(filters)) throw new TypeError('filters must be an array');
  const rules = Array.from(filters, (rule: FilterRule) => {
    checkFilterRule(rule, 'filter');
    const { field, operator, value } = rule;
    const column = columns.get(field);
    if (!column) throw new Error(`unknown filter column ID: ${field}`);
    if (!column.enableFiltering) throw new Error(`filtering is disabled for column "${field}"`);
    const type = column.type;
    const ordered = operator === 'gt' || operator === 'lt' || operator === 'gte' || operator === 'lte' || operator === 'between';
    if (ordered && type === 'boolean') {
      throw new TypeError(`filter "${field}" ${operator} is not supported for boolean columns`);
    }
    const read = (input: unknown): unknown => {
      if (type === undefined) return input;
      const normalized = normalizeValue(input, type);
      if (normalized === undefined) throw new TypeError(`filter "${field}" value is not a valid ${type}`);
      return type === 'datetime' ? toSpan(input, normalized as Date) : normalized;
    };
    const textual = operator === 'contains' || operator === 'startsWith';
    const valueless = operator === 'empty' || operator === 'notEmpty';
    const targets = textual || valueless ? [] : (Array.isArray(value) ? value : [value]).map(read);
    if (operator === 'between') {
      const order = isSpan(targets[0]) && isSpan(targets[1])
        ? Math.sign(targets[0].start - targets[1].start)
        : compare(targets[0], targets[1], type);
      if (order === undefined) throw new TypeError(`filter "${field}" between needs two values of the same type`);
      if (order > 0) throw new RangeError(`filter "${field}" between needs min <= max`);
    }
    const needle = textual ? foldText((value as string).trim()) : '';
    return { field, operator, type, targets, needle, noOp: isNoOpRule(rule) };
  }).filter(rule => !rule.noOp);

  const search = query.globalSearch ?? '';
  if (typeof search !== 'string') throw new TypeError('globalSearch must be a string');
  const terms = splitSearchTerms(search).map(foldText);
  const searchable = terms.length === 0 ? [] : [...columns.values()].filter(column => column.enableFiltering).map(c => c.id);

  if (rules.length === 0 && terms.length === 0) return Object.isFrozen(rows) ? rows : Object.freeze([...rows]);

  // Text forms used by contains/search; formatters are built once per call.
  const grouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 20 });
  const ungrouped = new Intl.NumberFormat(locale, { maximumFractionDigits: 20, useGrouping: false });
  const shortDate = new Intl.DateTimeFormat(locale, { dateStyle: 'short' });
  const mediumDate = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const shortDateTime = new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' });
  const scaled = new Map<number, [Intl.NumberFormat, Intl.NumberFormat]>();
  const decimalTexts = (value: DecimalValue): string[] => {
    let formats = scaled.get(value.scale);
    if (!formats) {
      const digits = { minimumFractionDigits: value.scale, maximumFractionDigits: value.scale };
      formats = [new Intl.NumberFormat(locale, digits), new Intl.NumberFormat(locale, { ...digits, useGrouping: false })];
      scaled.set(value.scale, formats);
    }
    const number = Number(value.text);
    return [value.text, formats[0].format(number), formats[1].format(number)];
  };
  const texts = (value: unknown): string[] => {
    if (typeof value === 'string') return [value];
    if (typeof value === 'number') return Number.isFinite(value) ? [String(value), grouped.format(value), ungrouped.format(value)] : [];
    if (isDecimal(value)) return decimalTexts(value);
    if (value instanceof Date) {
      const days = [isoDate(value), shortDate.format(value), mediumDate.format(value)];
      return isLocalMidnight(value) ? days : [...days, formatLocalDate(value).slice(0, 16).replace('T', ' '), shortDateTime.format(value)];
    }
    if (typeof value === 'boolean') return [String(value), value ? labels[0]! : labels[1]!];
    return [];
  };
  const folded = (value: unknown): readonly string[] => texts(value).map(foldText);
  const isEmpty = (value: unknown): boolean =>
    value === undefined || isMissing(value) || (typeof value === 'string' && value.trim() === '');
  // A datetime cell against a span: before (-1), inside (0) or after (1).
  const place = (cell: Date, span: Span): number => {
    const time = cell.getTime();
    return time < span.start ? -1 : time >= span.end ? 1 : 0;
  };
  const equals = (cell: unknown, target: unknown, type: ColumnType | undefined): boolean => {
    if (isSpan(target)) return place(cell as Date, target) === 0;
    if (type === undefined) return cell instanceof Date && target instanceof Date ? cell.getTime() === target.getTime() : cell === target;
    return type === 'text' ? cell === target : compare(cell, target, type) === 0;
  };
  const matches = (
    field: string, operator: FilterOperator, cell: unknown, targets: unknown[], needle: string,
    type: ColumnType | undefined, textOf: (field: string) => readonly string[],
  ): boolean => {
    switch (operator) {
      case 'empty': return isEmpty(cell);
      case 'notEmpty': return !isEmpty(cell);
      default: if (cell === undefined || isMissing(cell)) return false;
    }
    switch (operator) {
      case 'contains': return textOf(field).some(text => text.includes(needle));
      case 'startsWith': return textOf(field).some(text => text.startsWith(needle));
      case 'eq': return equals(cell, targets[0], type);
      case 'in': return targets.some(target => equals(cell, target, type));
      case 'gt': {
        const order = isSpan(targets[0]) ? place(cell as Date, targets[0]) : compare(cell, targets[0], type);
        return order !== undefined && order > 0;
      }
      case 'lt': {
        const order = isSpan(targets[0]) ? place(cell as Date, targets[0]) : compare(cell, targets[0], type);
        return order !== undefined && order < 0;
      }
      case 'gte': {
        const order = isSpan(targets[0]) ? place(cell as Date, targets[0]) : compare(cell, targets[0], type);
        return order !== undefined && order >= 0;
      }
      case 'lte': {
        const order = isSpan(targets[0]) ? place(cell as Date, targets[0]) : compare(cell, targets[0], type);
        return order !== undefined && order <= 0;
      }
      case 'between': {
        if (isSpan(targets[0]) && isSpan(targets[1])) {
          return place(cell as Date, targets[0]) >= 0 && place(cell as Date, targets[1]) <= 0;
        }
        const low = compare(cell, targets[0], type);
        const high = compare(cell, targets[1], type);
        return low !== undefined && high !== undefined && low >= 0 && high <= 0;
      }
      default: return false;
    }
  };


  const fields = [...new Set([...rules.map(rule => rule.field), ...searchable])];
  const slot = new Map(fields.map((field, index) => [field, index]));
  const result = rows.filter(row => {
    // Read each needed column at most once per row (and once per row across
    // calls with a cache), and only if reached.
    const local: (CellEntry | typeof UNSET)[] = new Array(fields.length).fill(UNSET);
    let cached = store?.rows.get(row);
    const entry = (field: string): CellEntry => {
      const index = slot.get(field)!;
      const known = local[index];
      if (known !== UNSET) return known!;
      let found = cached?.get(field);
      if (!found) {
        const column = columns.get(field)!;
        const raw = column.accessorFn ? column.accessorFn(row.original) : row.original[column.accessorKey!];
        found = { value: normalizeValue(raw, column.type) };
        if (store) {
          if (!cached) { cached = new Map(); store.rows.set(row, cached); }
          cached.set(field, found);
        }
      }
      local[index] = found;
      return found;
    };
    const read = (field: string): unknown => entry(field).value;
    const textOf = (field: string): readonly string[] => {
      const cell = entry(field);
      return (cell.folded ??= folded(cell.value));
    };

    for (const { field, operator, type, targets, needle } of rules) {
      if (!matches(field, operator, read(field), targets, needle, type, textOf)) return false;
    }
    // Smart search: every term must match in at least one searchable column.
    return terms.every(term => searchable.some(field => {
      const cell = read(field);
      return cell !== undefined && !isMissing(cell) && textOf(field).some(text => text.includes(term));
    }));
  });
  return Object.freeze(result);
}
