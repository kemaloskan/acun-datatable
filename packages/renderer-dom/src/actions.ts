import type { DataTable, Row, RowId } from '@acunsoft/datatable-core';
import { checkTarget, element, type RenderedComponent } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

/** A button in each row's actions cell, e.g. "Edit" or "Delete". */
export interface RowAction<TData> {
  /** Stable key, unique within the table: letters, digits, `_`, `-`. */
  readonly id: string;
  /** Visible button text (plain text). */
  readonly label: string;
  readonly onSelect: (row: Row<TData>) => void;
  /** Leave the button out for this row. */
  readonly hidden?: (row: Row<TData>) => boolean;
  /** Show the button but ignore clicks (`aria-disabled`, focus stays). */
  readonly disabled?: (row: Row<TData>) => boolean;
}

/** What a bulk action receives. */
export interface BulkSelection<TData> {
  /** Every selected row ID, also those on other pages in server mode. */
  readonly ids: readonly RowId[];
  /** The selected rows the table holds: all of them locally, the current page's in server mode. */
  readonly rows: readonly Row<TData>[];
}

/** A button in the bulk-actions bar, applied to the selected rows. */
export interface BulkAction<TData> {
  readonly id: string;
  readonly label: string;
  readonly onSelect: (selection: BulkSelection<TData>) => void;
  readonly disabled?: (selection: BulkSelection<TData>) => boolean;
}

export interface RenderBulkActionsOptions<TData> {
  readonly actions: readonly BulkAction<TData>[];
  readonly labels?: Partial<DataTableLabels>;
}

const ACTION_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;

/** Validate and copy action definitions (shared by row and bulk actions). */
export function checkActions<T extends { readonly id: string; readonly label: string; readonly onSelect: unknown }>(
  actions: unknown, name: string, optional: readonly string[],
): readonly T[] {
  if (!Array.isArray(actions)) throw new TypeError(`${name} must be an array`);
  const seen = new Set<string>();
  for (const action of actions as readonly Partial<Record<string, unknown>>[]) {
    const id = action?.['id'];
    if (typeof id !== 'string' || !ACTION_ID.test(id)) {
      throw new TypeError(`${name}: id must start with a letter and use letters, digits, _ or - (max 64)`);
    }
    if (seen.has(id)) throw new Error(`${name}: duplicate action id "${id}"`);
    seen.add(id);
    if (typeof action['label'] !== 'string' || action['label'].trim() === '') {
      throw new TypeError(`${name}: action "${id}" needs a label`);
    }
    if (typeof action['onSelect'] !== 'function') throw new TypeError(`${name}: action "${id}" needs onSelect`);
    for (const key of optional) {
      if (action[key] !== undefined && typeof action[key] !== 'function') {
        throw new TypeError(`${name}: ${key} of action "${id}" must be a function`);
      }
    }
  }
  return Object.freeze([...(actions as readonly T[])]);
}

/**
 * Render a bar for actions on the selected rows. It is hidden while nothing
 * is selected and shows "N selected", one button per action and "Clear
 * selection". The count is announced politely; controls are updated in place,
 * so focus stays on them. Pair it with `renderTable(…, { selectable: true })`.
 */
export function renderBulkActions<TData>(
  container: HTMLElement, table: DataTable<TData>, options: RenderBulkActionsOptions<TData>,
): RenderedComponent {
  checkTarget(container, table);
  const actions = checkActions<BulkAction<TData>>(options?.actions, 'bulk actions', ['disabled']);
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };

  const root = element(doc, 'div', { class: 'adt-selection', role: 'group', 'aria-label': labels.bulkActions });
  const count = element(doc, 'span', { class: 'adt-selection-count', role: 'status', 'aria-live': 'polite' });
  const selection = (): BulkSelection<TData> => ({
    ids: table.getState().selectedIds,
    rows: table.getSelectedRows(),
  });
  const buttons = actions.map(action => {
    const button = element(doc, 'button', {
      type: 'button', class: 'adt-bulk-action', 'data-action': action.id, 'data-adt-focus': `bulk:${action.id}`,
    }, action.label);
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') action.onSelect(selection());
    });
    return { action, button };
  });
  const clear = element(doc, 'button', { type: 'button', class: 'adt-clear-selection' }, labels.clearSelection);
  clear.addEventListener('click', () => table.clearSelection());
  root.append(count, ...buttons.map(entry => entry.button), clear);
  container.replaceChildren(root);

  const update = (): void => {
    const current = selection();
    root.hidden = current.ids.length === 0;
    count.textContent = current.ids.length === 0 ? '' : labels.selectedCount(current.ids.length);
    for (const { action, button } of buttons) {
      if (action.disabled?.(current) === true) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    }
  };
  update();
  const unsubscribe = table.subscribe(() => update());
  return {
    destroy: () => {
      unsubscribe();
      root.remove();
    },
  };
}

/** Build the actions cell of one row (used by renderTable). */
export function actionCell<TData>(
  doc: Document, actions: readonly RowAction<TData>[], row: Row<TData>, name: string, labels: DataTableLabels,
): HTMLTableCellElement {
  const td = element(doc, 'td', { class: 'adt-actions', 'data-label': labels.actions });
  for (const action of actions) {
    if (action.hidden?.(row) === true) continue;
    const disabled = action.disabled?.(row) === true;
    const button = element(doc, 'button', {
      type: 'button',
      class: 'adt-action',
      'data-action': action.id,
      'aria-label': labels.rowAction(action.label, name),
      'aria-disabled': disabled ? 'true' : undefined,
      'data-adt-focus': `action:${action.id}:${row.id}`,
    }, action.label);
    button.addEventListener('click', () => {
      if (!disabled) action.onSelect(row);
    });
    td.append(button);
  }
  return td;
}

