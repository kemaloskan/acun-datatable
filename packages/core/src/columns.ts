import { COLUMN_TYPES, type ColumnType } from './values';

interface ColumnBase {
  readonly id: string;
  /** Plain text; rendering belongs to a renderer. */
  readonly header: string;
  readonly enableSorting?: boolean;
  readonly enableFiltering?: boolean;
  /** Whether users may hide the column. Default `true`. */
  readonly enableHiding?: boolean;
  /**
   * How to read this column's values for sorting, filtering, search and display,
   * e.g. `'decimal'` for Laravel decimals sent as `"1250.50"`. Omit to use values
   * as they are.
   */
  readonly type?: ColumnType;
  /**
   * Which columns stay on narrow screens when a renderer collapses rows
   * (responsive `collapse` or `modal`): `1` always, `2` hidden below 640px,
   * `3` hidden below 960px; hidden values move into the row's details.
   * Default: `1` for the first column, `2` for the others.
   */
  readonly priority?: 1 | 2 | 3;
  /**
   * Show the column in a renderer's filter panel (needs `enableFiltering`).
   * `true` picks the control from `type`: text → contains, number/decimal →
   * min–max, date/datetime → from–to, boolean → yes/no. `options` gives a
   * list of values to tick instead.
   */
  readonly filter?: boolean | ColumnFilter;
  /**
   * A footer total over every row matching the filters and search: `sum`,
   * `avg`, `min`, `max` or `count` (server mode: from the server's `totals`).
   */
  readonly aggregate?: 'sum' | 'avg' | 'min' | 'max' | 'count';
  /**
   * Let a renderer edit the cell in place (with its `onEdit` saving it).
   * `true` picks the control from `type`; `options` gives a list to choose from.
   */
  readonly editable?: boolean | ColumnEdit;
}

/** An editable column with fixed choices, e.g. a status. */
export interface ColumnEdit {
  readonly options?: readonly FilterOption[];
}

/** A filter-panel control with fixed choices, e.g. a status. */
export interface ColumnFilter {
  readonly options?: readonly FilterOption[];
}

export interface FilterOption {
  readonly value: string | number | boolean;
  readonly label: string;
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
    const { id, header, accessorKey, accessorFn, enableSorting, enableFiltering, enableHiding, type, priority, filter, aggregate, editable } = definition;
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
    for (const flag of ['enableSorting', 'enableFiltering', 'enableHiding'] as const) {
      if (definition[flag] !== undefined && typeof definition[flag] !== 'boolean') {
        throw new TypeError(`column "${id}".${flag} must be a boolean`);
      }
    }
    if (type !== undefined && !COLUMN_TYPES.includes(type)) {
      throw new TypeError(`column "${id}".type must be one of ${COLUMN_TYPES.join(', ')}`);
    }
    if (priority !== undefined && priority !== 1 && priority !== 2 && priority !== 3) {
      throw new TypeError(`column "${id}".priority must be 1, 2 or 3`);
    }
    if (filter !== undefined && filter !== false) {
      if (filter !== true && (typeof filter !== 'object' || filter === null)) throw new TypeError(`column "${id}".filter must be a boolean or { options }`);
      if (enableFiltering !== true) throw new TypeError(`column "${id}".filter needs enableFiltering`);
      const options = filter === true ? undefined : filter.options;
      if (options !== undefined && (!Array.isArray(options) || options.length === 0 || !options.every(option =>
        option && typeof option.label === 'string' && ['string', 'number', 'boolean'].includes(typeof option.value)))) {
        throw new TypeError(`column "${id}".filter.options must be a non-empty list of { value, label }`);
      }
    }
    if (editable !== undefined && editable !== false) {
      if (editable !== true && (typeof editable !== 'object' || editable === null)) throw new TypeError(`column "${id}".editable must be a boolean or { options }`);
      const options = editable === true ? undefined : editable.options;
      if (options !== undefined && (!Array.isArray(options) || options.length === 0
        || !options.every(option => option && typeof option.label === 'string' && ['string', 'number', 'boolean'].includes(typeof option.value)))) {
        throw new TypeError(`column "${id}".editable.options must be a non-empty list of { value, label }`);
      }
    }
    if (aggregate !== undefined && !['sum', 'avg', 'min', 'max', 'count'].includes(aggregate)) {
      throw new TypeError(`column "${id}".aggregate must be sum, avg, min, max or count`);
    }
    ids.add(id);
    const base = {
      id, header, enableSorting: enableSorting ?? false, enableFiltering: enableFiltering ?? false,
      ...(enableHiding !== undefined ? { enableHiding } : {}),
      ...(type !== undefined ? { type } : {}),
      ...(priority !== undefined ? { priority } : {}),
      ...(aggregate !== undefined ? { aggregate } : {}),
      ...(editable !== undefined && editable !== false
        ? { editable: editable === true ? true : Object.freeze({ ...editable, ...(editable.options ? { options: Object.freeze([...editable.options]) } : {}) }) }
        : {}),
      ...(filter !== undefined && filter !== false ? { filter: filter === true ? true : Object.freeze({ ...filter, ...(filter.options ? { options: Object.freeze([...filter.options]) } : {}) }) } : {}),
    };
    // Validation above establishes the exclusive accessor branch at runtime.
    const copy = 'accessorKey' in definition
      ? { ...base, accessorKey }
      : { ...base, accessorFn };
    columns.push(Object.freeze(copy) as ColumnDef<TData>);
  }
  return Object.freeze(columns);
}
