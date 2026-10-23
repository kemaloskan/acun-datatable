import type { DataTable, Row } from '@acunsoft/datatable-core';
import { actionCell, checkActions, type RowAction } from './actions';
import { createCellText, nextSorting, rowName, type CellFormatter } from './cells';
import { checkTarget, element, keepFocus, type RenderedComponent } from './dom';
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
}

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

  const nameOf = (row: Row<TData>, cells: readonly string[]): string => rowName(row, cells[0] ?? '', options.rowLabel);

  const root = element(doc, 'div', { class: 'adt-table-wrap' });
  const scroller = element(doc, 'div', { class: 'adt-scroll' });
  const notice = element(doc, 'div', { class: 'adt-notice', role: 'status', 'aria-live': 'polite' });
  root.append(notice, scroller);
  container.replaceChildren(root);

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
      const th = element(doc, 'th', { scope: 'col', class: 'adt-th' });
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
    if (rowActions.length > 0) headRow.append(element(doc, 'th', { scope: 'col', class: 'adt-th adt-actions' }, labels.actions));
    const head = element(doc, 'thead');
    head.append(headRow);

    const body = element(doc, 'tbody');
    if (page.rows.length === 0) {
      const tr = element(doc, 'tr', { class: 'adt-empty' });
      const span = columns.length + (selectable ? 1 : 0) + (rowActions.length > 0 ? 1 : 0);
      tr.append(element(doc, 'td', { colspan: String(span) }, labels.empty));
      body.append(tr);
    }
    for (const row of page.rows) {
      const cells = columns.map(column => text(column, row));
      const tr = element(doc, 'tr', { class: 'adt-row', 'data-row-id': row.id });
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
      columns.forEach((column, index) => tr.append(element(doc, 'td', { 'data-label': column.header }, cells[index])));
      if (rowActions.length > 0) tr.append(actionCell(doc, rowActions, row, nameOf(row, cells), labels));
      rowParts.push({ id: row.id, tr, box });
      body.append(tr);
    }
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
      root.remove();
    },
  };
}
