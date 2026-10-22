import { isDecimal, normalizeValue, type ColumnDef, type DataTable, type Row, type SortRule } from '@acunsoft/datatable-core';
import { checkTarget, element, keepFocus, type RenderedComponent } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

/** Turns a cell value into plain text. It must return a string; HTML is never interpreted. */
export type CellFormatter<TData> = (value: unknown, row: Row<TData>) => string;

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
}

function nextSorting(current: readonly Readonly<SortRule>[], field: string, additive: boolean): SortRule[] {
  const existing = current.find(rule => rule.field === field);
  const direction = !existing ? 'asc' : existing.direction === 'asc' ? 'desc' : undefined;
  if (!additive) return direction ? [{ field, direction }] : [];
  if (!existing) return [...current, { field, direction: 'asc' }];
  return direction
    ? current.map(rule => (rule.field === field ? { field, direction } : rule))
    : current.filter(rule => rule.field !== field);
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
  const numbers = new Intl.NumberFormat(locale);
  const dates = new Intl.DateTimeFormat(locale, { dateStyle: 'medium' });
  const dateTimes = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });
  const columns = table.getColumns();
  const ids = new Set(columns.map(column => column.id));
  for (const [id, formatter] of Object.entries(options.format ?? {})) {
    if (!ids.has(id)) throw new Error(`unknown format column ID: ${id}`);
    if (typeof formatter !== 'function') throw new TypeError(`format for column "${id}" must be a function`);
  }
  if (options.rowLabel !== undefined && typeof options.rowLabel !== 'function') {
    throw new TypeError('rowLabel must be a function');
  }
  const status = options.status;
  if (status !== undefined && (typeof status.getState !== 'function' || typeof status.subscribe !== 'function')) {
    throw new TypeError('status must have getState and subscribe');
  }

  const scaled = new Map<number, Intl.NumberFormat>();
  const decimalFormat = (scale: number): Intl.NumberFormat => {
    let format = scaled.get(scale);
    if (!format) {
      format = new Intl.NumberFormat(locale, { minimumFractionDigits: scale, maximumFractionDigits: scale });
      scaled.set(scale, format);
    }
    return format;
  };
  const text = (column: ColumnDef<TData>, row: Row<TData>): string => {
    const raw = column.accessorFn
      ? column.accessorFn(row.original)
      : (row.original as Record<PropertyKey, unknown>)[column.accessorKey as PropertyKey];
    const formatter = options.format?.[column.id];
    if (formatter) {
      const output = formatter(raw, row);
      if (typeof output !== 'string') throw new TypeError(`format for column "${column.id}" must return a string`);
      return output;
    }
    // Typed columns read text values ("1250.50", "2026-10-23") as their type;
    // an unreadable value is shown as written rather than hidden.
    const value = column.type === undefined ? raw : normalizeValue(raw, column.type) ?? raw;
    if (value == null) return '';
    if (typeof value === 'number') return Number.isNaN(value) ? '' : numbers.format(value);
    if (isDecimal(value)) return decimalFormat(value.scale).format(Number(value.text));
    if (value instanceof Date) {
      if (Number.isNaN(value.getTime())) return '';
      return (column.type === 'datetime' ? dateTimes : dates).format(value);
    }
    if (typeof value === 'boolean') return value ? labels.yes : labels.no;
    return String(value);
  };
  const nameOf = (row: Row<TData>, cells: readonly string[]): string => {
    const name = options.rowLabel ? options.rowLabel(row) : (cells[0] ?? '').trim();
    if (typeof name !== 'string') throw new TypeError('rowLabel must return a string');
    return name === '' ? row.id : name;
  };

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
    const head = element(doc, 'thead');
    head.append(headRow);

    const body = element(doc, 'tbody');
    if (page.rows.length === 0) {
      const tr = element(doc, 'tr', { class: 'adt-empty' });
      tr.append(element(doc, 'td', { colspan: String(columns.length + (selectable ? 1 : 0)) }, labels.empty));
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
