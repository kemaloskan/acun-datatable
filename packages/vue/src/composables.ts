import {
  computed, getCurrentScope, onScopeDispose, shallowRef, toValue, watch,
  type ComputedRef, type MaybeRefOrGetter, type ShallowRef,
} from 'vue';
import {
  createDataTable, type ColumnDef, type DataTable, type DataTableOptions, type DataTableState, type PageView,
} from '@acunsoft/datatable-core';

/** Reactive views of a table. Everything updates when the table emits. */
export interface TableBinding<TData> {
  readonly table: DataTable<TData>;
  /** The latest immutable snapshot. */
  readonly state: Readonly<ShallowRef<Readonly<DataTableState>>>;
  readonly page: ComputedRef<PageView<TData>>;
  readonly visibleColumns: ComputedRef<readonly ColumnDef<TData>[]>;
  /** Undefined in server mode while the server has not reported a total. */
  readonly totalRows: ComputedRef<number | undefined>;
}

/**
 * Follow an existing table reactively. Unsubscribes when the calling
 * component (or effect scope) is disposed; the table itself is not destroyed.
 */
export function useTable<TData>(table: DataTable<TData>): TableBinding<TData> {
  const state = shallowRef(table.getState());
  const version = shallowRef(0);
  const unsubscribe = table.subscribe(next => {
    state.value = next;
    version.value += 1; // data and results change without a new state object
  });
  if (getCurrentScope()) onScopeDispose(unsubscribe);
  const track = <T>(read: () => T): ComputedRef<T> => computed(() => {
    void version.value;
    void state.value;
    return read();
  });
  return {
    table,
    state,
    page: track(() => table.getPage()),
    visibleColumns: track(() => table.getVisibleColumns()),
    totalRows: track(() => table.getTotalRows()),
  };
}

export type UseDataTableOptions<TData> = Omit<DataTableOptions<TData>, 'data'> & {
  /**
   * Local mode: the records, as a value, ref or getter. A new array (or a new
   * ref value) replaces the data with `setData`; records are never copied.
   */
  readonly data?: MaybeRefOrGetter<readonly TData[]>;
};

/**
 * Create a table for a component: `const { table, page, state } = useDataTable({ data, columns })`.
 * The table is destroyed with the component (effect scope).
 */
export function useDataTable<TData>(options: UseDataTableOptions<TData>): TableBinding<TData> {
  const { data, ...rest } = options;
  const table = createDataTable<TData>({ ...rest, data: toValue(data) ?? [] } as DataTableOptions<TData>);
  const binding = useTable(table);
  if (data !== undefined && !Array.isArray(data)) { // a ref or a getter: follow it
    const stop = watch(() => toValue(data), next => table.setData(next ?? []));
    if (getCurrentScope()) onScopeDispose(stop);
  }
  if (getCurrentScope()) onScopeDispose(() => table.destroy());
  return binding;
}
