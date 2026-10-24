import type { DataTable } from '@acunsoft/datatable-core';
import { checkTarget, element, icon, type RenderedComponent } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

export interface RenderColumnToggleOptions {
  readonly labels?: Partial<DataTableLabels>;
}

/**
 * Render a "Columns" menu (`<details>`) with one labelled checkbox per column.
 * Columns with `enableHiding: false` and the last visible column cannot be
 * unchecked. Native elements only: it works with the keyboard (Enter/Space on
 * the summary, Tab and Space in the list) and is updated in place.
 */
export function renderColumnToggle<TData>(
  container: HTMLElement, table: DataTable<TData>, options: RenderColumnToggleOptions = {},
): RenderedComponent {
  checkTarget(container, table);
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };

  const root = element(doc, 'details', { class: 'adt-columns' });
  const fieldset = element(doc, 'fieldset');
  fieldset.append(element(doc, 'legend', {}, labels.showColumns));
  const boxes = table.getColumns().map(column => {
    const box = element(doc, 'input', { type: 'checkbox', value: column.id });
    box.addEventListener('change', () => table.setColumnVisibility(column.id, box.checked));
    const label = element(doc, 'label');
    label.append(box, element(doc, 'span', {}, column.header));
    fieldset.append(label);
    return { column, box };
  });
  const summary = element(doc, 'summary', {}, labels.columns);
  summary.prepend(icon(doc, 'columns'));
  root.append(summary, fieldset);
  container.replaceChildren(root);
  // Close like a menu: Escape (focus back on the summary) or a click outside.
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.open) {
      root.open = false;
      summary.focus();
    }
  });
  const outside = (event: Event): void => {
    if (root.open && !root.contains(event.target as Node)) root.open = false;
  };
  doc.addEventListener('click', outside);

  const update = (): void => {
    const hidden = table.getState().hiddenColumns;
    const lastVisible = boxes.length - hidden.length === 1;
    for (const { column, box } of boxes) {
      box.checked = !hidden.includes(column.id);
      box.disabled = column.enableHiding === false || (lastVisible && box.checked);
    }
  };
  update();
  const unsubscribe = table.subscribe((_, event) => {
    if (event.type === 'columnVisibility') update();
  });
  return {
    destroy: () => {
      unsubscribe();
      doc.removeEventListener('click', outside);
      root.remove();
    },
  };
}
