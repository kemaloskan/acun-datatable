import type { DataTable } from '@acunsoft/datatable-core';
import { checkTarget, element, icon, keepFocus, placeMenu, type RenderedComponent } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

export interface RenderColumnToggleOptions {
  readonly labels?: Partial<DataTableLabels>;
  /** Up/down buttons per column to change the order with the keyboard (`columnOrder`). */
  readonly reorderable?: boolean;
}

/** Whether the column order or widths differ from the defaults (the menu then offers "Reset columns"). */
export function columnsChanged<TData>(table: DataTable<TData>): boolean {
  const { columnOrder, columnWidths } = table.getState();
  return Object.keys(columnWidths).length > 0 || table.getColumns().some((column, index) => columnOrder[index] !== column.id);
}

/** Restore the definition order and natural widths. */
export function resetColumns<TData>(table: DataTable<TData>): void {
  table.setColumnOrder([]);
  table.setColumnWidths({});
}

/**
 * Render a "Columns" menu (`<details>`) with one labelled checkbox per column,
 * in display order. Columns with `enableHiding: false` and the last visible
 * column cannot be unchecked. With `reorderable`, up/down buttons move a
 * column; "Reset columns" appears once the order or widths were changed.
 * Native elements only: it works with the keyboard (Enter/Space on the
 * summary, Tab and Space in the list) and keeps focus while it updates.
 */
export function renderColumnToggle<TData>(
  container: HTMLElement, table: DataTable<TData>, options: RenderColumnToggleOptions = {},
): RenderedComponent {
  checkTarget(container, table);
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };

  const root = element(doc, 'details', { class: 'adt-columns' });
  const fieldset = element(doc, 'fieldset');
  const summary = element(doc, 'summary');
  summary.append(icon(doc, 'columns'), element(doc, 'span', { class: 'adt-summary-text' }, labels.columns));
  root.append(summary, fieldset);
  root.addEventListener('toggle', () => placeMenu(root));
  container.replaceChildren(root);
  // Close like a menu: Escape (focus back on the summary) or a click outside.
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.open) {
      root.open = false;
      summary.focus();
    }
  });
  const outside = (event: Event): void => {
    // The path at the time of the click: a control that re-rendered away still counts as inside.
    if (root.open && !event.composedPath().includes(root)) root.open = false;
  };
  doc.addEventListener('click', outside);

  const update = (): void => keepFocus(fieldset, () => {
    const { hiddenColumns: hidden, columnOrder } = table.getState();
    const columns = table.getColumns();
    const byId = new Map(columns.map(column => [column.id, column]));
    const lastVisible = columns.length - hidden.length === 1;
    const items = columnOrder.map((id, index) => {
      const column = byId.get(id)!;
      const shown = !hidden.includes(id);
      const box = element(doc, 'input', { type: 'checkbox', value: id, 'data-adt-focus': `show:${id}` });
      box.checked = shown;
      box.disabled = column.enableHiding === false || (lastVisible && shown);
      box.addEventListener('change', () => table.setColumnVisibility(id, box.checked));
      const label = element(doc, 'label');
      label.append(box, element(doc, 'span', {}, column.header));
      if (!options.reorderable) return label;
      const item = element(doc, 'div', { class: 'adt-column-item' });
      const move = (direction: 'up' | 'down'): HTMLButtonElement => {
        const to = direction === 'up' ? index - 1 : index + 1;
        const disabled = to < 0 || to >= columnOrder.length;
        const button = element(doc, 'button', {
          type: 'button', class: 'adt-move', 'data-adt-focus': `${direction}:${id}`,
          'aria-label': direction === 'up' ? labels.moveColumnUp(column.header) : labels.moveColumnDown(column.header),
          ...(disabled ? { 'aria-disabled': 'true' } : {}),
        });
        button.append(icon(doc, direction));
        button.addEventListener('click', () => { if (!disabled) table.moveColumn(id, to); });
        return button;
      };
      item.append(label, move('up'), move('down'));
      return item;
    });
    const reset = element(doc, 'button', { type: 'button', class: 'adt-columns-reset' }, labels.resetColumns);
    reset.addEventListener('click', () => { resetColumns(table); summary.focus(); });
    fieldset.replaceChildren(element(doc, 'legend', {}, labels.showColumns), ...items, ...(columnsChanged(table) ? [reset] : []));
  });
  update();
  const unsubscribe = table.subscribe((_, event) => {
    if (event.type === 'columnVisibility' || event.type === 'columnOrder' || event.type === 'columnWidths') update();
  });
  return {
    destroy: () => {
      unsubscribe();
      doc.removeEventListener('click', outside);
      root.remove();
    },
  };
}
