import { createColumns, type ColumnDef } from './columns';
import { compareNormalized, isMissing, normalizeValue } from './values';
import type { SortRule } from './state';
import type { Row } from './rows';

/** Compare non-missing values in ascending order; return a finite number. Must be pure. */
export type SortComparator = (left: unknown, right: unknown) => number;
export type NullPlacement = 'first' | 'last';

export interface LocalRowModelOptions {
  readonly locale?: string;
  /**
   * Natural order for text: digits compare as numbers, so "Ürün 2" sorts before
   * "Ürün 10". Default `true`; `false` compares text character by character.
   */
  readonly numeric?: boolean;
  readonly nulls?: NullPlacement;
  /**
   * Keys are column IDs. Custom comparators bypass default type ordering and
   * receive values already read for the column's `type`.
   */
  readonly comparators?: Readonly<Record<string, SortComparator>>;
}

export interface LocalRowModel<TData> {
  getCoreRows(): readonly Row<TData>[];
  getSortedRows(sorting: readonly SortRule[]): readonly Row<TData>[];
  /** Replace core rows and always invalidate, including for the same reference. */
  setRows(rows: readonly Row<TData>[]): void;
  /** Call after changing shared originals or state captured by a callback. */
  invalidate(): void;
}

function rank(value: unknown, field: string): number {
  if (typeof value === 'boolean') return 0;
  if (typeof value === 'number') return 1;
  if (typeof value === 'string') return 2;
  if (value instanceof Date) return 3;
  throw new TypeError(`column "${field}" has an unsupported sort value; provide a custom comparator`);
}

function compareDefault(left: unknown, right: unknown, collator: Intl.Collator, field: string): number {
  const difference = rank(left, field) - rank(right, field);
  if (difference) return difference;
  if (typeof left === 'string' && typeof right === 'string') return collator.compare(left, right);
  const a = left instanceof Date ? left.getTime() : left as number | boolean;
  const b = right instanceof Date ? right.getTime() : right as number | boolean;
  // Relational comparison handles equal infinities without producing NaN.
  return a < b ? -1 : a > b ? 1 : 0;
}

function snapshotRows<TData>(rows: readonly Row<TData>[]): readonly Row<TData>[] {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array from createRows');
  return Object.isFrozen(rows) ? rows : Object.freeze([...rows]);
}

/** Core Rows → Sorted Rows. Pass validated Row wrappers produced by createRows. */
export function createLocalRowModel<TData>(
  rows: readonly Row<TData>[],
  definitions: readonly ColumnDef<TData>[],
  options: LocalRowModelOptions = {},
): LocalRowModel<TData> {
  const columns = new Map(createColumns(definitions).map(column => [column.id, column]));
  const nulls = options.nulls ?? 'last';
  if (nulls !== 'first' && nulls !== 'last') throw new TypeError('nulls must be "first" or "last"');
  const locale = options.locale ?? 'en';
  if (typeof locale !== 'string' || locale.length === 0) throw new TypeError('locale must be a non-empty string');
  const numeric = options.numeric ?? true;
  if (typeof numeric !== 'boolean') throw new TypeError('numeric must be a boolean');
  const collator = new Intl.Collator(locale, { usage: 'sort', numeric });
  const comparators = new Map<string, SortComparator>();
  if (options.comparators !== undefined) {
    if (!options.comparators || typeof options.comparators !== 'object' || Array.isArray(options.comparators)) {
      throw new TypeError('comparators must be a record of column IDs and functions');
    }
    for (const [field, comparator] of Object.entries(options.comparators)) {
      if (!columns.has(field)) throw new Error(`unknown comparator column ID: ${field}`);
      if (typeof comparator !== 'function') throw new TypeError(`comparator for "${field}" must be a function`);
      comparators.set(field, comparator);
    }
  }
  let coreRows = snapshotRows(rows);
  let cache: { sorting: readonly SortRule[]; rows: readonly Row<TData>[] } | undefined;

  return {
    getCoreRows: () => coreRows,
    setRows(nextRows) {
      coreRows = snapshotRows(nextRows);
      cache = undefined;
    },
    invalidate() { cache = undefined; },
    getSortedRows(sorting) {
      if (!Array.isArray(sorting)) throw new TypeError('sorting must be an array');
      const seen = new Set<string>();
      const criteria = Array.from(sorting, rule => {
        if (!rule || typeof rule.field !== 'string' || rule.field.trim().length === 0) {
          throw new TypeError('sort field must be a non-empty column ID');
        }
        const { field, direction } = rule;
        if (direction !== 'asc' && direction !== 'desc') throw new TypeError(`sort direction for "${field}" must be "asc" or "desc"`);
        if (seen.has(field)) throw new Error(`duplicate sort field: ${field}`);
        seen.add(field);
        const column = columns.get(field);
        if (!column) throw new Error(`unknown sort column ID: ${field}`);
        if (!column.enableSorting) throw new Error(`sorting is disabled for column "${field}"`);
        return { field, direction, column, comparator: comparators.get(field) };
      });
      if (cache && criteria.length === cache.sorting.length && criteria.every((rule, i) =>
        rule.field === cache!.sorting[i]!.field && rule.direction === cache!.sorting[i]!.direction)) {
        return cache.rows;
      }
      let result = coreRows;
      if (criteria.length > 0) {
        // Extract each active accessor once per row, not once per comparison.
        const decorated = coreRows.map((row, index) => ({
          row, index,
          values: criteria.map(({ column, comparator, field }) => {
            const raw = column.accessorFn
              ? column.accessorFn(row.original)
              : row.original[column.accessorKey!];
            // Typed columns read text such as "9.50" or "2026-10-23" as their type;
            // values that cannot be read sort like missing values.
            const value = normalizeValue(raw, column.type);
            if (value === undefined || isMissing(value)) return undefined;
            if (!comparator && column.type === undefined) rank(value, field); // Validate even singleton inputs.
            return value;
          }),
        }));
        decorated.sort((left, right) => {
          for (let i = 0; i < criteria.length; i++) {
            const { comparator, direction, field, column } = criteria[i]!;
            const a = left.values[i];
            const b = right.values[i];
            if (a === undefined || b === undefined) {
              if (a === b) continue;
              return (a === undefined ? -1 : 1) * (nulls === 'first' ? 1 : -1);
            }
            const compared = comparator
              ? comparator(a, b)
              : column.type !== undefined
                ? compareNormalized(a, b, column.type, collator)
                : compareDefault(a, b, collator, field);
            if (typeof compared !== 'number' || !Number.isFinite(compared)) {
              throw new TypeError(`comparator for "${field}" must return a finite number`);
            }
            if (compared !== 0) return Math.sign(compared) * (direction === 'asc' ? 1 : -1);
          }
          return left.index - right.index;
        });
        result = Object.freeze(decorated.map(entry => entry.row));
      }
      cache = { sorting: criteria.map(({ field, direction }) => ({ field, direction })), rows: result };
      return result;
    },
  };
}
