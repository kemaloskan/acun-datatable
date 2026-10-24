import { COLUMN_WIDTH_LIMITS, type ColumnDef, type DataTable, type Row } from '@acunsoft/datatable-core';
import { actionCell, checkActions, type RowAction } from './actions';
import { cellValue, createCellText, nextSorting, rowName, type CellFormatter } from './cells';
import { checkTarget, element, icon, keepFocus, type RenderedComponent } from './dom';
import { labelsEn, type DataTableLabels } from './labels';
import { checkFixedColumns, pinColumns, type FixedColumns } from './pin';
import { columnTools } from './column-tools';
import { autoResponsive } from './auto-responsive';
import { checkVirtual, virtualWindow } from './virtual';
import { cellEditor, isEditable, type CellEditor, type EditHandler } from './edit';

export type { CellFormatter } from './cells';

/**
 * Loading state of a remote table, e.g. the HTTP package's `createQueryRunner`.
 * Only this shape is needed, so the DOM package does not depend on the HTTP one.
 */
export interface StatusSource {
  getState(): { readonly status: 'idle' | 'loading' | 'success' | 'error'; readonly error?: unknown };
  subscribe(listener: (state: { readonly status: string }) => void): () => void;
  /** Shown as a "Try again" button after an error when present. */
  retry?(): unknown;
}

export interface RenderTableOptions<TData> {
  /** Visible table caption; recommended for accessibility. */
  readonly caption?: string;
  /** Adds a checkbox column. Default `false`. */
  readonly selectable?: boolean;
  /** Locale for default number and date text. Default `'en'`. */
  readonly locale?: string;
  /** Per column ID. */
  readonly format?: Readonly<Record<string, CellFormatter<TData>>>;
  readonly labels?: Partial<DataTableLabels>;
  /**
   * Names a row for its checkbox label ("Select Ayşe Yılmaz"). Default: the text
   * of the first column, or the row ID when that is empty.
   */
  readonly rowLabel?: (row: Row<TData>) => string;
  /** Server mode: shows loading (`aria-busy`) and error states from a runner. */
  readonly status?: StatusSource;
  /**
   * Buttons in a last "Actions" column. Each button's accessible name includes
   * the row's name ("Edit: Ayşe Yılmaz"), so screen-reader users know which
   * row it acts on.
   */
  readonly rowActions?: readonly RowAction<TData>[];
  /**
   * Narrow screens (with the optional `styles.css`): `'cards'` (default) shows
   * each row as a card; `'scroll'` keeps the table and scrolls it sideways;
   * `'collapse'` hides lower-priority columns (`ColumnDef.priority`) and adds
   * a button that opens their values below the row; `'modal'` opens every
   * value of the row in a dialog instead. `'auto'` works like `'collapse'`
   * but measures: columns are hidden (lowest priority first, then from the
   * right) only while the table does not fit, at any screen width.
   */
  readonly responsive?: ResponsiveMode;
  /** Density with the optional `styles.css`: `'sm'` compact, `'md'` (default), `'lg'` spacious. */
  readonly size?: TableSize;
  /**
   * Keep the header row at the top of the window while the page scrolls
   * (DataTables `fixedHeader`). Below a fixed top bar set `--adt-sticky-top`.
   * The table then grows instead of scrolling sideways; pair it with a
   * `responsive` mode or use `scrollY` for very wide tables.
   */
  readonly stickyHeader?: boolean;
  /**
   * Give the table a fixed height and scroll it inside, with the header
   * staying in place (DataTables `scrollY`): a CSS length such as `'60vh'` or
   * `'480px'`, or a number of pixels.
   */
  readonly scrollY?: string | number;
  /** Shift+click adds a second sort column. Default `true`; `false` always sorts by one column. */
  readonly multiSort?: boolean;
  /**
   * Custom cells per column ID: return a DOM node (built with `el()` or the
   * DOM API, never parsed from HTML) or a string (shown as text). Also used
   * in the responsive details and dialog. Sorting, search and exports keep
   * the column's value.
   */
  readonly cells?: Readonly<Record<string, CellRenderer<TData>>>;
  /** Row actions shown as buttons in the row; the rest go into a "⋮" menu. Default: all in the row. */
  readonly maxInlineActions?: number;
  /**
   * A child row under each row (DataTables child rows): every row gets a ⊕
   * button that opens what this returns — a DOM node, a string (shown as
   * text) or a promise of either, e.g. order lines fetched from the server
   * (shown as "Loading…" until it settles; the result is kept until the row
   * changes). With `responsive: 'modal'` it opens in the dialog instead.
   */
  readonly detail?: DetailRenderer<TData>;
  /**
   * While a `status` source loads the first rows, show placeholder rows that
   * shimmer (with the optional `styles.css`) instead of the empty text.
   * Later loads keep the current rows, dimmed. Default `true`.
   */
  readonly skeleton?: boolean;
  /**
   * Keep columns in place while the table scrolls sideways (DataTables
   * `fixedColumns`): `start` data columns (with the checkbox and ⊕ columns
   * before them) and `end` cells, counting the actions column. Not in the
   * phone card layout, where nothing scrolls sideways.
   */
  readonly fixedColumns?: FixedColumns;
  /**
   * Drag the edge of a header to set a column's width (←/→ on the focused
   * handle, Delete returns it to its natural width). Widths are in the
   * table state (`columnWidths`), so `persistState` keeps them.
   */
  readonly resizableColumns?: boolean;
  /**
   * Drag a header onto another to move the column (`columnOrder`); the
   * column menu offers the same with buttons for the keyboard.
   */
  readonly reorderableColumns?: boolean;
  /**
   * Save a cell edited in place. Columns with `editable` get an edit button
   * (and a double click) that opens an editor for the column type; Enter or
   * leaving the field saves, Escape cancels. The table does not change your
   * data: update it once saved (local mode `setData`, server mode reload).
   */
  readonly onEdit?: EditHandler<TData>;
  /**
   * Scroll through every matching row instead of pages (DataTables
   * Scroller), for long local lists: only the rows in view (and `overscan`
   * around them) are in the page, so 100,000 rows scroll like 30. Rows should
   * be of one height (`rowHeight`, measured when left out). Needs a local
   * table; the height is `scrollY` (default 480px). "Select all" selects
   * every matching row.
   */
  readonly virtual?: boolean | { readonly rowHeight?: number; readonly overscan?: number };
}

/** Placeholder rows while the first rows load: as many as a page, at most this many. */
const SKELETON_ROWS = 10;

/** The content of a row's child row (`detail`). */
export type DetailRenderer<TData> = (row: Row<TData>) => Node | string | null | undefined | Promise<Node | string | null | undefined>;

/** What a custom cell gets. */
export interface CellContext<TData> {
  readonly value: unknown;
  /** The default display text. */
  readonly text: string;
  readonly row: Row<TData>;
  readonly column: ColumnDef<TData>;
}
export type CellRenderer<TData> = (cell: CellContext<TData>) => Node | string;

/** The CSS length of a `scrollY` option, or `undefined` when it is not set. */
export function scrollHeight(value: unknown): string | undefined {
  if (value === undefined || value === null || value === false) return undefined;
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return `${value}px`;
  if (typeof value === 'string' && /^\d+(\.\d+)?(px|rem|em|vh|dvh|svh|%)$/.test(value.trim())) return value.trim();
  throw new RangeError('scrollY must be a positive number of pixels or a CSS length such as "60vh"');
}

export type TableSize = 'sm' | 'md' | 'lg';
export function checkResponsive(mode: unknown): ResponsiveMode {
  if (mode !== undefined && !RESPONSIVE_MODES.includes(mode as ResponsiveMode)) {
    throw new RangeError(`responsive must be one of ${RESPONSIVE_MODES.join(', ')}`);
  }
  return (mode ?? 'cards') as ResponsiveMode;
}
export function checkSize(size: unknown): TableSize {
  if (size !== undefined && size !== 'sm' && size !== 'md' && size !== 'lg') throw new RangeError('size must be sm, md or lg');
  return (size ?? 'md') as TableSize;
}
export type ResponsiveMode = 'cards' | 'scroll' | 'collapse' | 'modal' | 'auto';
const RESPONSIVE_MODES: readonly ResponsiveMode[] = ['cards', 'scroll', 'collapse', 'modal', 'auto'];
let tables = 0;

/**
 * Render a semantic, accessible `<table>` for a `createDataTable` instance and
 * keep it in sync.
 *
 * Sortable headers are buttons: a click cycles ascending → descending → none;
 * Shift+click adds or changes a secondary sort. The primary sorted header gets
 * `aria-sort`. Cell text is written with `textContent`, so untrusted values are
 * shown literally and never parsed as HTML. Keyboard focus survives re-renders;
 * selection changes only update the checkboxes, never the whole table. Each
 * cell carries `data-label` (its header) for the stacked narrow-screen layout
 * of the optional `styles.css`.
 */
export function renderTable<TData>(
  container: HTMLElement, table: DataTable<TData>, options: RenderTableOptions<TData> = {},
): RenderedComponent {
  checkTarget(container, table);
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };
  const locale = options.locale ?? 'en';
  const text = createCellText(table.getColumns(), { locale, labels, ...(options.format ? { format: options.format } : {}) });
  if (options.rowLabel !== undefined && typeof options.rowLabel !== 'function') {
    throw new TypeError('rowLabel must be a function');
  }
  const rowActions = options.rowActions === undefined
    ? []
    : checkActions<RowAction<TData>>(options.rowActions, 'rowActions', ['hidden', 'disabled']);
  const status = options.status;
  if (status !== undefined && (typeof status.getState !== 'function' || typeof status.subscribe !== 'function')) {
    throw new TypeError('status must have getState and subscribe');
  }

  const responsive = checkResponsive(options.responsive);
  if (options.detail !== undefined && typeof options.detail !== 'function') throw new TypeError('detail must be a function');
  const detailOf = options.detail;
  // The expand column: hidden columns (collapse, modal) or a child row (detail).
  const collapsible = responsive === 'collapse' || responsive === 'modal' || responsive === 'auto';
  // Hidden columns open below the row (collapse, auto) or in a dialog (modal).
  const inlineDetails = responsive === 'collapse' || responsive === 'auto';
  const expandable = collapsible || detailOf !== undefined;
  const uid = `adt-${++tables}`;

  const nameOf = (row: Row<TData>, cells: readonly string[]): string => rowName(row, cells[0] ?? '', options.rowLabel);
  const custom = options.cells ?? {};
  for (const [id, render] of Object.entries(custom)) {
    if (typeof render !== 'function') throw new TypeError(`cells.${id} must be a function`);
  }
  /** The content of a cell: a custom renderer's node or text, else the default text. */
  const fill = (target: HTMLElement, column: ColumnDef<TData>, row: Row<TData>, text: string): HTMLElement => {
    const render = custom[column.id];
    if (!render) {
      target.textContent = text;
      return target;
    }
    const content = render({ value: cellValue(column, row), text, row, column });
    if (typeof content === 'string') target.textContent = content;
    else if (content && typeof (content as Node).nodeType === 'number') target.replaceChildren(content);
    else throw new TypeError(`cells.${column.id} must return a DOM node or a string`);
    return target;
  };

  const fixed = checkFixedColumns(options.fixedColumns);
  const size = checkSize(options.size);
  const virtual = checkVirtual(options.virtual);
  if (virtual && table.getMode() === 'server') throw new TypeError('virtual scrolling needs a local table; use cursor paging for server tables');
  const height = scrollHeight(options.scrollY) ?? (virtual ? '480px' : undefined);
  const root = element(doc, 'div', {
    class: ['adt-table-wrap', `adt-responsive--${responsive}`, size === 'md' ? '' : `adt-size--${size}`,
      options.stickyHeader === true ? 'adt-sticky-header' : '', height ? 'adt-scroll-y' : '', virtual ? 'adt-virtual' : ''].filter(Boolean).join(' '),
  });
  if (height) root.style.setProperty('--adt-scroll-y', height);
  const scroller = element(doc, 'div', { class: 'adt-scroll' });
  const notice = element(doc, 'div', { class: 'adt-notice', role: 'status', 'aria-live': 'polite' });
  root.append(notice, scroller);
  container.replaceChildren(root);
  // One listener closes any open row "⋮" menu on a click outside it.
  const closeMenus = (event: Event): void => {
    root.querySelectorAll<HTMLDetailsElement>('.adt-row-menu[open]').forEach(menu => {
      if (!event.composedPath().includes(menu)) menu.open = false;
    });
  };
  doc.addEventListener('click', closeMenus);

  // Rows whose details are open (kept across re-renders).
  const expanded = new Set<string>();
  // Child row content per row ID, kept while the row's data stays the same.
  const details = new Map<string, { original: TData; state: 'loading' | 'done' | 'error'; content?: Node | string | null | undefined }>();
  const detailContent = (row: Row<TData>): HTMLElement => {
    const box = element(doc, 'div', { class: 'adt-detail-content' });
    let entry = details.get(row.id);
    if (!entry || entry.original !== row.original) {
      let result: ReturnType<DetailRenderer<TData>>;
      try {
        result = detailOf!(row);
      } catch {
        result = Promise.reject(new Error('detail failed'));
      }
      if (result && typeof (result as Promise<unknown>).then === 'function') {
        const pending = { original: row.original, state: 'loading' as const };
        details.set(row.id, pending);
        entry = pending;
        (result as Promise<Node | string | null | undefined>).then(
          content => { if (details.get(row.id) === pending) { details.set(row.id, { original: row.original, state: 'done', content }); refresh(row.id); } },
          () => { if (details.get(row.id) === pending) { details.set(row.id, { original: row.original, state: 'error' }); refresh(row.id); } },
        );
      } else {
        entry = { original: row.original, state: 'done', content: result as Node | string | null | undefined };
        details.set(row.id, entry);
      }
    }
    if (entry.state === 'loading') {
      box.setAttribute('aria-busy', 'true');
      box.append(element(doc, 'span', { class: 'adt-detail-status' }, labels.loading));
    } else if (entry.state === 'error') {
      box.setAttribute('role', 'alert');
      box.append(element(doc, 'span', { class: 'adt-detail-status adt-detail-status--error' }, labels.error));
    } else if (typeof entry.content === 'string') {
      box.textContent = entry.content;
    } else if (entry.content && typeof entry.content.nodeType === 'number') {
      box.append(entry.content);
    } else if (entry.content !== null && entry.content !== undefined) {
      throw new TypeError('detail must return a DOM node, a string, null or a promise of one');
    }
    return box;
  };
  /** Re-render once a row's loaded detail arrives, if it is still showing. */
  const refresh = (id: string): void => {
    if (expanded.has(id) || dialogRow === id) render();
  };
  // Responsive modal: one dialog, filled for the row whose button was pressed.
  let dialog: HTMLDialogElement | undefined;
  let dialogRow: string | undefined;
  const closeDialog = (): void => {
    if (!dialog) return;
    if (typeof dialog.close === 'function' && dialog.open) dialog.close();
    else dialog.removeAttribute('open');
  };
  const detailList = (row: Row<TData>, cells: readonly string[], columns: readonly ColumnDef<TData>[], all: boolean): HTMLDListElement => {
    const list = element(doc, 'dl', { class: 'adt-detail-list' });
    columns.forEach((column, index) => {
      const level = priorityOf(column, index);
      if (!all && level === 1) return;
      const item = element(doc, 'div', { class: `adt-detail-item${all ? '' : ` adt-col--p${level}`}`, 'data-column-id': column.id });
      item.append(element(doc, 'dt', {}, column.header), fill(element(doc, 'dd'), column, row, cells[index]!));
      list.append(item);
    });
    if (rowActions.length > 0) {
      const item = element(doc, 'div', { class: `adt-detail-item${all ? '' : ' adt-col--p2'}`, 'data-column-id': '__actions' });
      const actions = actionCell(doc, rowActions, row, nameOf(row, cells), labels); // every action as a button in the details
      const value = element(doc, 'dd', { class: 'adt-detail-actions' });
      value.append(...actions.childNodes);
      item.append(element(doc, 'dt', {}, labels.actions), value);
      list.append(item);
    }
    return list;
  };
  const openDialog = (row: Row<TData>, cells: readonly string[], columns: readonly ColumnDef<TData>[]): void => {
    if (!dialog) {
      dialog = element(doc, 'dialog', { class: 'adt-dialog', 'aria-labelledby': `${uid}-dialog-title` });
      // A click on the backdrop lands on the dialog itself.
      dialog.addEventListener('click', event => { if (event.target === dialog) closeDialog(); });
      dialog.addEventListener('close', () => {
        // Back to the row's button (Safari does not focus a clicked button, so the browser cannot restore it).
        const opener = [...root.querySelectorAll<HTMLElement>('.adt-expand')].find(node => node.dataset['adtFocus'] === `expand:${dialogRow}`);
        dialogRow = undefined;
        opener?.focus();
      });
      root.append(dialog);
    }
    const head = element(doc, 'div', { class: 'adt-dialog-head' });
    const close = element(doc, 'button', { type: 'button', class: 'adt-dialog-close', 'aria-label': labels.close });
    close.append(icon(doc, 'close'));
    close.addEventListener('click', closeDialog);
    head.append(element(doc, 'h2', { class: 'adt-dialog-title', id: `${uid}-dialog-title` }, labels.details(nameOf(row, cells))), close);
    dialog.replaceChildren(head, detailList(row, cells, columns, true), ...(detailOf ? [detailContent(row)] : []));
    dialogRow = row.id;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
  };

  // The cell being edited in place (the editor element moves into each re-render).
  let editing: { rowId: string; columnId: string; editor: CellEditor } | undefined;
  const onEdit = options.onEdit;
  if (onEdit !== undefined && typeof onEdit !== 'function') throw new TypeError('onEdit must be a function');
  const startEdit = (row: Row<TData>, column: ColumnDef<TData>): void => {
    editing?.editor.destroy();
    const focusKey = `edit:${row.id}:${column.id}`;
    const editor = cellEditor(doc, {
      row, column, value: cellValue(column, row), labels, onEdit: onEdit!,
      onClose: () => {
        if (editing?.editor !== editor) return;
        editing = undefined;
        editor.destroy();
        render();
        root.querySelector<HTMLElement>(`[data-adt-focus="${CSS.escape(focusKey)}"]`)?.focus();
      },
    });
    editing = { rowId: row.id, columnId: column.id, editor };
    render();
    editor.focus();
  };

  // The row a Shift+click range starts from.
  let anchor: string | undefined;
  // Elements that a selection change updates in place.
  let selectAll: HTMLInputElement | undefined;
  let rowParts: { id: string; tr: HTMLTableRowElement; box: HTMLInputElement | undefined }[] = [];
  let pageIds: string[] = [];

  const patchSelection = (): void => {
    for (const { id, tr, box } of rowParts) {
      const selected = table.isSelected(id);
      tr.classList.toggle('adt-row--selected', selected);
      if (box) box.checked = selected;
    }
    if (selectAll) {
      const state = table.getSelectionStatus(pageIds);
      selectAll.checked = state === 'all';
      selectAll.indeterminate = state === 'some';
    }
  };

  // Placeholder rows while the first rows of a remote table load.
  let skeletonShown = false;
  const wantsSkeleton = (): boolean => options.skeleton !== false && status !== undefined
    && status.getState().status === 'loading' && table.getPage().rows.length === 0;

  // Virtual scrolling: the rows in view, re-drawn when the scroll position moves past them.
  let rowHeight = virtual?.rowHeight ?? 0;
  let drawn: { start: number; end: number } | undefined;
  const windowOf = (total: number) => virtualWindow(total, rowHeight, scroller.scrollTop, scroller.clientHeight, virtual!.overscan);

  const render = (): void => keepFocus(root, () => {
    const state = table.getState();
    const page = virtual
      ? (() => {
        const rows = table.getFilteredRows();
        const view = windowOf(rows.length);
        drawn = { start: view.start, end: view.end };
        return { rows: rows.slice(view.start, view.end), all: rows, view };
      })()
      : { ...table.getPage(), all: undefined, view: undefined };
    skeletonShown = wantsSkeleton();
    root.classList.toggle('adt-skeleton-on', skeletonShown);
    const selectable = options.selectable === true;
    const columns = table.getVisibleColumns();
    // With virtual scrolling "all" is every matching row, not only those drawn.
    pageIds = (page.all ?? page.rows).map(row => row.id);
    selectAll = undefined;
    rowParts = [];

    const widths = state.columnWidths;
    const tableEl = element(doc, 'table', { class: Object.keys(widths).length > 0 ? 'adt-table adt-fixed-layout' : 'adt-table' });
    if (page.all) tableEl.setAttribute('aria-rowcount', String(page.all.length + 1));
    if (options.caption !== undefined) tableEl.append(element(doc, 'caption', {}, options.caption));

    const headRow = element(doc, 'tr');
    const levels = new Set(columns.map((column, index) => priorityOf(column, index)));
    if (rowActions.length > 0) levels.add(2);
    if (collapsible) {
      if (levels.has(2)) tableEl.classList.add('adt-has-p2');
      if (levels.has(3)) tableEl.classList.add('adt-has-p3');
    }
    if (detailOf) tableEl.classList.add('adt-has-detail');
    if (expandable) headRow.append(element(doc, 'td', { class: 'adt-expand-cell' }));
    if (selectable) {
      const th = element(doc, 'th', { scope: 'col', class: 'adt-select' });
      if (table.getSelectionMode() === 'multiple' && pageIds.length > 0) {
        const box = element(doc, 'input', { type: 'checkbox', 'aria-label': labels.selectAll, 'data-adt-focus': 'select-all' });
        box.addEventListener('change', () => {
          if (table.getSelectionStatus(pageIds) === 'all') {
            table.setSelectedRows(table.getState().selectedIds.filter(id => !pageIds.includes(id)));
          } else {
            table.selectRows(pageIds);
          }
        });
        selectAll = box;
        th.append(box);
      }
      headRow.append(th);
    }
    const primary = state.sorting[0];
    for (const column of columns) {
      const th = element(doc, 'th', {
        scope: 'col', class: `adt-th${collapsible ? ` adt-col--p${priorityOf(column, columns.indexOf(column))}` : ''}${numeric(column) ? ' adt-num' : ''}`,
        'data-column-id': column.id,
        ...(options.reorderableColumns ? { draggable: 'true' } : {}),
      });
      const width = widths[column.id];
      if (width !== undefined) th.style.width = `${width}px`;
      if (column.enableSorting) {
        const index = state.sorting.findIndex(rule => rule.field === column.id);
        const rule = state.sorting[index];
        if (primary?.field === column.id) th.setAttribute('aria-sort', primary.direction === 'asc' ? 'ascending' : 'descending');
        const button = element(doc, 'button', {
          type: 'button',
          class: rule ? `adt-sort adt-sort--${rule.direction}` : 'adt-sort',
          'data-adt-focus': `sort:${column.id}`,
        }, column.header);
        const mark = rule ? `${rule.direction === 'asc' ? '▲' : '▼'}${state.sorting.length > 1 ? index + 1 : ''}` : '';
        button.append(element(doc, 'span', { class: 'adt-sort-mark', 'aria-hidden': 'true' }, mark));
        button.addEventListener('click', event => {
          table.setSorting(nextSorting(table.getState().sorting, column.id, event.shiftKey && options.multiSort !== false));
        });
        th.append(button);
      } else {
        th.textContent = column.header;
      }
      if (options.resizableColumns) {
        th.append(element(doc, 'span', {
          class: 'adt-resize', role: 'separator', 'aria-orientation': 'vertical', tabindex: '0',
          'aria-label': labels.resizeColumn(column.header), 'data-column-id': column.id, 'data-adt-focus': `resize:${column.id}`,
          'aria-valuemin': String(COLUMN_WIDTH_LIMITS.min), 'aria-valuemax': String(COLUMN_WIDTH_LIMITS.max),
          ...(width !== undefined ? { 'aria-valuenow': String(width) } : {}),
        }));
      }
      headRow.append(th);
    }
    if (rowActions.length > 0) {
      headRow.append(element(doc, 'th', { scope: 'col', class: `adt-th adt-actions${collapsible ? ' adt-col--p2' : ''}` }, labels.actions));
    }
    const head = element(doc, 'thead');
    head.append(headRow);

    const body = element(doc, 'tbody');
    let placed = false;
    const span = columns.length + (selectable ? 1 : 0) + (rowActions.length > 0 ? 1 : 0) + (expandable ? 1 : 0);
    if (skeletonShown) {
      // Same cells as a row, so the layout does not jump when the rows arrive.
      body.setAttribute('aria-hidden', 'true');
      for (let index = 0; index < Math.min(state.pageSize, SKELETON_ROWS); index++) {
        const tr = element(doc, 'tr', { class: 'adt-row adt-skeleton-row' });
        if (expandable) tr.append(element(doc, 'td', { class: 'adt-expand-cell' }));
        if (selectable) tr.append(element(doc, 'td', { class: 'adt-select' }));
        columns.forEach((column, columnIndex) => {
          const cellClass = [collapsible ? `adt-col--p${priorityOf(column, columnIndex)}` : '', numeric(column) ? 'adt-num' : ''].filter(Boolean).join(' ');
          const td = element(doc, 'td', { 'data-label': column.header, ...(cellClass ? { class: cellClass } : {}) });
          td.append(element(doc, 'span', { class: 'adt-skeleton' }));
          tr.append(td);
        });
        if (rowActions.length > 0) tr.append(element(doc, 'td', { class: `adt-actions${collapsible ? ' adt-col--p2' : ''}` }));
        body.append(tr);
      }
    } else if (page.rows.length === 0) {
      const tr = element(doc, 'tr', { class: 'adt-empty' });
      tr.append(element(doc, 'td', { colspan: String(span) }, labels.empty));
      body.append(tr);
    }
    const spacer = (pixels: number): HTMLTableRowElement => {
      const tr = element(doc, 'tr', { class: 'adt-spacer', 'aria-hidden': 'true' });
      const td = element(doc, 'td', { colspan: String(span) });
      td.style.height = `${pixels}px`;
      tr.append(td);
      return tr;
    };
    if (page.view && page.view.before > 0) body.append(spacer(page.view.before));
    page.rows.forEach((row, offset) => {
      const cells = columns.map(column => text(column, row));
      const tr = element(doc, 'tr', { class: 'adt-row', 'data-row-id': row.id });
      if (page.view) tr.setAttribute('aria-rowindex', String(page.view.start + offset + 2)); // 1 is the header
      const open = responsive !== 'modal' && expanded.has(row.id);
      const detailId = `${uid}-detail-${rowParts.length}`;
      if (expandable) {
        const td = element(doc, 'td', { class: 'adt-expand-cell' });
        const button = element(doc, 'button', {
          type: 'button', class: 'adt-expand', 'aria-label': labels.details(nameOf(row, cells)), 'data-adt-focus': `expand:${row.id}`,
          ...(responsive !== 'modal'
            ? { 'aria-expanded': open ? 'true' : 'false', 'aria-controls': detailId }
            : { 'aria-haspopup': 'dialog' }),
        });
        button.append(icon(doc, open ? 'collapse' : 'expand'));
        button.addEventListener('click', () => {
          if (responsive === 'modal') {
            openDialog(row, cells, columns);
            return;
          }
          if (expanded.has(row.id)) expanded.delete(row.id);
          else expanded.add(row.id);
          render();
        });
        td.append(button);
        tr.append(td);
      }
      let box: HTMLInputElement | undefined;
      if (selectable) {
        const td = element(doc, 'td', { class: 'adt-select' });
        const input = element(doc, 'input', {
          type: 'checkbox', 'aria-label': labels.selectRow(nameOf(row, cells)), 'data-adt-focus': `select:${row.id}`,
        });
        box = input;
        // Shift+click selects (or clears) every row between the last clicked one and this one.
        box.addEventListener('click', event => {
          const from = anchor;
          anchor = row.id;
          if (event.shiftKey && from !== undefined && from !== row.id && table.getSelectionMode() === 'multiple') {
            const ids = rangeOf(pageIds, from, row.id);
            if (input.checked) table.selectRows(ids);
            else table.setSelectedRows(table.getState().selectedIds.filter(id => !ids.includes(id)));
            return;
          }
          table.toggleRow(row.id);
        });
        td.append(input);
        tr.append(td);
      }
      columns.forEach((column, index) => {
        const editable = onEdit !== undefined && isEditable(column);
        const isEditing = editable && editing?.rowId === row.id && editing.columnId === column.id;
        const cellClass = [collapsible ? `adt-col--p${priorityOf(column, index)}` : '', numeric(column) ? 'adt-num' : '',
          editable ? 'adt-editable' : '', isEditing ? 'adt-editing' : ''].filter(Boolean).join(' ');
        const td = element(doc, 'td', { 'data-label': column.header, ...(cellClass ? { class: cellClass } : {}) });
        if (isEditing) {
          td.append(editing!.editor.element);
          placed = true;
        } else {
          fill(td, column, row, cells[index]!);
          if (editable) {
            const button = element(doc, 'button', {
              type: 'button', class: 'adt-edit', 'aria-label': labels.editCell(column.header, nameOf(row, cells)),
              'data-adt-focus': `edit:${row.id}:${column.id}`,
            });
            button.append(icon(doc, 'edit'));
            button.addEventListener('click', () => startEdit(row, column));
            td.append(button);
            td.addEventListener('dblclick', event => { if (!(event.target as Element).closest('a, button, input, select')) startEdit(row, column); });
          }
        }
        tr.append(td);
      });
      if (rowActions.length > 0) {
        const cell = actionCell(doc, rowActions, row, nameOf(row, cells), labels, options.maxInlineActions);
        if (collapsible) cell.classList.add('adt-col--p2');
        tr.append(cell);
      }
      rowParts.push({ id: row.id, tr, box });
      body.append(tr);
      if (open) {
        tr.classList.add('adt-row--expanded');
        const detail = element(doc, 'tr', { class: 'adt-detail', id: detailId });
        const td = element(doc, 'td', { colspan: String(span) });
        if (inlineDetails) td.append(detailList(row, cells, columns, false));
        if (detailOf) td.append(detailContent(row));
        detail.append(td);
        body.append(detail);
      }
      if (dialogRow === row.id) openDialog(row, cells, columns); // keep an open dialog current
    });
    if (page.view && page.view.after > 0) body.append(spacer(page.view.after));
    if (dialogRow !== undefined && !pageIds.includes(dialogRow)) closeDialog(); // its row left the page
    for (const id of details.keys()) if (!expanded.has(id) && dialogRow !== id) details.delete(id); // closed rows load again
    if (editing && !placed) { editing.editor.destroy(); editing = undefined; } // its row left the page
    tableEl.append(head, body);
    // Footer totals of the columns with `aggregate` (every matching row, not just the page).
    if (columns.some(column => column.aggregate !== undefined)) {
      const totals = table.getAggregates();
      const tr = element(doc, 'tr', { class: 'adt-total' });
      if (expandable) tr.append(element(doc, 'td', { class: 'adt-expand-cell' }));
      if (selectable) tr.append(element(doc, 'td', { class: 'adt-select' }));
      columns.forEach((column, index) => {
        const result = totals[column.id];
        const cellClass = [collapsible ? `adt-col--p${priorityOf(column, index)}` : '', result ? 'adt-num' : ''].filter(Boolean).join(' ');
        const td = element(doc, index === 0 && !result ? 'th' : 'td', {
          ...(cellClass ? { class: cellClass } : {}),
          ...(index === 0 && !result ? { scope: 'row' } : {}),
          'data-label': result ? `${column.header} · ${labels.aggregate(result.aggregate)}` : column.header,
          ...(result ? { title: labels.aggregate(result.aggregate) } : {}),
        }, index === 0 && !result ? labels.totals : text.total(column, result));
        tr.append(td);
      });
      if (rowActions.length > 0) tr.append(element(doc, 'td', { class: `adt-actions${collapsible ? ' adt-col--p2' : ''}` }));
      const foot = element(doc, 'tfoot');
      foot.append(tr);
      tableEl.append(foot);
    }
    scroller.replaceChildren(tableEl);
    patchSelection();
  });

  const showStatus = (): void => {
    if (!status) return;
    const { status: phase } = status.getState();
    root.setAttribute('aria-busy', phase === 'loading' ? 'true' : 'false');
    root.classList.toggle('adt-loading', phase === 'loading');
    if (phase === 'loading') {
      notice.setAttribute('role', 'status');
      notice.replaceChildren(element(doc, 'span', { class: 'adt-notice-text' }, labels.loading));
    } else if (phase === 'error') {
      notice.setAttribute('role', 'alert');
      const parts: HTMLElement[] = [element(doc, 'span', { class: 'adt-notice-text' }, labels.error)];
      if (typeof status.retry === 'function') {
        const retry = element(doc, 'button', { type: 'button', class: 'adt-retry' }, labels.retry);
        retry.addEventListener('click', () => { void status.retry!(); });
        parts.push(retry);
      }
      notice.replaceChildren(...parts);
    } else {
      notice.setAttribute('role', 'status');
      notice.replaceChildren();
    }
  };

  render();
  showStatus();
  // Virtual scrolling: measure the row height once, then re-draw when the rows in view change.
  let frame = 0;
  const onScroll = (): void => {
    if (frame) return;
    frame = (doc.defaultView?.requestAnimationFrame ?? ((callback: FrameRequestCallback) => setTimeout(callback, 16) as unknown as number))(() => {
      frame = 0;
      const rows = table.getFilteredRows().length;
      const view = windowOf(rows);
      if (!drawn || view.start !== drawn.start || view.end !== drawn.end) render();
    });
  };
  if (virtual) {
    if (!rowHeight) {
      const measured = root.querySelector<HTMLElement>('tbody .adt-row')?.getBoundingClientRect().height ?? 0;
      rowHeight = measured > 0 ? measured : 40;
      render();
    }
    scroller.addEventListener('scroll', onScroll, { passive: true });
  }
  const unpin = pinColumns(root, fixed);
  const stopAuto = responsive === 'auto' ? autoResponsive(root) : () => undefined;
  const stopTools = options.resizableColumns || options.reorderableColumns
    ? columnTools(root, table, { resize: options.resizableColumns === true, reorder: options.reorderableColumns === true })
    : () => undefined;
  const unsubscribe = table.subscribe((_, event) => {
    if (event.type === 'selection') patchSelection();
    else render();
  });
  const unsubscribeStatus = status
    ? status.subscribe(() => {
      showStatus();
      if (wantsSkeleton() !== skeletonShown) render(); // placeholders in or out
    })
    : () => undefined;
  return {
    destroy: () => {
      unsubscribe();
      unsubscribeStatus();
      closeDialog();
      editing?.editor.destroy();
      scroller.removeEventListener('scroll', onScroll);
      unpin();
      stopAuto();
      stopTools();
      doc.removeEventListener('click', closeMenus);
      root.remove();
    },
  };
}

/** The responsive priority of a visible column: its own, else 1 for the first column and 2 for the rest. */
export function priorityOf(column: { readonly priority?: 1 | 2 | 3 }, index: number): 1 | 2 | 3 {
  return column.priority ?? (index === 0 ? 1 : 2);
}

/** Numbers and decimals are right-aligned (`adt-num`). */
export function numeric(column: { readonly type?: string }): boolean {
  return column.type === 'number' || column.type === 'decimal';
}

/** The IDs from `a` to `b` (both included) in page order; just `[b]` when `a` is not on the page. */
export function rangeOf(pageIds: readonly string[], a: string, b: string): string[] {
  const start = pageIds.indexOf(a);
  const end = pageIds.indexOf(b);
  if (start === -1 || end === -1) return [b];
  return pageIds.slice(Math.min(start, end), Math.max(start, end) + 1);
}
