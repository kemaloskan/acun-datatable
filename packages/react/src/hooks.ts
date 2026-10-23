import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  createDataTable, type ColumnDef, type DataTable, type DataTableOptions, type DataTableState, type PageView,
} from '@acunsoft/datatable-core';

/** What the hooks return; recomputed on every table event. */
export interface TableView<TData> {
  readonly table: DataTable<TData>;
  readonly state: Readonly<DataTableState>;
  readonly page: PageView<TData>;
  readonly visibleColumns: readonly ColumnDef<TData>[];
  /** Undefined in server mode while the server has not reported a total. */
  readonly totalRows: number | undefined;
}

/**
 * Follow an existing table: re-renders on every table event (with
 * `useSyncExternalStore`, so concurrent rendering never sees torn state).
 */
export function useTable<TData>(table: DataTable<TData>): TableView<TData> {
  const state = useSyncExternalStore(table.subscribe, table.getState, table.getState);
  return {
    table,
    state,
    page: table.getPage(),
    visibleColumns: table.getVisibleColumns(),
    totalRows: table.getTotalRows(),
  };
}

/**
 * Create a table once for a component and follow it:
 * `const { table, page } = useDataTable({ data, columns })`.
 *
 * Options are read once, except `data`: passing a new array (local mode)
 * replaces the rows with `setData`; records are never copied. The table only
 * holds listeners, which React removes on unmount, so it is not destroyed
 * explicitly (that keeps Strict Mode's double mount safe).
 */
export function useDataTable<TData>(options: DataTableOptions<TData>): TableView<TData> {
  const [table] = useState(() => createDataTable<TData>(options));
  const data = options.data;
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    if (table.getMode() === 'local') table.setData(data ?? []);
  }, [table, data]);
  return useTable(table);
}
