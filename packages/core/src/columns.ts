import { COLUMN_TYPES, type ColumnType } from './values';

interface ColumnBase {
  readonly id: string;
  /** Plain text; rendering belongs to a renderer. */
  readonly header: string;
  readonly enableSorting?: boolean;
  readonly enableFiltering?: boolean;
  /**
   * How to read this column's values for sorting, filtering, search and display,
   * e.g. `'decimal'` for Laravel decimals sent as `"1250.50"`. Omit to use values
   * as they are.
   */
  readonly type?: ColumnType;
}

type ValueKey<TData, TValue> = {
  [K in keyof TData]-?: TData[K] extends TValue ? K : never;
}[keyof TData];

/** A data column has exactly one accessor; keys are direct properties, not paths. */
export type ColumnDef<TData, TValue = unknown> = ColumnBase & (
  | { readonly accessorKey: ValueKey<TData, TValue>; readonly accessorFn?: never }
  | { readonly accessorKey?: never; readonly accessorFn: (row: Readonly<TData>) => TValue }
);

/** Validate and freeze copies of definitions without executing their accessors. */
export function createColumns<TData>(
  definitions: readonly ColumnDef<TData>[],
): readonly ColumnDef<TData>[] {
  if (!Array.isArray(definitions)) throw new TypeError('columns must be an array');
  const ids = new Set<string>();
  const columns: ColumnDef<TData>[] = [];
  for (const [index, definition] of definitions.entries()) {
    if (!definition || typeof definition !== 'object') {
      throw new TypeError(`column[${index}] must be an object`);
    }
    const { id, header, accessorKey, accessorFn, enableSorting, enableFiltering, type } = definition;
    if (typeof id !== 'string' || id.trim().length === 0) {
      throw new TypeError(`column[${index}].id must be a non-empty string`);
    }
    if (ids.has(id)) throw new Error(`duplicate column ID: ${id}`);
    if (typeof header !== 'string') throw new TypeError(`column "${id}".header must be a string`);
    if (('accessorKey' in definition) === ('accessorFn' in definition)) {
      throw new TypeError(`column "${id}" must define exactly one of accessorKey or accessorFn`);
    }
    if ('accessorKey' in definition) {
      if (!['string', 'number', 'symbol'].includes(typeof accessorKey) ||
          (typeof accessorKey === 'string' && accessorKey.trim().length === 0) ||
          (typeof accessorKey === 'number' && !Number.isFinite(accessorKey))) {
        throw new TypeError(`column "${id}".accessorKey must be a valid property key`);
      }
    } else if (typeof accessorFn !== 'function') {
      throw new TypeError(`column "${id}".accessorFn must be a function`);
    }
    for (const flag of ['enableSorting', 'enableFiltering'] as const) {
      if (definition[flag] !== undefined && typeof definition[flag] !== 'boolean') {
        throw new TypeError(`column "${id}".${flag} must be a boolean`);
      }
    }
    if (type !== undefined && !COLUMN_TYPES.includes(type)) {
      throw new TypeError(`column "${id}".type must be one of ${COLUMN_TYPES.join(', ')}`);
    }
    ids.add(id);
    const base = {
      id, header, enableSorting: enableSorting ?? false, enableFiltering: enableFiltering ?? false,
      ...(type !== undefined ? { type } : {}),
    };
    // Validation above establishes the exclusive accessor branch at runtime.
    const copy = 'accessorKey' in definition
      ? { ...base, accessorKey }
      : { ...base, accessorFn };
    columns.push(Object.freeze(copy) as ColumnDef<TData>);
  }
  return Object.freeze(columns);
}
