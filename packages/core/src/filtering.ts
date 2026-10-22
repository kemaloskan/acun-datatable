import { createColumns, type ColumnDef } from './columns';
import { checkFilterRule, isNoOpRule, splitSearchTerms, type FilterOperator, type FilterRule } from './filter-rules';
import type { Row } from './rows';
import {
  compareNormalized, foldText, isDecimal, isMissing, normalizeValue,
  type ColumnType, type DecimalValue,
} from './values';

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
 * - `eq`, `gt`, `lt`, `between`, `in` compare values of the same type. With a
 *   column `type`, text such as `"100.00"` or `"2026-10-23"` is read as that type
 *   first; without one, values are compared as they are and never coerced.
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
    const ordered = operator === 'gt' || operator === 'lt' || operator === 'between';
    if (ordered && type === 'boolean') {
      throw new TypeError(`filter "${field}" ${operator} is not supported for boolean columns`);
    }
    const read = (input: unknown): unknown => {
      if (type === undefined) return input;
      const normalized = normalizeValue(input, type);
      if (normalized === undefined) throw new TypeError(`filter "${field}" value is not a valid ${type}`);
      return normalized;
    };
    const textual = operator === 'contains' || operator === 'startsWith';
    const valueless = operator === 'empty' || operator === 'notEmpty';
    const targets = textual || valueless ? [] : (Array.isArray(value) ? value : [value]).map(read);
    if (operator === 'between') {
      const order = compare(targets[0], targets[1], type);
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
    if (value instanceof Date) return [isoDate(value), shortDate.format(value), mediumDate.format(value)];
    if (typeof value === 'boolean') return [String(value), value ? labels[0]! : labels[1]!];
    return [];
  };
  const containsText = (value: unknown, needle: string): boolean =>
    texts(value).some(text => foldText(text).includes(needle));
  const startsWithText = (value: unknown, needle: string): boolean =>
    texts(value).some(text => foldText(text).startsWith(needle));
  const isEmpty = (value: unknown): boolean =>
    value === undefined || isMissing(value) || (typeof value === 'string' && value.trim() === '');
  const equals = (cell: unknown, target: unknown, type: ColumnType | undefined): boolean => {
    if (type === undefined) return cell instanceof Date && target instanceof Date ? cell.getTime() === target.getTime() : cell === target;
    return type === 'text' ? cell === target : compare(cell, target, type) === 0;
  };
  const matches = (operator: FilterOperator, cell: unknown, targets: unknown[], needle: string, type: ColumnType | undefined): boolean => {
    switch (operator) {
      case 'empty': return isEmpty(cell);
      case 'notEmpty': return !isEmpty(cell);
      default: if (cell === undefined || isMissing(cell)) return false;
    }
    switch (operator) {
      case 'contains': return containsText(cell, needle);
      case 'startsWith': return startsWithText(cell, needle);
      case 'eq': return equals(cell, targets[0], type);
      case 'in': return targets.some(target => equals(cell, target, type));
      case 'gt': { const order = compare(cell, targets[0], type); return order !== undefined && order > 0; }
      case 'lt': { const order = compare(cell, targets[0], type); return order !== undefined && order < 0; }
      case 'between': {
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
    // Read each needed column at most once per row, and only if reached.
    const cache: unknown[] = new Array(fields.length).fill(UNSET);
    const read = (field: string): unknown => {
      const index = slot.get(field)!;
      if (cache[index] === UNSET) {
        const column = columns.get(field)!;
        const raw = column.accessorFn ? column.accessorFn(row.original) : row.original[column.accessorKey!];
        cache[index] = normalizeValue(raw, column.type);
      }
      return cache[index];
    };

    for (const { field, operator, type, targets, needle } of rules) {
      if (!matches(operator, read(field), targets, needle, type)) return false;
    }
    // Smart search: every term must match in at least one searchable column.
    return terms.every(term => searchable.some(field => {
      const cell = read(field);
      return cell !== undefined && !isMissing(cell) && containsText(cell, term);
    }));
  });
  return Object.freeze(result);
}
