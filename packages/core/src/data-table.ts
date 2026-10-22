import { createColumns, type ColumnDef } from './columns';
import { filterRows, type FilterRule } from './filtering';
import { createTableState, type SortRule } from './index';
import {
  createLocalRowModel, type LocalRowModelOptions, type NullPlacement, type SortComparator,
} from './local-row-model';
import { paginateRows, type PageView } from './pagination';
import { createRows, type GetRowId, type Row, type RowId, type RowIdValue } from './rows';
import {
  createRowSelection, type SelectionChange, type SelectionMode, type SelectionStatus,
} from './selection';

export interface DataTableInitialState {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sorting?: readonly SortRule[];
  readonly filters?: readonly FilterRule[];
  readonly globalSearch?: string;
  readonly selectedIds?: readonly RowId[];
}

interface DataTableBaseOptions<TData> {
  /** Caller-owned records. They are wrapped, never cloned or mutated. */
  readonly data: readonly TData[];
  readonly columns: readonly ColumnDef<TData>[];
  readonly initialState?: DataTableInitialState;
  /** Default `'multiple'`. */
  readonly selectionMode?: SelectionMode;
  /** Used for sorting, filtering and search. Default `'en'`. */
  readonly locale?: string;
  readonly nulls?: NullPlacement;
  readonly comparators?: Readonly<Record<string, SortComparator>>;
}

/** `getRowId` is optional only when every record has a required string/number `id`. */
export type DataTableOptions<TData> = DataTableBaseOptions<TData> &
  ([TData] extends [{ readonly id: RowIdValue }]
    ? { readonly getRowId?: GetRowId<TData> }
    : { readonly getRowId: GetRowId<TData> });

/** Immutable table snapshot. `page` is always within `[1, pageCount]`. */
export interface DataTableState {
  readonly page: number;
  readonly pageSize: number;
  readonly sorting: readonly Readonly<SortRule>[];
  readonly filters: readonly Readonly<FilterRule>[];
  readonly globalSearch: string;
  readonly selectedIds: readonly RowId[];
}

/** One event per effective action; the snapshot passed alongside is the result. */
export type DataTableEvent =
  | { readonly type: 'page'; readonly page: number }
  | { readonly type: 'pageSize'; readonly pageSize: number }
  | { readonly type: 'sorting'; readonly sorting: readonly Readonly<SortRule>[] }
  | { readonly type: 'filters'; readonly filters: readonly Readonly<FilterRule>[] }
  | { readonly type: 'globalSearch'; readonly globalSearch: string }
  | { readonly type: 'data'; readonly totalRows: number; readonly removedIds: readonly RowId[] }
  | { readonly type: 'selection'; readonly change: Readonly<SelectionChange> };

export type DataTableListener = (state: Readonly<DataTableState>, event: Readonly<DataTableEvent>) => void;

export interface DataTable<TData> {
  getState(): Readonly<DataTableState>;
  getColumns(): readonly ColumnDef<TData>[];
  /** All rows in data order, before sorting and filtering. */
  getCoreRows(): readonly Row<TData>[];
  /** Sorted and filtered rows across every page. */
  getFilteredRows(): readonly Row<TData>[];
  /** The current page of the filtered rows. */
  getPage(): PageView<TData>;
  setData(data: readonly TData[]): void;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  setSorting(sorting: readonly SortRule[]): void;
  setFilters(filters: readonly FilterRule[]): void;
  setGlobalSearch(text: string): void;
  isSelected(id: RowId): boolean;
  /** Defaults to the rows on the current page. */
  getSelectionStatus(ids?: readonly RowId[]): SelectionStatus;
  /** Selected rows that exist in the data, in data order. */
  getSelectedRows(): readonly Row<TData>[];
  selectRow(id: RowId): void;
  deselectRow(id: RowId): void;
  toggleRow(id: RowId): void;
  /** Add every ID (multiple mode only). */
  selectRows(ids: readonly RowId[]): void;
  setSelectedRows(ids: readonly RowId[]): void;
  clearSelection(): void;
  subscribe(listener: DataTableListener): () => void;
  destroy(): void;
}

function sameFilters(left: readonly FilterRule[], right: readonly FilterRule[]): boolean {
  return left.length === right.length && left.every((rule, index) => {
    const other = right[index]!;
    const sameValue = rule.value instanceof Date && other.value instanceof Date
      ? rule.value.getTime() === other.value.getTime()
      : Object.is(rule.value, other.value);
    return rule.field === other.field && rule.operator === other.operator && sameValue;
  });
}

/**
 * Create a local, headless data table: rows → sort → filter/search → page, plus
 * row selection, behind one immutable, subscribable state.
 *
 * Changing sorting, filters, global search or page size returns to page 1, and
 * the page is always kept within the available pages. The selection only holds
 * IDs of rows in the table; `setData` drops IDs whose rows disappeared and
 * reports them in the `data` event. After `destroy`, actions are ignored,
 * `subscribe` returns a no-op and the final state stays readable.
 */
export function createDataTable<TData>(options: DataTableOptions<TData>): DataTable<TData> {
  if (!options || typeof options !== 'object') throw new TypeError('options must be an object');
  const columns = createColumns(options.columns);
  const byId = new Map(columns.map(column => [column.id, column]));
  const getRowId = options.getRowId;
  const toRows = (data: readonly TData[]): readonly Row<TData>[] => getRowId !== undefined
    ? createRows(data, { getRowId })
    : createRows(data as readonly (TData & { readonly id: RowIdValue })[]) as readonly Row<TData>[];

  const locale = options.locale ?? 'en';
  const modelOptions: LocalRowModelOptions = {
    locale,
    ...(options.nulls !== undefined ? { nulls: options.nulls } : {}),
    ...(options.comparators !== undefined ? { comparators: options.comparators } : {}),
  };
  let coreRows = toRows(options.data);
  let rowIds = new Set(coreRows.map(row => row.id));
  const model = createLocalRowModel(coreRows, columns, modelOptions);

  const checkSorting = (sorting: readonly SortRule[]): void => {
    createTableState({ sorting }); // structural validation: fields, directions, duplicates
    for (const { field } of sorting) {
      const column = byId.get(field);
      if (!column) throw new Error(`unknown sort column ID: ${field}`);
      if (!column.enableSorting) throw new Error(`sorting is disabled for column "${field}"`);
    }
  };
  const copyFilters = (filters: readonly FilterRule[]): readonly Readonly<FilterRule>[] => {
    if (!Array.isArray(filters)) throw new TypeError('filters must be an array');
    const copy = Object.freeze(filters.map(rule => (rule && typeof rule === 'object'
      ? Object.freeze({ field: rule.field, operator: rule.operator, value: rule.value })
      : rule)));
    filterRows([], columns, { filters: copy }, { locale }); // validates against the columns
    return copy;
  };
  const checkSearch = (text: unknown): string => {
    if (typeof text !== 'string') throw new TypeError('globalSearch must be a string');
    return text;
  };
  const checkKnown = (ids: readonly RowId[]): void => {
    for (const id of ids) if (typeof id === 'string' && !rowIds.has(id)) throw new Error(`unknown row ID: ${id}`);
  };

  const init = options.initialState ?? {};
  const sorting = init.sorting ?? [];
  checkSorting(sorting);
  const inner = createTableState({
    sorting,
    ...(init.page !== undefined ? { page: init.page } : {}),
    ...(init.pageSize !== undefined ? { pageSize: init.pageSize } : {}),
  });
  let filters = copyFilters(init.filters ?? []);
  let globalSearch = checkSearch(init.globalSearch ?? '');
  const selection = createRowSelection({
    selectedIds: init.selectedIds ?? [],
    ...(options.selectionMode !== undefined ? { mode: options.selectionMode } : {}),
  });
  checkKnown(selection.getState().selectedIds);
  let lastChange: Readonly<SelectionChange> | undefined;
  selection.subscribe((_, change) => { lastChange = change; });

  let filtered: { sorted: readonly Row<TData>[]; filters: unknown; search: string; rows: readonly Row<TData>[] } | undefined;
  const getFilteredRows = (): readonly Row<TData>[] => {
    const sorted = model.getSortedRows(inner.getState().sorting);
    if (filtered && filtered.sorted === sorted && filtered.filters === filters && filtered.search === globalSearch) {
      return filtered.rows;
    }
    const rows = filterRows(sorted, columns, { filters, globalSearch }, { locale });
    filtered = { sorted, filters, search: globalSearch, rows };
    return rows;
  };
  const clampPage = (): void => {
    const { page, pageSize } = inner.getState();
    const total = getFilteredRows().length;
    const pageCount = total === 0 ? 1 : Math.ceil(total / pageSize);
    if (page > pageCount) inner.setPage(pageCount);
  };
  clampPage();

  const snapshot = (): Readonly<DataTableState> => {
    const { page, pageSize, sorting: currentSorting } = inner.getState();
    return Object.freeze({
      page, pageSize, sorting: currentSorting, filters, globalSearch,
      selectedIds: selection.getState().selectedIds,
    });
  };
  let state = snapshot();
  const listeners = new Set<DataTableListener>();
  let destroyed = false;
  const emit = (event: DataTableEvent): void => {
    state = snapshot();
    const frozen = Object.freeze(event);
    for (const listener of [...listeners]) listener(state, frozen);
  };
  const viewChanged = (apply: () => void, event: () => DataTableEvent): void => {
    apply();
    inner.setPage(1);
    emit(event());
  };
  const selecting = (action: () => void): void => {
    if (destroyed) return;
    const before = selection.getState();
    action();
    if (selection.getState() !== before) emit({ type: 'selection', change: lastChange! });
  };

  return {
    getState: () => state,
    getColumns: () => columns,
    getCoreRows: () => coreRows,
    getFilteredRows,
    getPage: () => paginateRows(getFilteredRows(), { page: state.page, pageSize: state.pageSize }),

    setData: (data) => {
      if (destroyed) return;
      const rows = toRows(data);
      coreRows = rows;
      rowIds = new Set(rows.map(row => row.id));
      model.setRows(rows);
      const before = selection.getState();
      selection.retain(rows.map(row => row.id));
      const removedIds = selection.getState() !== before ? lastChange!.removed : Object.freeze([]);
      clampPage();
      emit({ type: 'data', totalRows: rows.length, removedIds });
    },
    setPage: (page) => {
      if (destroyed) return;
      const before = inner.getState().page;
      inner.setPage(page);
      clampPage();
      const after = inner.getState().page;
      if (after !== before) emit({ type: 'page', page: after });
    },
    setPageSize: (pageSize) => {
      if (destroyed) return;
      const before = inner.getState();
      inner.setPageSize(pageSize);
      if (inner.getState().pageSize === before.pageSize) return;
      viewChanged(() => undefined, () => ({ type: 'pageSize', pageSize: inner.getState().pageSize }));
    },
    setSorting: (next) => {
      if (destroyed) return;
      checkSorting(next);
      const before = inner.getState();
      inner.setSorting(next);
      if (inner.getState() === before) return;
      viewChanged(() => undefined, () => ({ type: 'sorting', sorting: inner.getState().sorting }));
    },
    setFilters: (next) => {
      if (destroyed) return;
      const copy = copyFilters(next);
      if (sameFilters(copy, filters)) return;
      viewChanged(() => { filters = copy; }, () => ({ type: 'filters', filters }));
    },
    setGlobalSearch: (text) => {
      if (destroyed) return;
      const next = checkSearch(text);
      if (next === globalSearch) return;
      viewChanged(() => { globalSearch = next; }, () => ({ type: 'globalSearch', globalSearch }));
    },

    isSelected: (id) => selection.isSelected(id),
    getSelectionStatus: (ids) => selection.getStatus(ids ?? paginateRows(getFilteredRows(), state).rows.map(row => row.id)),
    getSelectedRows: () => Object.freeze(coreRows.filter(row => selection.isSelected(row.id))),
    selectRow: (id) => selecting(() => { selection.isSelected(id); checkKnown([id]); selection.select(id); }),
    deselectRow: (id) => selecting(() => selection.deselect(id)),
    toggleRow: (id) => selecting(() => {
      if (!selection.isSelected(id)) checkKnown([id]);
      selection.toggle(id);
    }),
    selectRows: (ids) => selecting(() => { selection.getStatus(ids); checkKnown(ids); selection.selectAll(ids); }),
    setSelectedRows: (ids) => selecting(() => { selection.getStatus(ids); checkKnown(ids); selection.setSelected(ids); }),
    clearSelection: () => selecting(() => selection.clear()),

    subscribe: (listener) => {
      if (destroyed) return () => undefined;
      if (typeof listener !== 'function') throw new TypeError('listener must be a function');
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
      inner.destroy();
      selection.destroy();
    },
  };
}
