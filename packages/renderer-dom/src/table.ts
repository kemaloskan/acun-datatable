import type { ColumnDef, DataTable, Row } from '@acunsoft/datatable-core';
import { actionCell, checkActions, type RowAction } from './actions';
import { createCellText, nextSorting, rowName, type CellFormatter } from './cells';
import { checkTarget, element, icon, keepFocus, type RenderedComponent } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

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
   * value of the row in a dialog instead.
   */
  readonly responsive?: ResponsiveMode;
  /** Density with the optional `styles.css`: `'sm'` compact, `'md'` (default), `'lg'` spacious. */
  readonly size?: TableSize;
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
export type ResponsiveMode = 'cards' | 'scroll' | 'collapse' | 'modal';
const RESPONSIVE_MODES: readonly ResponsiveMode[] = ['cards', 'scroll', 'collapse', 'modal'];
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
  const collapsible = responsive === 'collapse' || responsive === 'modal';
  const uid = `adt-${++tables}`;

  const nameOf = (row: Row<TData>, cells: readonly string[]): string => rowName(row, cells[0] ?? '', options.rowLabel);

  const size = checkSize(options.size);
  const root = element(doc, 'div', { class: `adt-table-wrap adt-responsive--${responsive}${size === 'md' ? '' : ` adt-size--${size}`}` });
  const scroller = element(doc, 'div', { class: 'adt-scroll' });
  const notice = element(doc, 'div', { class: 'adt-notice', role: 'status', 'aria-live': 'polite' });
  root.append(notice, scroller);
  container.replaceChildren(root);

  // Responsive collapse: rows whose details are open (kept across re-renders).
  const expanded = new Set<string>();
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
      const item = element(doc, 'div', { class: `adt-detail-item${all ? '' : ` adt-col--p${level}`}` });
      item.append(element(doc, 'dt', {}, column.header), element(doc, 'dd', {}, cells[index]));
      list.append(item);
    });
    if (rowActions.length > 0) {
      const item = element(doc, 'div', { class: `adt-detail-item${all ? '' : ' adt-col--p2'}` });
      const actions = actionCell(doc, rowActions, row, nameOf(row, cells), labels);
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
    dialog.replaceChildren(head, detailList(row, cells, columns, true));
    dialogRow = row.id;
    if (!dialog.open) {
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    }
  };

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

  const render = (): void => keepFocus(root, () => {
    const state = table.getState();
    const page = table.getPage();
    const selectable = options.selectable === true;
    const columns = table.getVisibleColumns();
    pageIds = page.rows.map(row => row.id);
    selectAll = undefined;
    rowParts = [];

    const tableEl = element(doc, 'table', { class: 'adt-table' });
    if (options.caption !== undefined) tableEl.append(element(doc, 'caption', {}, options.caption));

    const headRow = element(doc, 'tr');
    const levels = new Set(columns.map((column, index) => priorityOf(column, index)));
    if (rowActions.length > 0) levels.add(2);
    if (collapsible) {
      if (levels.has(2)) tableEl.classList.add('adt-has-p2');
      if (levels.has(3)) tableEl.classList.add('adt-has-p3');
      headRow.append(element(doc, 'td', { class: 'adt-expand-cell' }));
    }
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
      const th = element(doc, 'th', { scope: 'col', class: `adt-th${collapsible ? ` adt-col--p${priorityOf(column, columns.indexOf(column))}` : ''}` });
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
          table.setSorting(nextSorting(table.getState().sorting, column.id, event.shiftKey));
        });
        th.append(button);
      } else {
        th.textContent = column.header;
      }
      headRow.append(th);
    }
    if (rowActions.length > 0) {
      headRow.append(element(doc, 'th', { scope: 'col', class: `adt-th adt-actions${collapsible ? ' adt-col--p2' : ''}` }, labels.actions));
    }
    const head = element(doc, 'thead');
    head.append(headRow);

    const body = element(doc, 'tbody');
    const span = columns.length + (selectable ? 1 : 0) + (rowActions.length > 0 ? 1 : 0) + (collapsible ? 1 : 0);
    if (page.rows.length === 0) {
      const tr = element(doc, 'tr', { class: 'adt-empty' });
      tr.append(element(doc, 'td', { colspan: String(span) }, labels.empty));
      body.append(tr);
    }
    for (const row of page.rows) {
      const cells = columns.map(column => text(column, row));
      const tr = element(doc, 'tr', { class: 'adt-row', 'data-row-id': row.id });
      const open = responsive === 'collapse' && expanded.has(row.id);
      const detailId = `${uid}-detail-${rowParts.length}`;
      if (collapsible) {
        const td = element(doc, 'td', { class: 'adt-expand-cell' });
        const button = element(doc, 'button', {
          type: 'button', class: 'adt-expand', 'aria-label': labels.details(nameOf(row, cells)), 'data-adt-focus': `expand:${row.id}`,
          ...(responsive === 'collapse'
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
        box = element(doc, 'input', {
          type: 'checkbox', 'aria-label': labels.selectRow(nameOf(row, cells)), 'data-adt-focus': `select:${row.id}`,
        });
        box.addEventListener('change', () => table.toggleRow(row.id));
        td.append(box);
        tr.append(td);
      }
      columns.forEach((column, index) => tr.append(element(doc, 'td', {
        'data-label': column.header, ...(collapsible ? { class: `adt-col--p${priorityOf(column, index)}` } : {}),
      }, cells[index])));
      if (rowActions.length > 0) {
        const cell = actionCell(doc, rowActions, row, nameOf(row, cells), labels);
        if (collapsible) cell.classList.add('adt-col--p2');
        tr.append(cell);
      }
      rowParts.push({ id: row.id, tr, box });
      body.append(tr);
      if (open) {
        tr.classList.add('adt-row--expanded');
        const detail = element(doc, 'tr', { class: 'adt-detail', id: detailId });
        const td = element(doc, 'td', { colspan: String(span) });
        td.append(detailList(row, cells, columns, false));
        detail.append(td);
        body.append(detail);
      }
      if (dialogRow === row.id) openDialog(row, cells, columns); // keep an open dialog current
    }
    if (dialogRow !== undefined && !pageIds.includes(dialogRow)) closeDialog(); // its row left the page
    tableEl.append(head, body);
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
  const unsubscribe = table.subscribe((_, event) => {
    if (event.type === 'selection') patchSelection();
    else render();
  });
  const unsubscribeStatus = status ? status.subscribe(() => showStatus()) : () => undefined;
  return {
    destroy: () => {
      unsubscribe();
      unsubscribeStatus();
      closeDialog();
      root.remove();
    },
  };
}

/** The responsive priority of a visible column: its own, else 1 for the first column and 2 for the rest. */
export function priorityOf(column: { readonly priority?: 1 | 2 | 3 }, index: number): 1 | 2 | 3 {
  return column.priority ?? (index === 0 ? 1 : 2);
}
