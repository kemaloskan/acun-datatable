import {
  createDataTable, persistState, type Aggregate, type ColumnDef, type PageResult, type TableQuery, type ColumnType, type DataTable, type DataTableListener, type FilterOption, type Row, type SortRule,
} from '@acunsoft/datatable-core';
import {
  DEFAULT_LAYOUT, downloadFile, el, printTable, renderDataTable, resolveLabels,
  type BulkAction, type CellFormatter, type CellRenderer, type DataTableLabels, type DataTableLayout, type LayoutSlot,
  type MenuItem, type RenderedComponent, type ResponsiveMode, type RowAction, type StatusSource, type TableSize,
} from '@acunsoft/datatable-dom';
import { tableToSheet, toCsv, toXlsx, type Sheet } from '@acunsoft/datatable-export';
import { connectTable, createHttpDataSource, createQueryRunner, type QueryRunner } from '@acunsoft/datatable-http';

type Data = Record<string, unknown>;

/** A column in the DataTables style: the field of a row and its title. */
export interface ColumnOptions {
  /** The field of a row object (DataTables `data`); also the column ID sent to a server. */
  readonly data: string;
  /** Header text. Default: the field, made readable (`created_at` → `Created at`). */
  readonly title?: string;
  readonly type?: ColumnType;
  /** Default: `true` while `sorting` is enabled. */
  readonly sortable?: boolean;
  /** Part of the global search and filters. Default `true`. */
  readonly searchable?: boolean;
  /** `false` starts the column hidden (the column menu can show it). */
  readonly visible?: boolean;
  /** `false` keeps the column out of the column menu's hide options. */
  readonly hideable?: boolean;
  /** Narrow screens with `responsive` `collapse` / `modal`: 1 always, 2 below 640px, 3 below 960px. */
  readonly priority?: 1 | 2 | 3;
  /**
   * Cell text from the value (always shown as text, never as HTML). Also
   * formats the column's footer total, with `row` `undefined`.
   */
  readonly render?: (value: unknown, row: Data | undefined) => string;
  /**
   * Put the column in the filter panel: `true` picks the control from `type`
   * (text, min–max, from–to, yes/no), a list of `{ value, label }` gives
   * choices to tick.
   */
  readonly filter?: boolean | readonly FilterOption[];
  /**
   * Draw the cell yourself: return a DOM node (e.g. `el('span', { class: 'badge' }, text)`)
   * or a string (shown as text). Never parsed as HTML; sorting, search and
   * exports keep the value.
   */
  readonly cell?: (value: unknown, row: Data, text: string) => Node | string;
  /**
   * A footer total over every matching row (not just the page): `'sum'`,
   * `'avg'`, `'min'`, `'max'` or `'count'`. Server side the answer's `totals`
   * gives it (the Laravel adapter's `Column::aggregate()` sends them).
   */
  readonly aggregate?: Aggregate;
}

/** Built-in buttons of the tools menu (DataTables `buttons`). */
export type ButtonName = 'excel' | 'csv' | 'copy' | 'print';

export interface AjaxOptions {
  readonly url: string;
  /** `'GET'` (default) or `'POST'`; POST sends Laravel's `<meta name="csrf-token">` automatically. */
  readonly method?: 'GET' | 'POST';
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  readonly credentials?: RequestCredentials;
  /**
   * Where the rows are in the response (DataTables `dataSrc`): a key such as
   * `'data'`, or a function returning the rows (client side) or
   * `{ rows, totalRows }` (server side). Default: an array, `rows`, `data`,
   * Laravel's paginator or DataTables' `recordsFiltered` are understood.
   */
  readonly dataSrc?: string | ((json: unknown) => unknown);
}

export interface AcunDataTableOptions {
  /** Columns; default: the `<thead>` of a target table, else the fields of the first row. */
  readonly columns?: readonly (ColumnOptions | ColumnDef<Data>)[];
  /** Rows in the browser (client side). */
  readonly data?: readonly Data[];
  /** Load rows from a URL: once (client side) or page by page with `serverSide: true`. */
  readonly ajax?: string | AjaxOptions;
  /** The server sorts, filters and pages (DataTables `serverSide`). Needs `ajax`. */
  readonly serverSide?: boolean;
  /** Show a loading state while data loads (DataTables `processing`). Default `true`. */
  readonly processing?: boolean;
  /**
   * Placeholder rows that shimmer while the first rows load (needs
   * `processing` and known `columns`). Default `true`.
   */
  readonly skeleton?: boolean;
  /** The row's unique field. Default `'id'` when rows have one. */
  readonly rowId?: string | ((row: Data) => string | number);
  readonly pagination?: boolean | {
    readonly enabled?: boolean;
    /** Rows per page at the start. Default 25 (or the first of `pageSizes`). */
    readonly pageSize?: number;
    /** Choices of the rows-per-page select. Default `[10, 25, 50, 100]`. */
    readonly pageSizes?: readonly number[];
    readonly siblings?: number;
    readonly boundaries?: number;
    /** Also show « and ». */
    readonly firstLast?: boolean;
  };
  readonly sorting?: boolean | {
    readonly enabled?: boolean;
    /** Shift+click adds a second sort column. Default `true`. */
    readonly multiSort?: boolean;
    /** Sorting at the start (DataTables `order`), e.g. `[{ field: 'total', direction: 'desc' }]`. */
    readonly initial?: readonly SortRule[];
  };
  readonly searching?: boolean | {
    readonly enabled?: boolean;
    /** Delay before typing searches, in ms. Default 250. */
    readonly debounce?: number;
    readonly placeholder?: string;
    /** Search text at the start. */
    readonly initial?: string;
  };
  /** `'en'` (default), `'tr'`, `'de'`, `'fr'` or `'es'`: texts, numbers and dates. */
  readonly language?: string;
  /** Change single texts. */
  readonly labels?: Partial<DataTableLabels>;
  /** Keep the header at the top of the window while the page scrolls (DataTables `fixedHeader`). */
  readonly fixedHeader?: boolean;
  /** A fixed height to scroll inside, header in place (DataTables `scrollY`): `'60vh'`, `480`. */
  readonly scrollY?: string | number;
  /** Narrow screens: `cards` (default), `scroll`, `collapse` or `modal`. */
  readonly responsive?: ResponsiveMode;
  readonly size?: TableSize;
  readonly caption?: string;
  /** Checkboxes to select rows. */
  readonly selectable?: boolean;
  readonly rowActions?: readonly RowAction<Data>[];
  readonly bulkActions?: readonly BulkAction<Data>[];
  /**
   * A child row under each row (DataTables child rows), opened by a ⊕
   * button: return a DOM node (`el()`), text, or a promise of either, e.g.
   * `row => fetch('/orders/' + row.id + '/lines').then(…)` (shows "Loading…"
   * meanwhile). With `responsive: 'modal'` it opens in the dialog.
   */
  readonly detail?: (row: Data) => Node | string | null | undefined | Promise<Node | string | null | undefined>;
  /** Show the column menu. Default `true`. */
  readonly columnToggle?: boolean;
  /**
   * The tools menu (DataTables `buttons`): `'excel'`, `'csv'`, `'copy'`,
   * `'print'` and your own `{ id, label, onSelect }`. Exports take the
   * selected rows, else every row matching the search and filters (server
   * side: fetched page by page up to `exportLimit`).
   */
  readonly buttons?: readonly (ButtonName | MenuItem)[];
  /** File name of exports, without extension. Default `'export'`. */
  readonly exportFilename?: string;
  /** Server side: the most rows an export fetches. Default 10,000. */
  readonly exportLimit?: number;
  /**
   * Remember page, page size, sorting, filters, search and hidden columns
   * across reloads (DataTables `stateSave`). `true` keys it by the page path
   * and the element's ID; `{ key, storage: 'session' }` to choose.
   */
  readonly stateSave?: boolean | { readonly key?: string; readonly storage?: 'local' | 'session' };
  /** Place the controls yourself; merged over the layout the options above give. */
  readonly layout?: DataTableLayout;
}

/**
 * A complete data table in one call, in the spirit of DataTables:
 *
 * ```js
 * new AcunDataTable('#orders', { serverSide: true, ajax: { url: '/api/orders', method: 'POST' }, fixedHeader: true });
 * ```
 *
 * The target is a container or an existing `<table>`: its `<thead>` gives
 * the columns (`<th data-column="total">` names the field) and, without
 * `data` or `ajax`, its `<tbody>` gives the rows. `ready` resolves once the
 * first rows are shown.
 */
export class AcunDataTable {
  /** The headless table (`@acunsoft/datatable-core`); undefined until `ready` when columns come from the server. */
  table: DataTable<Data> | undefined;
  /** Resolves when the table is rendered with its first rows; rejects if they cannot be loaded. */
  readonly ready: Promise<void>;
  readonly element: HTMLElement;

  #options: AcunDataTableOptions;
  #original: HTMLTableElement | undefined;
  #rendered: RenderedComponent | undefined;
  #runner: QueryRunner<Data> | undefined;
  #source: ReturnType<typeof createHttpDataSource<Data>> | undefined;
  #disconnect: (() => void) | undefined;
  #loader: ReturnType<typeof loadState> | undefined;
  #destroyed = false;
  #listeners = new Set<DataTableListener>();
  #unsubscribe: (() => void) | undefined;
  #stopSaving: (() => void) | undefined;

  constructor(target: string | HTMLElement, options: AcunDataTableOptions = {}) {
    const node = typeof target === 'string' ? document.querySelector<HTMLElement>(target) : target;
    if (!node) throw new TypeError(`AcunDataTable: no element matches ${String(target)}`);
    if (options.serverSide && !options.ajax) throw new TypeError('AcunDataTable: serverSide needs ajax');
    if (options.serverSide && enabled(options.pagination) === false) {
      throw new RangeError('AcunDataTable: pagination cannot be turned off with serverSide');
    }
    this.#options = options;

    // An existing <table> is read, then replaced by the rendered table (and restored by destroy()).
    let columns = options.columns ? options.columns.map(column => toColumnDef(column, options)) : undefined;
    let rows = options.data ? [...options.data] : undefined;
    if (node instanceof HTMLTableElement) {
      const read = readTable(node, options);
      columns ??= read.columns;
      if (!options.ajax) rows ??= read.rows;
      this.#original = node;
      this.element = node.ownerDocument.createElement('div');
      this.element.className = 'acun-datatable';
      node.replaceWith(this.element);
    } else {
      this.element = node;
    }

    this.ready = this.#start(columns, rows).catch(error => {
      if (!this.#destroyed) {
        this.#loader?.fail(error);
        if (!this.table) this.#pending(true); // failed before the columns were known
      }
      throw error;
    });
    this.ready.catch(() => undefined); // reported through the loading state; callers may still await it
  }

  async #start(columns: ColumnDef<Data>[] | undefined, rows: Data[] | undefined): Promise<void> {
    const options = this.#options;
    const ajax = typeof options.ajax === 'string' ? { url: options.ajax } : options.ajax;

    if (ajax && options.serverSide) {
      const source = createHttpDataSource<Data>({
        url: ajax.url,
        method: ajax.method ?? 'GET',
        headers: requestHeaders(ajax),
        parseResponse: body => serverRows(body, ajax.dataSrc),
        maxPageSize: 1000,
        ...(ajax.credentials ? { credentials: ajax.credentials } : {}),
      });
      let primed: PageResult<Data> | undefined;
      let primedQuery = '';
      if (!columns) {
        // No column list: the fields of the first row. The table's first request reuses this page.
        this.#pending();
        const query = firstQuery(options);
        primed = await source.getPage(query);
        primedQuery = queryKey(query);
        columns = inferColumns(primed.rows[0], options);
      }
      if (this.#destroyed) return;
      this.#source = source;
      const table = this.#createTable('server', columns, undefined);
      this.#runner = createQueryRunner<Data>({
        getPage: (query, request) => {
          if (primed && queryKey(query) === primedQuery) {
            const page = primed;
            primed = undefined;
            return Promise.resolve(page);
          }
          primed = undefined;
          return source.getPage(query, request);
        },
      });
      this.#mount(table, options.processing === false ? undefined : this.#runner);
      this.#disconnect = connectTable(table, this.#runner);
      await settled(this.#runner);
      if (this.#runner.getState().status === 'error') throw this.#runner.getState().error;
      return;
    }

    if (ajax) {
      // Client side: load every row once, then sort, search and page in the browser.
      this.#loader = loadState(() => this.reload());
      if (!columns) this.#pending();
      if (columns) this.#mount(this.#createTable('local', columns, []), options.processing === false ? undefined : this.#loader);
      const data = await this.#fetchAll(ajax);
      if (this.#destroyed) return;
      if (!this.table) this.#mount(this.#createTable('local', columns ?? inferColumns(data[0], options), []), options.processing === false ? undefined : this.#loader);
      this.#setData(data);
      this.#loader.done();
      return;
    }

    this.#mount(this.#createTable('local', columns ?? inferColumns(rows?.[0], options), []), undefined);
    this.#setData(rows ?? []);
  }

  async #fetchAll(ajax: AjaxOptions): Promise<Data[]> {
    this.#loader?.start();
    const response = await fetch(ajax.url, {
      method: ajax.method ?? 'GET',
      headers: await resolveHeaders(requestHeaders(ajax)),
      ...(ajax.credentials ? { credentials: ajax.credentials } : {}),
    });
    if (!response.ok) throw new Error(`AcunDataTable: ${ajax.url} answered ${response.status} ${response.statusText}`);
    const json: unknown = await response.json();
    const data = typeof ajax.dataSrc === 'function' ? ajax.dataSrc(json)
      : typeof ajax.dataSrc === 'string' ? (json as Data)?.[ajax.dataSrc]
        : Array.isArray(json) ? json : (json as Data)?.['data'] ?? (json as Data)?.['rows'];
    if (!Array.isArray(data)) throw new TypeError(`AcunDataTable: no rows in the response of ${ajax.url}; set ajax.dataSrc`);
    return data as Data[];
  }

  #createTable(mode: 'local' | 'server', columns: ColumnDef<Data>[], data: Data[] | undefined): DataTable<Data> {
    const options = this.#options;
    const sorting = typeof options.sorting === 'object' ? options.sorting : {};
    const searching = typeof options.searching === 'object' ? options.searching : {};
    const hidden = (options.columns ?? [])
      .filter((column): column is ColumnOptions => 'data' in column && column.visible === false)
      .map(column => column.data);
    const rowId = options.rowId ?? (columns.some(column => column.id === 'id') ? 'id' : undefined);
    const fallback = new WeakMap<object, string>();
    let next = 0;
    const table = createDataTable<Data>({
      mode,
      columns,
      ...(mode === 'local' ? { data: data ?? [] } : {}),
      locale: options.language ?? 'en',
      getRowId: row => {
        if (typeof rowId === 'function') return rowId(row);
        const value = rowId === undefined ? undefined : row[rowId];
        if (typeof value === 'string' || typeof value === 'number') return value;
        // No ID field: a stable ID per row object (selection then lasts while the rows do).
        let id = fallback.get(row);
        if (id === undefined) fallback.set(row, id = `row-${++next}`);
        return id;
      },
      initialState: {
        pageSize: pageSizeOf(options),
        ...(sorting.initial ? { sorting: sorting.initial } : {}),
        ...(searching.initial ? { globalSearch: searching.initial } : {}),
        ...(hidden.length > 0 ? { hiddenColumns: hidden } : {}),
      },
    } as Parameters<typeof createDataTable<Data>>[0]);
    this.table = table;
    this.#unsubscribe = table.subscribe((state, event) => this.#listeners.forEach(listener => listener(state, event)));
    if (options.stateSave) {
      const config = typeof options.stateSave === 'object' ? options.stateSave : {};
      const key = config.key ?? `${location.pathname}#${this.#original?.id || this.element.id || 'table'}`;
      try {
        const storage = config.storage === 'session' ? sessionStorage : localStorage;
        this.#stopSaving = persistState(table, { key, storage });
      } catch {
        // storage blocked (private mode, sandboxed frame): the table works without it
      }
    }
    return table;
  }

  /**
   * Before the columns are known (no `columns`, rows still loading): a
   * loading notice over placeholder rows, or the error if the load failed.
   */
  #pending(failed = false): void {
    const options = this.#options;
    if (options.processing === false) return;
    const labels = resolveLabels(options.language, options.labels);
    const notice = el('div', { class: 'adt-notice', role: failed ? 'alert' : 'status' }, el('span', { class: 'adt-notice-text' }, failed ? labels.error : labels.loading));
    const rows = failed || options.skeleton === false ? [] : Array.from({ length: Math.min(pageSizeOf(options), 10) }, () =>
      el('tr', { class: 'adt-row adt-skeleton-row' }, ...Array.from({ length: 4 }, () => el('td', {}, el('span', { class: 'adt-skeleton' })))));
    const wrap = el('div', { class: `adt-table-wrap${rows.length > 0 ? ' adt-skeleton-on' : ''}`, 'aria-busy': failed ? 'false' : 'true' },
      notice, ...(rows.length > 0 ? [el('div', { class: 'adt-scroll' }, el('table', { class: 'adt-table' }, el('tbody', { 'aria-hidden': 'true' }, ...rows)))] : []));
    this.element.replaceChildren(el('div', { class: 'adt' }, wrap));
  }

  #mount(table: DataTable<Data>, status: StatusSource | undefined): void {
    const options = this.#options;
    const pagination = typeof options.pagination === 'object' ? options.pagination : {};
    const sorting = typeof options.sorting === 'object' ? options.sorting : {};
    const searching = typeof options.searching === 'object' ? options.searching : {};
    const format: Record<string, CellFormatter<Data>> = {};
    const cells: Record<string, CellRenderer<Data>> = {};
    for (const column of options.columns ?? []) {
      if ('data' in column && column.render) {
        const render = column.render;
        // A footer total has no row: render gets `undefined` (see ColumnOptions.render).
        format[column.data] = (value, row: Row<Data> | undefined) => render(value, row?.original);
      }
      if ('data' in column && column.cell) {
        const cell = column.cell;
        cells[column.data] = ({ value, row, text }) => cell(value, row.original, text);
      }
    }
    const labels = resolveLabels(options.language, options.labels);
    const drop = (slot: LayoutSlot | undefined, names: readonly string[]): LayoutSlot => {
      const list = slot === null || slot === undefined ? [] : Array.isArray(slot) ? slot : [slot];
      return list.filter(feature => typeof feature === 'function' || !names.includes(feature as string));
    };
    const off = [
      ...(enabled(options.pagination) === false ? ['pageSize', 'paging'] : []),
      ...(enabled(options.searching) === false ? ['search'] : []),
      ...(options.columnToggle === false ? ['columns'] : []),
    ];
    const layout: DataTableLayout = {
      topStart: drop(DEFAULT_LAYOUT.topStart, off),
      topEnd: drop(DEFAULT_LAYOUT.topEnd, off),
      bottomStart: drop(DEFAULT_LAYOUT.bottomStart, off),
      bottomEnd: drop(DEFAULT_LAYOUT.bottomEnd, off),
      ...options.layout,
    };
    this.#rendered?.destroy();
    this.#rendered = renderDataTable(this.element, table, {
      locale: options.language ?? 'en',
      labels,
      layout,
      tools: this.#tools(labels),
      ...(Object.keys(cells).length > 0 ? { cells } : {}),
      ...(pagination.pageSizes ? { pageSizes: pagination.pageSizes } : {}),
      paging: {
        ...(pagination.siblings !== undefined ? { siblings: pagination.siblings } : {}),
        ...(pagination.boundaries !== undefined ? { boundaries: pagination.boundaries } : {}),
        ...(pagination.firstLast !== undefined ? { firstLast: pagination.firstLast } : {}),
      },
      search: {
        ...(searching.debounce !== undefined ? { debounceMs: searching.debounce } : {}),
        ...(searching.placeholder !== undefined ? { placeholder: searching.placeholder } : {}),
      },
      ...(Object.keys(format).length > 0 ? { format } : {}),
      ...(options.caption !== undefined ? { caption: options.caption } : {}),
      ...(options.selectable ? { selectable: true } : {}),
      ...(options.rowActions ? { rowActions: options.rowActions } : {}),
      ...(options.bulkActions ? { bulkActions: options.bulkActions } : {}),
      ...(options.detail ? { detail: (row: Row<Data>) => options.detail!(row.original) } : {}),
      ...(options.responsive ? { responsive: options.responsive } : {}),
      ...(options.size ? { size: options.size } : {}),
      ...(options.fixedHeader ? { stickyHeader: true } : {}),
      ...(options.scrollY !== undefined ? { scrollY: options.scrollY } : {}),
      ...(sorting.multiSort === false ? { multiSort: false } : {}),
      ...(status ? { status } : {}),
      ...(options.skeleton === false ? { skeleton: false } : {}),
    });
  }

  /** The tools menu items for `buttons`. */
  #tools(labels: DataTableLabels): MenuItem[] {
    const name = this.#options.exportFilename ?? 'export';
    return (this.#options.buttons ?? []).map(button => {
      if (typeof button !== 'string') return button;
      switch (button) {
        case 'excel':
          return { id: 'excel', label: labels.exportExcel, group: labels.export, onSelect: async () => { downloadFile(toXlsx(await this.#sheet()), `${name}.xlsx`); } };
        case 'csv':
          return {
            id: 'csv', label: labels.exportCsv, group: labels.export,
            onSelect: async () => { downloadFile(toCsv(await this.#sheet(), { delimiter: this.#options.language === 'tr' ? ';' : ',' }), `${name}.csv`); },
          };
        case 'copy':
          return {
            id: 'copy', label: labels.copy, group: labels.export,
            onSelect: async () => {
              const sheet = await this.#sheet();
              await navigator.clipboard.writeText(toCsv(sheet, { delimiter: '\t', bom: false, newline: '\n' }));
              return labels.copied(sheet.rows.length);
            },
          };
        case 'print':
          return { id: 'print', label: labels.print, onSelect: () => printTable() };
        default:
          throw new TypeError(`AcunDataTable: unknown button "${String(button)}"`);
      }
    });
  }

  /** The rows to export: the selection, else every matching row (server side: fetched page by page). */
  async #sheet(): Promise<Sheet> {
    const table = this.table;
    if (!table) throw new Error('AcunDataTable: not ready');
    if (table.getState().selectedIds.length > 0 || !this.#source) {
      return tableToSheet(table, { rows: table.getState().selectedIds.length > 0 ? 'selected' : 'all' });
    }
    const limit = this.#options.exportLimit ?? 10_000;
    const labels = resolveLabels(this.#options.language, this.#options.labels);
    const query = table.getQuery();
    const rows: Data[] = [];
    for (let page = 1; ; page++) {
      const result = await this.#source.getPage({ ...query, page, pageSize: 1000 });
      if (result.totalRows !== undefined && result.totalRows > limit) throw new Error(labels.exportTooLarge(limit));
      rows.push(...result.rows);
      if (rows.length > limit) throw new Error(labels.exportTooLarge(limit));
      if (result.rows.length < 1000) break;
    }
    // A local copy in the server's order, with the same visible columns.
    const copy = createDataTable<Data>({
      data: rows, columns: table.getColumns(), locale: this.#options.language ?? 'en',
      getRowId: (() => { const ids = new WeakMap<object, number>(); let next = 0; return (row: Data) => { if (!ids.has(row)) ids.set(row, ++next); return ids.get(row)!; }; })(),
      initialState: { hiddenColumns: [...table.getState().hiddenColumns] },
    } as Parameters<typeof createDataTable<Data>>[0]);
    try {
      return tableToSheet(copy, { rows: 'all' });
    } finally {
      copy.destroy();
    }
  }

  #setData(rows: Data[]): void {
    if (!this.table) return;
    // Pagination off: one page with every row (the core allows up to 1000 per page).
    if (enabled(this.#options.pagination) === false) this.table.setPageSize(Math.min(1000, Math.max(1, rows.length)));
    this.table.setData(rows);
  }

  /** Load the rows again: the current page from the server, or every row from `ajax`. */
  async reload(): Promise<void> {
    if (this.#runner) return this.#runner.retry();
    const ajax = typeof this.#options.ajax === 'string' ? { url: this.#options.ajax } : this.#options.ajax;
    if (!ajax) return;
    try {
      this.#setData(await this.#fetchAll(ajax));
      this.#loader?.done();
    } catch (error) {
      this.#loader?.fail(error);
      throw error;
    }
  }

  /** Search every searchable column (smart search: all words, "quoted phrases"). */
  search(text: string): void { this.table?.setGlobalSearch(text); }
  /** Go to a page (1-based). */
  page(page: number): void { this.table?.setPage(page); }
  pageSize(size: number): void { this.table?.setPageSize(size); }
  /** Sort, e.g. `order([{ field: 'total', direction: 'desc' }])`. */
  order(rules: readonly SortRule[]): void { this.table?.setSorting(rules); }
  /** The selected rows on hand (on the current page in server mode). */
  selectedRows(): readonly Data[] { return this.table?.getSelectedRows().map(row => row.original) ?? []; }
  /** Listen to every change (page, sorting, search, selection, new rows); returns `off`. */
  on(listener: DataTableListener): () => void {
    this.#listeners.add(listener);
    return () => this.#listeners.delete(listener);
  }

  /** Remove the table, stop requests and put back an original `<table>`. */
  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#disconnect?.();
    this.#runner?.cancel();
    this.#unsubscribe?.();
    this.#stopSaving?.();
    this.#rendered?.destroy();
    this.table?.destroy();
    this.#listeners.clear();
    if (this.#original) this.element.replaceWith(this.#original);
  }
}

/** `true`, `false` or `undefined` (not set) for a boolean-or-object option. */
function enabled(option: boolean | { readonly enabled?: boolean } | undefined): boolean | undefined {
  return typeof option === 'boolean' ? option : option?.enabled;
}

/** The first query of a server table, before stateSave or the user change anything. */
function firstQuery(options: AcunDataTableOptions): TableQuery {
  const sorting = typeof options.sorting === 'object' ? options.sorting : {};
  const searching = typeof options.searching === 'object' ? options.searching : {};
  return {
    page: 1,
    pageSize: pageSizeOf(options),
    sorting: enabled(options.sorting) === false ? [] : [...(sorting.initial ?? [])],
    filters: [],
    ...(searching.initial ? { globalSearch: searching.initial } : {}),
  };
}

/** The parts of a query that pick a page, as a comparable string. */
function queryKey(query: TableQuery): string {
  return JSON.stringify([query.page, query.pageSize, query.sorting, query.filters, query.globalSearch ?? '']);
}

function pageSizeOf(options: AcunDataTableOptions): number {
  const pagination = typeof options.pagination === 'object' ? options.pagination : {};
  if (pagination.pageSize !== undefined) return pagination.pageSize;
  const sizes = pagination.pageSizes ?? [10, 25, 50, 100];
  return sizes.includes(25) ? 25 : sizes[0] ?? 25;
}

/** `created_at` → `Created at`, `customerName` → `Customer name`. */
function readable(field: string): string {
  const words = field.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_\-.]+/g, ' ').trim().toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toColumnDef(column: ColumnOptions | ColumnDef<Data>, options: AcunDataTableOptions): ColumnDef<Data> {
  const sortingOn = enabled(options.sorting) !== false;
  if (!('data' in column)) return sortingOn ? column : { ...column, enableSorting: false };
  if (typeof column.data !== 'string' || column.data.length === 0) throw new TypeError('AcunDataTable: every column needs data (a field name)');
  return {
    id: column.data,
    header: column.title ?? readable(column.data),
    accessorKey: column.data,
    enableSorting: sortingOn && column.sortable !== false,
    enableFiltering: column.searchable !== false || Boolean(column.filter),
    ...(column.filter ? { filter: Array.isArray(column.filter) ? { options: column.filter } : true } : {}),
    ...(column.hideable === false ? { enableHiding: false } : {}),
    ...(column.type ? { type: column.type } : {}),
    ...(column.priority ? { priority: column.priority } : {}),
    ...(column.aggregate ? { aggregate: column.aggregate } : {}),
  } as ColumnDef<Data>;
}

function inferColumns(row: Data | undefined, options: AcunDataTableOptions): ColumnDef<Data>[] {
  if (!row || typeof row !== 'object') {
    throw new TypeError('AcunDataTable: no columns to show; set columns, give the table a <thead>, or return at least one row');
  }
  return Object.keys(row).map(field => toColumnDef({ data: field }, options));
}

/** Columns from `<thead>` (`data-column` names the field) and, as text, rows from `<tbody>`. */
function readTable(table: HTMLTableElement, options: AcunDataTableOptions): { columns: ColumnDef<Data>[] | undefined; rows: Data[] } {
  const headers = [...(table.tHead?.rows[table.tHead.rows.length - 1]?.cells ?? [])];
  if (headers.length === 0) return { columns: undefined, rows: [] };
  const used = new Set<string>();
  const fields = headers.map((cell, index) => {
    let field = cell.dataset['column'] || cell.dataset['data'] || slug(cell.textContent ?? '') || `column${index + 1}`;
    while (used.has(field)) field = `${field}_${index + 1}`;
    used.add(field);
    return field;
  });
  const columns = headers.map((cell, index) => toColumnDef({
    data: fields[index]!,
    title: (cell.textContent ?? '').trim() || fields[index]!,
    ...(cell.dataset['type'] ? { type: cell.dataset['type'] as ColumnType } : {}),
    ...(cell.dataset['sortable'] === 'false' ? { sortable: false } : {}),
    ...(cell.dataset['priority'] ? { priority: Number(cell.dataset['priority']) as 1 | 2 | 3 } : {}),
    ...(cell.dataset['filter'] !== undefined ? { filter: true } : {}),
    ...(cell.dataset['aggregate'] ? { aggregate: cell.dataset['aggregate'] as Aggregate } : {}),
  }, options));
  const rows = [...table.tBodies].flatMap(body => [...body.rows]).map(tr => {
    const row: Data = {};
    fields.forEach((field, index) => { row[field] = (tr.cells[index]?.textContent ?? '').trim(); });
    return row;
  });
  return { columns, rows };
}

function slug(text: string): string {
  return text.trim().toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** The server's JSON as `{ rows, totalRows }`: ours, Laravel's paginator or DataTables' format. */
function serverRows(body: unknown, dataSrc: AjaxOptions['dataSrc']): unknown {
  if (typeof dataSrc === 'function') return dataSrc(body);
  if (!body || typeof body !== 'object') return body;
  const json = body as Data;
  if (typeof dataSrc === 'string') return { rows: json[dataSrc], ...total(json) };
  if (Array.isArray(json['rows'])) return json;
  return { rows: json['data'], ...total(json) };
}

function total(json: Data): { totalRows?: unknown; totals?: unknown } {
  const meta = json['meta'] as Data | undefined;
  const count = json['totalRows'] ?? json['recordsFiltered'] ?? json['total'] ?? meta?.['total'];
  return { ...(count === undefined ? {} : { totalRows: count }), ...(json['totals'] === undefined ? {} : { totals: json['totals'] }) };
}

/** Headers of a request; POST adds Laravel's CSRF token from `<meta name="csrf-token">`. */
function requestHeaders(ajax: AjaxOptions): () => Promise<HeadersInit> {
  return async () => {
    const headers = new Headers(await resolveHeaders(ajax.headers));
    if ((ajax.method ?? 'GET') === 'POST' && !headers.has('X-CSRF-TOKEN')) {
      const token = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content;
      if (token) headers.set('X-CSRF-TOKEN', token);
    }
    headers.set('Accept', 'application/json');
    return headers;
  };
}

async function resolveHeaders(headers: AjaxOptions['headers']): Promise<HeadersInit> {
  return typeof headers === 'function' ? headers() : headers ?? {};
}

/** Loading state of a client-side `ajax` load, in the shape `renderTable`'s `status` reads. */
function loadState(retry: () => unknown) {
  let state: { status: 'idle' | 'loading' | 'success' | 'error'; error?: unknown } = { status: 'idle' };
  const listeners = new Set<(state: { readonly status: string }) => void>();
  const set = (next: typeof state): void => { state = next; listeners.forEach(listener => listener(state)); };
  return {
    getState: () => state,
    subscribe(listener: (state: { readonly status: string }) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    retry,
    start: () => set({ status: 'loading' }),
    done: () => set({ status: 'success' }),
    fail: (error: unknown) => set({ status: 'error', error }),
  };
}

/** Wait until the runner's request in flight has settled. */
function settled(runner: QueryRunner<Data>): Promise<void> {
  return new Promise(resolve => {
    if (runner.getState().status !== 'loading') return resolve();
    const off = runner.subscribe(state => {
      if (state.status !== 'loading') { off(); resolve(); }
    });
  });
}
