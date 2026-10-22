import type { ColumnDef, DataTable, Row, SortRule } from '@acunsoft/datatable-core';
import { checkTarget, element, keepFocus, type RenderedComponent } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

/** Turns a cell value into plain text. It must return a string; HTML is never interpreted. */
export type CellFormatter<TData> = (value: unknown, row: Row<TData>) => string;

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
 * shown literally and never parsed as HTML. Keyboard focus survives re-renders.
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
  const columns = table.getColumns();
  const ids = new Set(columns.map(column => column.id));
  for (const [id, formatter] of Object.entries(options.format ?? {})) {
    if (!ids.has(id)) throw new Error(`unknown format column ID: ${id}`);
    if (typeof formatter !== 'function') throw new TypeError(`format for column "${id}" must be a function`);
  }

  const text = (column: ColumnDef<TData>, row: Row<TData>): string => {
    const value = column.accessorFn
      ? column.accessorFn(row.original)
      : (row.original as Record<PropertyKey, unknown>)[column.accessorKey as PropertyKey];
    const formatter = options.format?.[column.id];
    if (formatter) {
      const output = formatter(value, row);
      if (typeof output !== 'string') throw new TypeError(`format for column "${column.id}" must return a string`);
      return output;
    }
    if (value == null) return '';
    if (typeof value === 'number') return Number.isNaN(value) ? '' : numbers.format(value);
    if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : dates.format(value);
    return String(value);
  };

  const root = element(doc, 'div', { class: 'adt-table-wrap' });
  container.replaceChildren(root);

  const render = (): void => keepFocus(root, () => {
    const state = table.getState();
    const page = table.getPage();
    const selectable = options.selectable === true;
    const pageIds = page.rows.map(row => row.id);

    const tableEl = element(doc, 'table', { class: 'adt-table' });
    if (options.caption !== undefined) tableEl.append(element(doc, 'caption', {}, options.caption));

    const headRow = element(doc, 'tr');
    if (selectable) {
      const th = element(doc, 'th', { scope: 'col', class: 'adt-select' });
      if (table.getSelectionMode() === 'multiple' && pageIds.length > 0) {
        const status = table.getSelectionStatus(pageIds);
        const box = element(doc, 'input', { type: 'checkbox', 'aria-label': labels.selectAll, 'data-adt-focus': 'select-all' });
        box.checked = status === 'all';
        box.indeterminate = status === 'some';
        box.addEventListener('change', () => {
          if (table.getSelectionStatus(pageIds) === 'all') {
            table.setSelectedRows(table.getState().selectedIds.filter(id => !pageIds.includes(id)));
          } else {
            table.selectRows(pageIds);
          }
        });
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
      const selected = table.isSelected(row.id);
      const tr = element(doc, 'tr', { class: selected ? 'adt-row adt-row--selected' : 'adt-row', 'data-row-id': row.id });
      if (selectable) {
        const td = element(doc, 'td', { class: 'adt-select' });
        const box = element(doc, 'input', {
          type: 'checkbox', 'aria-label': labels.selectRow(row.id), 'data-adt-focus': `select:${row.id}`,
        });
        box.checked = selected;
        box.addEventListener('change', () => table.toggleRow(row.id));
        td.append(box);
        tr.append(td);
      }
      for (const column of columns) tr.append(element(doc, 'td', {}, text(column, row)));
      body.append(tr);
    }
    tableEl.append(head, body);
    root.replaceChildren(tableEl);
  });

  render();
  const unsubscribe = table.subscribe(() => render());
  return {
    destroy: () => {
      unsubscribe();
      root.remove();
    },
  };
}
