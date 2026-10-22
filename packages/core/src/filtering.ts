import { createColumns, type ColumnDef } from './columns';
import type { Row } from './rows';

/** Supported column filter operators. */
export type FilterOperator = 'contains' | 'eq' | 'gt' | 'lt';

/** A single column filter. Every rule must match (logical AND). */
export interface FilterRule {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: unknown;
}

export interface FilterQuery {
  readonly filters?: readonly FilterRule[];
  /** Case-insensitive text matched against every filterable column (logical OR). */
  readonly globalSearch?: string;
}

export interface FilterOptions {
  /** Locale for case-insensitive text matching and string ordering. Default `'en'`. */
  readonly locale?: string;
}

const OPERATORS: readonly FilterOperator[] = ['contains', 'eq', 'gt', 'lt'];
const UNSET: unique symbol = Symbol('unset');

function missing(value: unknown): boolean {
  return value == null || (typeof value === 'number' && Number.isNaN(value)) ||
    (value instanceof Date && Number.isNaN(value.getTime()));
}

/** Text form used by `contains` and global search: strings and finite numbers only. */
function text(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return undefined;
}

function validateValue(field: string, operator: FilterOperator, value: unknown): void {
  if (operator === 'contains') {
    if (typeof value !== 'string') throw new TypeError(`filter "${field}" contains value must be a string`);
    return;
  }
  const comparable = typeof value === 'string' ||
    (typeof value === 'number' && !Number.isNaN(value)) ||
    (value instanceof Date && !Number.isNaN(value.getTime()));
  if (operator === 'eq' && (comparable || typeof value === 'boolean')) return;
  if (comparable) return;
  throw new TypeError(operator === 'eq'
    ? `filter "${field}" eq value must be a string, number, boolean or valid Date`
    : `filter "${field}" ${operator} value must be a string, number or valid Date`);
}

/**
 * Return the rows that match every column filter and the global search.
 *
 * Input order is preserved, so filtering the output of `getSortedRows` gives the
 * same result as sorting the filtered rows. Values are compared without type
 * coercion; missing values (`null`, `undefined`, `NaN`, invalid `Date`) never
 * match a filter. Only columns with `enableFiltering: true` may be filtered or
 * searched. The input array is not mutated and the same `Row` wrappers are
 * returned in a frozen array.
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
  const collator = new Intl.Collator(locale, { usage: 'sort' });

  const filters = query.filters ?? [];
  if (!Array.isArray(filters)) throw new TypeError('filters must be an array');
  const rules = Array.from(filters, (rule: FilterRule) => {
    if (!rule || typeof rule.field !== 'string' || rule.field.trim().length === 0) {
      throw new TypeError('filter field must be a non-empty column ID');
    }
    const { field, operator, value } = rule;
    const column = columns.get(field);
    if (!column) throw new Error(`unknown filter column ID: ${field}`);
    if (!column.enableFiltering) throw new Error(`filtering is disabled for column "${field}"`);
    if (!OPERATORS.includes(operator)) {
      throw new TypeError(`filter operator for "${field}" must be one of ${OPERATORS.join(', ')}`);
    }
    validateValue(field, operator, value);
    const needle = operator === 'contains' ? (value as string).toLocaleLowerCase(locale) : '';
    return { field, operator, value, needle };
  }).filter(rule => !(rule.operator === 'contains' && rule.needle === ''));

  const search = query.globalSearch ?? '';
  if (typeof search !== 'string') throw new TypeError('globalSearch must be a string');
  const term = search.trim().toLocaleLowerCase(locale);
  const searchable = term === '' ? [] : [...columns.values()].filter(column => column.enableFiltering).map(c => c.id);

  if (rules.length === 0 && term === '') return Object.isFrozen(rows) ? rows : Object.freeze([...rows]);

  const fields = [...new Set([...rules.map(rule => rule.field), ...searchable])];
  const slot = new Map(fields.map((field, index) => [field, index]));
  const containsText = (value: unknown, needle: string): boolean => {
    const value_ = text(value);
    return value_ !== undefined && value_.toLocaleLowerCase(locale).includes(needle);
  };

  const result = rows.filter(row => {
    // Evaluate each needed accessor at most once per row, and only if reached.
    const cache: unknown[] = new Array(fields.length).fill(UNSET);
    const read = (field: string): unknown => {
      const index = slot.get(field)!;
      if (cache[index] === UNSET) {
        const column = columns.get(field)!;
        cache[index] = column.accessorFn
          ? column.accessorFn(row.original)
          : row.original[column.accessorKey!];
      }
      return cache[index];
    };

    for (const { field, operator, value, needle } of rules) {
      const cell = read(field);
      if (missing(cell)) return false;
      if (operator === 'contains') {
        if (!containsText(cell, needle)) return false;
      } else if (operator === 'eq') {
        if (cell instanceof Date && value instanceof Date) {
          if (cell.getTime() !== value.getTime()) return false;
        } else if (cell !== value) {
          return false;
        }
      } else {
        let order: number;
        if (typeof cell === 'number' && typeof value === 'number') order = cell - value;
        else if (typeof cell === 'string' && typeof value === 'string') order = collator.compare(cell, value);
        else if (cell instanceof Date && value instanceof Date) order = cell.getTime() - value.getTime();
        else return false; // Different types never compare; no coercion.
        if (operator === 'gt' ? !(order > 0) : !(order < 0)) return false;
      }
    }
    return term === '' || searchable.some(field => {
      const cell = read(field);
      return !missing(cell) && containsText(cell, term);
    });
  });
  return Object.freeze(result);
}
