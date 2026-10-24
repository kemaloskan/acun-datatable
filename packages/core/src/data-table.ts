import { createColumns, type ColumnDef } from './columns';
import { createEmitter, type ListenerErrorHandler } from './emitter';
import { copyRuleValue } from './filter-rules';
import { createFilterCache, filterRows, type FilterRule } from './filtering';
import { createTableState, type SortRule } from './state';
import {
  createLocalRowModel, type LocalRowModelOptions, type NullPlacement, type SortComparator,
} from './local-row-model';
import { aggregateRows, type AggregateResult } from './aggregates';
import { normalizeValue } from './values';
import { paginateRows, type PageView } from './pagination';
import { createTableQuery, validatePageResult, type PageResult, type TableQuery } from './remote';
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
  /** Column IDs to hide at first. */
  readonly hiddenColumns?: readonly string[];
  /** Display order of the column IDs; the rest follow in definition order. */
  readonly columnOrder?: readonly string[];
  /** Widths in pixels per column ID. */
  readonly columnWidths?: Readonly<Record<string, number>>;
}

/** The narrowest and widest a column can be made, in pixels. */
export const COLUMN_WIDTH_LIMITS = Object.freeze({ min: 48, max: 2000 });

/** `'local'` transforms rows in memory; `'server'` lets the server do it. */
export type DataTableMode = 'local' | 'server';

interface DataTableBaseOptions<TData> {
  /** Default `'local'`. Fixed for the lifetime of the table. */
  readonly mode?: DataTableMode;
  /**
   * Caller-owned records. They are wrapped, never cloned or mutated. Default `[]`.
   * In server mode, the current page (or nothing until the first response).
   */
  readonly data?: readonly TData[];
  readonly columns: readonly ColumnDef<TData>[];
  readonly initialState?: DataTableInitialState;
  /** Default `'multiple'`. */
  readonly selectionMode?: SelectionMode;
  /** Used for sorting, filtering and search. Default `'en'`. */
  readonly locale?: string;
  /** Local mode only. */
  readonly nulls?: NullPlacement;
  /** Local mode only. */
  readonly comparators?: Readonly<Record<string, SortComparator>>;
  /** Receives errors thrown by listeners; default `reportListenerError`. Actions never fail because of a listener. */
  readonly onListenerError?: ListenerErrorHandler;
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
  /** Hidden column IDs, in column order. Presentation only: not part of the query. */
  readonly hiddenColumns: readonly string[];
  /** Every column ID in display order. Presentation only. */
  readonly columnOrder: readonly string[];
  /** Widths in pixels set by the user (resizing), per column ID. Presentation only. */
  readonly columnWidths: Readonly<Record<string, number>>;
}

/** One event per effective action; the snapshot passed alongside is the result. */
export type DataTableEvent =
  | { readonly type: 'page'; readonly page: number }
  | { readonly type: 'pageSize'; readonly pageSize: number }
  | { readonly type: 'sorting'; readonly sorting: readonly Readonly<SortRule>[] }
  | { readonly type: 'filters'; readonly filters: readonly Readonly<FilterRule>[] }
  | { readonly type: 'globalSearch'; readonly globalSearch: string }
  | { readonly type: 'data'; readonly totalRows: number; readonly removedIds: readonly RowId[] }
  /** Server mode: a page result was applied. `totalRows` is absent when unknown. */
  | { readonly type: 'result'; readonly rows: number; readonly totalRows?: number }
  | { readonly type: 'selection'; readonly change: Readonly<SelectionChange> }
  | { readonly type: 'columnVisibility'; readonly hiddenColumns: readonly string[] }
  | { readonly type: 'columnOrder'; readonly columnOrder: readonly string[] }
  | { readonly type: 'columnWidths'; readonly columnWidths: Readonly<Record<string, number>> };

export type DataTableListener = (state: Readonly<DataTableState>, event: Readonly<DataTableEvent>) => void;

export interface DataTable<TData> {
  getState(): Readonly<DataTableState>;
  getMode(): DataTableMode;
  getSelectionMode(): SelectionMode;
  /** The query a server should answer for the current state. */
  getQuery(): TableQuery;
  /** Matching rows: local count, or the server's `totalRows` (undefined when unknown). */
  getTotalRows(): number | undefined;
  /**
   * Footer totals of the columns with `aggregate`: computed over every row
   * matching the filters and search (local mode) or taken from the server's
   * `totals` (server mode; empty until a result carries them).
   */
  getAggregates(): Readonly<Record<string, AggregateResult>>;
  getColumns(): readonly ColumnDef<TData>[];
  /**
   * The columns to show, in display order (`columnOrder`). Hidden columns
   * still sort, filter and search (as in DataTables); hide them from the view only.
   */
  getVisibleColumns(): readonly ColumnDef<TData>[];
  /** All rows in data order, before sorting and filtering. */
  getCoreRows(): readonly Row<TData>[];
  /** Local: sorted and filtered rows across every page. Server: the current page as received. */
  getFilteredRows(): readonly Row<TData>[];
  /**
   * The current page. In server mode with an unknown total, `totalRows` is a
   * lower bound and `pageCount` adds one page while the page is full.
   */
  getPage(): PageView<TData>;
  /** Local mode only. */
  setData(data: readonly TData[]): void;
  /** Server mode only: apply a response for the current query. */
  setPageResult(result: PageResult<TData>): void;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  setSorting(sorting: readonly SortRule[]): void;
  setFilters(filters: readonly FilterRule[]): void;
  setGlobalSearch(text: string): void;
  /** Show or hide one column. The page and the query do not change. */
  setColumnVisibility(id: string, visible: boolean): void;
  /** Replace the hidden columns. At least one column stays visible. */
  setHiddenColumns(ids: readonly string[]): void;
  /** Set the display order; IDs left out follow in definition order. `[]` restores it. */
  setColumnOrder(ids: readonly string[]): void;
  /** Move one column to a position of the display order (0 = first). */
  moveColumn(id: string, toIndex: number): void;
  /** Set (rounded, within `COLUMN_WIDTH_LIMITS`) or clear (`undefined`) one column's width. */
  setColumnWidth(id: string, width: number | undefined): void;
  /** Replace every width; `{}` returns all columns to their natural width. */
  setColumnWidths(widths: Readonly<Record<string, number>>): void;
  isSelected(id: RowId): boolean;
  /** Defaults to the rows on the current page. */
  getSelectionStatus(ids?: readonly RowId[]): SelectionStatus;
  /** Selected rows that exist in the loaded data, in data order. */
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

function sameValue(left: unknown, right: unknown): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((item, index) => sameValue(item, right[index]));
  }
  return Object.is(left, right);
}

function sameFilters(left: readonly FilterRule[], right: readonly FilterRule[]): boolean {
  return left.length === right.length && left.every((rule, index) => {
    const other = right[index]!;
    return rule.field === other.field && rule.operator === other.operator && sameValue(rule.value, other.value);
  });
}

/**
 * Create a headless data table behind one immutable, subscribable state.
 *
 * Local mode: rows → sort → filter/search → page, in memory. The selection only
 * holds IDs of rows in the table; `setData` drops IDs whose rows disappeared and
 * reports them in the `data` event.
 *
 * Server mode: the state is kept the same way, but no local transform runs; the
 * caller sends `getQuery()` to a server and applies the answer with
 * `setPageResult`. Selection IDs are not checked against the loaded page and are
 * kept across pages.
 *
 * In both modes, changing sorting, filters, global search or page size returns
 * to page 1, and the page is kept within the known pages. After `destroy`,
 * actions are ignored, `subscribe` returns a no-op and the final state stays
 * readable.
 */
export function createDataTable<TData>(options: DataTableOptions<TData>): DataTable<TData> {
  if (!options || typeof options !== 'object') throw new TypeError('options must be an object');
  const mode = options.mode ?? 'local';
  if (mode !== 'local' && mode !== 'server') throw new TypeError('mode must be "local" or "server"');
  const server = mode === 'server';
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
  let coreRows = toRows(options.data ?? []);
  let serverTotal: number | undefined;
  let serverTotals: Readonly<Record<string, string | number | null>> | undefined;
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
    const copy = Object.freeze(filters.map(rule => {
      if (!rule || typeof rule !== 'object') return rule;
      return Object.freeze(rule.value === undefined
        ? { field: rule.field, operator: rule.operator }
        : { field: rule.field, operator: rule.operator, value: copyRuleValue(rule.value) });
    }));
    filterRows([], columns, { filters: copy }, { locale }); // validates against the columns
    return copy;
  };
  const checkSearch = (text: unknown): string => {
    if (typeof text !== 'string') throw new TypeError('globalSearch must be a string');
    return text;
  };
  const checkHidden = (ids: readonly string[]): readonly string[] => {
    if (!Array.isArray(ids)) throw new TypeError('hiddenColumns must be an array');
    const wanted = new Set<string>();
    for (const id of ids) {
      if (typeof id !== 'string') throw new TypeError('hiddenColumns must contain column IDs');
      const column = byId.get(id);
      if (!column) throw new Error(`unknown column ID: ${id}`);
      if (column.enableHiding === false) throw new Error(`hiding is disabled for column "${id}"`);
      if (wanted.has(id)) throw new Error(`duplicate hidden column ID: ${id}`);
      wanted.add(id);
    }
    if (columns.length > 0 && wanted.size === columns.length) throw new RangeError('at least one column must stay visible');
    return Object.freeze(columns.filter(column => wanted.has(column.id)).map(column => column.id));
  };
  const definitionOrder = Object.freeze(columns.map(column => column.id));
  const checkOrder = (ids: readonly string[]): readonly string[] => {
    if (!Array.isArray(ids)) throw new TypeError('columnOrder must be an array');
    const seen = new Set<string>();
    for (const id of ids) {
      if (typeof id !== 'string' || !byId.has(id)) throw new Error(`unknown column ID: ${String(id)}`);
      if (seen.has(id)) throw new Error(`duplicate column ID in columnOrder: ${id}`);
      seen.add(id);
    }
    return Object.freeze([...ids, ...definitionOrder.filter(id => !seen.has(id))]);
  };
  const checkWidth = (id: string, width: unknown): number => {
    if (typeof id !== 'string' || !byId.has(id)) throw new Error(`unknown column ID: ${String(id)}`);
    if (typeof width !== 'number' || !Number.isFinite(width)) throw new TypeError('a column width must be a finite number of pixels');
    return Math.min(COLUMN_WIDTH_LIMITS.max, Math.max(COLUMN_WIDTH_LIMITS.min, Math.round(width)));
  };
  const checkWidths = (widths: Readonly<Record<string, number>>): Readonly<Record<string, number>> => {
    if (!widths || typeof widths !== 'object' || Array.isArray(widths)) throw new TypeError('columnWidths must be an object of pixels per column ID');
    const out: Record<string, number> = {};
    for (const id of definitionOrder) if (Object.hasOwn(widths, id)) out[id] = checkWidth(id, widths[id]);
    for (const id of Object.keys(widths)) if (!byId.has(id)) throw new Error(`unknown column ID: ${id}`);
    return Object.freeze(out);
  };
  const sameWidths = (left: Readonly<Record<string, number>>, right: Readonly<Record<string, number>>): boolean => {
    const keys = Object.keys(left);
    return keys.length === Object.keys(right).length && keys.every(key => left[key] === right[key]);
  };
  const checkKnown = (ids: readonly RowId[]): void => {
    if (server) return; // other pages' rows are not loaded
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
  let hiddenColumns = checkHidden(init.hiddenColumns ?? []);
  let columnOrder = checkOrder(init.columnOrder ?? []);
  let columnWidths = checkWidths(init.columnWidths ?? {});
  let visibleColumns = columns;
  const updateVisible = (): void => {
    visibleColumns = Object.freeze(columnOrder.filter(id => !hiddenColumns.includes(id)).map(id => byId.get(id)!));
  };
  updateVisible();
  const selection = createRowSelection({
    selectedIds: init.selectedIds ?? [],
    ...(options.selectionMode !== undefined ? { mode: options.selectionMode } : {}),
  });
  checkKnown(selection.getState().selectedIds);
  let lastChange: Readonly<SelectionChange> | undefined;
  selection.subscribe((_, change) => { lastChange = change; });

  // Cell values and folded search text, kept per Row wrapper across searches.
  const filterCache = createFilterCache();
  let filtered: { sorted: readonly Row<TData>[]; filters: unknown; search: string; rows: readonly Row<TData>[] } | undefined;
  const getFilteredRows = (): readonly Row<TData>[] => {
    if (server) return coreRows;
    const sorted = model.getSortedRows(inner.getState().sorting);
    if (filtered && filtered.sorted === sorted && filtered.filters === filters && filtered.search === globalSearch) {
      return filtered.rows;
    }
    const rows = filterRows(sorted, columns, { filters, globalSearch }, { locale, cache: filterCache });
    filtered = { sorted, filters, search: globalSearch, rows };
    return rows;
  };
  const clampPage = (): void => {
    const { page, pageSize } = inner.getState();
    const total = server ? serverTotal : getFilteredRows().length;
    if (total === undefined) return;
    const pageCount = total === 0 ? 1 : Math.ceil(total / pageSize);
    if (page > pageCount) inner.setPage(pageCount);
  };
  clampPage();

  const snapshot = (): Readonly<DataTableState> => {
    const { page, pageSize, sorting: currentSorting } = inner.getState();
    return Object.freeze({
      page, pageSize, sorting: currentSorting, filters, globalSearch,
      selectedIds: selection.getState().selectedIds,
      hiddenColumns,
      columnOrder,
      columnWidths,
    });
  };
  let state = snapshot();
  const emitter = createEmitter<[Readonly<DataTableState>, Readonly<DataTableEvent>]>(options.onListenerError);
  let destroyed = false;
  const emit = (event: DataTableEvent): void => {
    state = snapshot();
    // Ordered delivery: an action taken inside a listener is delivered after
    // this event has reached every listener, each with its own snapshot.
    emitter.emit(state, Object.freeze(event));
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

  const table: DataTable<TData> = {
    getState: () => state,
    getColumns: () => columns,
    getVisibleColumns: () => visibleColumns,
    getCoreRows: () => coreRows,
    getFilteredRows,
    getMode: () => mode,
    getSelectionMode: () => selection.getState().mode,
    getQuery: () => createTableQuery(state),
    getTotalRows: () => (server ? serverTotal : getFilteredRows().length),
    getAggregates: () => {
      if (!server) return aggregateRows(getFilteredRows(), columns);
      const out: Record<string, AggregateResult> = {};
      for (const column of columns) {
        if (column.aggregate === undefined || serverTotals === undefined || !(column.id in serverTotals)) continue;
        const raw = serverTotals[column.id];
        const value = raw === null ? undefined
          : column.aggregate === 'count' ? Number(raw)
            : column.type === undefined ? raw : normalizeValue(raw, column.type);
        out[column.id] = Object.freeze({ aggregate: column.aggregate, value });
      }
      return Object.freeze(out);
    },
    getPage: () => {
      if (!server) return paginateRows(getFilteredRows(), { page: state.page, pageSize: state.pageSize });
      const { page, pageSize } = state;
      const known = serverTotal !== undefined;
      const totalRows = known ? serverTotal! : (page - 1) * pageSize + coreRows.length;
      const pageCount = known
        ? Math.max(1, Math.ceil(totalRows / pageSize))
        : page + (coreRows.length === pageSize ? 1 : 0);
      return Object.freeze({ rows: coreRows, page, pageSize, totalRows, pageCount });
    },

    setPageResult: (result) => {
      if (destroyed) return;
      if (!server) throw new Error('setPageResult is only available in server mode; use setData');
      const checked = validatePageResult(result, { pageSize: state.pageSize });
      const rows = toRows(checked.rows as readonly TData[]);
      coreRows = rows;
      rowIds = new Set(rows.map(row => row.id));
      serverTotal = checked.totalRows;
      serverTotals = checked.totals;
      // Make the state consistent first (page within the new total), then tell
      // listeners: every event they receive already has the corrected page.
      const before = inner.getState().page;
      clampPage();
      const after = inner.getState().page;
      emit(serverTotal === undefined
        ? { type: 'result', rows: rows.length }
        : { type: 'result', rows: rows.length, totalRows: serverTotal });
      if (after !== before) emit({ type: 'page', page: after });
    },

    setData: (data) => {
      if (destroyed) return;
      if (server) throw new Error('setData is not available in server mode; use setPageResult');
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

    setColumnVisibility: (id, visible) => {
      if (destroyed) return;
      if (typeof visible !== 'boolean') throw new TypeError('visible must be a boolean');
      if (typeof id !== 'string' || !byId.has(id)) throw new Error(`unknown column ID: ${String(id)}`);
      const others = hiddenColumns.filter(hidden => hidden !== id);
      table.setHiddenColumns(visible ? others : [...others, id]);
    },
    setHiddenColumns: (ids) => {
      if (destroyed) return;
      const next = checkHidden(ids);
      if (next.length === hiddenColumns.length && next.every((id, index) => id === hiddenColumns[index])) return;
      hiddenColumns = next;
      updateVisible();
      emit({ type: 'columnVisibility', hiddenColumns });
    },
    setColumnOrder: (ids) => {
      if (destroyed) return;
      const next = checkOrder(ids);
      if (next.every((id, index) => id === columnOrder[index])) return;
      columnOrder = next;
      updateVisible();
      emit({ type: 'columnOrder', columnOrder });
    },
    moveColumn: (id, toIndex) => {
      if (destroyed) return;
      if (typeof id !== 'string' || !byId.has(id)) throw new Error(`unknown column ID: ${String(id)}`);
      if (!Number.isInteger(toIndex)) throw new TypeError('toIndex must be a whole number');
      const rest = columnOrder.filter(other => other !== id);
      const index = Math.max(0, Math.min(rest.length, toIndex));
      table.setColumnOrder([...rest.slice(0, index), id, ...rest.slice(index)]);
    },
    setColumnWidth: (id, width) => {
      if (destroyed) return;
      if (width === undefined) {
        if (typeof id !== 'string' || !byId.has(id)) throw new Error(`unknown column ID: ${String(id)}`);
        const { [id]: _removed, ...rest } = columnWidths;
        table.setColumnWidths(rest);
        return;
      }
      table.setColumnWidths({ ...columnWidths, [id]: checkWidth(id, width) });
    },
    setColumnWidths: (widths) => {
      if (destroyed) return;
      const next = checkWidths(widths);
      if (sameWidths(next, columnWidths)) return;
      columnWidths = next;
      emit({ type: 'columnWidths', columnWidths });
    },

    isSelected: (id) => selection.isSelected(id),
    getSelectionStatus: (ids) => selection.getStatus(ids ?? table.getPage().rows.map(row => row.id)),
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
      return emitter.subscribe(listener);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      emitter.clear();
      inner.destroy();
      selection.destroy();
    },
  };
  return table;
}
