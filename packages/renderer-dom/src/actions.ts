import type { DataTable, Row, RowId, TableQuery } from '@acunsoft/datatable-core';
import { checkTarget, element, icon, placeMenu, type ICONS, type RenderedComponent } from './dom';
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
  /** An icon: `'view'`, `'edit'`, `'delete'`, `'copy'`, `'check'`, `'download'`, or your own `{ path }` (24×24 SVG path data). */
  readonly icon?: ActionIcon;
  /** Show only the icon; the label becomes its accessible name and tooltip. */
  readonly iconOnly?: boolean;
  /** A destructive action, shown in the danger colour. */
  readonly danger?: boolean;
  /** Ask before running (the browser's confirm), e.g. `row => \`Delete ${row.original.name}?\``. */
  readonly confirm?: string | ((row: Row<TData>) => string);
}

export type ActionIcon = keyof typeof ICONS | { readonly path: string };

/** Ask an action's confirm question, if any; true when it may run. */
export function confirmed<TData>(action: RowAction<TData>, row: Row<TData>, view: { confirm(message: string): boolean } = globalThis as never): boolean {
  if (action.confirm === undefined) return true;
  const question = typeof action.confirm === 'function' ? action.confirm(row) : action.confirm;
  return typeof view.confirm !== 'function' || view.confirm(question);
}

/** Split a row's visible actions into the buttons shown in the row and those in its "⋮" menu. */
export function splitActions<TData>(actions: readonly RowAction<TData>[], row: Row<TData>, maxInline = Infinity): {
  readonly inline: readonly RowAction<TData>[];
  readonly menu: readonly RowAction<TData>[];
} {
  const visible = actions.filter(action => action.hidden?.(row) !== true);
  // A menu for a single action is pointless: show it in the row.
  const keep = visible.length <= maxInline + 1 ? visible.length : maxInline;
  return { inline: visible.slice(0, keep), menu: visible.slice(keep) };
}

/** What a bulk action receives. */
export interface BulkSelection<TData> {
  /** Every selected row ID, also those on other pages in server mode. */
  readonly ids: readonly RowId[];
  /** The selected rows the table holds: all of them locally, the current page's in server mode. */
  readonly rows: readonly Row<TData>[];
  /**
   * Server mode, after "Select all N matching": every row matching `query`
   * (its filters and search) is meant, not only `ids`. Apply the action on
   * the server with the same filters.
   */
  readonly allMatching?: boolean;
  readonly query?: TableQuery;
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
  // Server mode: "every matching row" is a flag of the table (selectAllMatching), not a list of IDs.
  const selection = (): BulkSelection<TData> => ({
    ids: table.getState().selectedIds,
    rows: table.getSelectedRows(),
    ...(table.isAllMatchingSelected() ? { allMatching: true, query: table.getQuery() } : {}),
  });
  const matching = element(doc, 'button', { type: 'button', class: 'adt-select-matching', 'data-adt-focus': 'bulk:matching' });
  matching.addEventListener('click', () => table.selectAllMatching());
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
  // Phones: the same choices as one select (styles.css shows it instead of the buttons there).
  const menu = element(doc, 'select', { class: 'adt-control adt-selection-menu', 'aria-label': labels.bulkActions, 'data-adt-focus': 'bulk:menu' });
  menu.addEventListener('change', () => {
    const choice = menu.value;
    menu.value = '';
    if (choice === '__matching') table.selectAllMatching();
    else if (choice === '__clear') table.clearSelection();
    else buttons.find(entry => entry.action.id === choice)?.button.click(); // action ids start with a letter
  });
  root.append(count, ...buttons.map(entry => entry.button), matching, clear, menu);
  container.replaceChildren(root);

  function update(): void {
    const current = selection();
    const total = table.getTotalRows();
    const allMatching = table.isAllMatchingSelected();
    root.hidden = current.ids.length === 0;
    count.textContent = current.ids.length === 0 ? ''
      : allMatching && total !== undefined ? labels.allMatchingSelected(total) : labels.selectedCount(current.ids.length);
    // Offer "every matching row" once the whole page is selected and more rows match.
    const pageIds = table.getPage().rows.map(row => row.id);
    const offer = !allMatching && total !== undefined && total > current.ids.length && table.getSelectionMode() === 'multiple' &&
      pageIds.length > 0 && pageIds.every(id => table.isSelected(id));
    matching.hidden = !offer;
    matching.textContent = offer ? labels.selectAllMatching(total!) : '';
    for (const { action, button } of buttons) {
      if (action.disabled?.(current) === true) button.setAttribute('aria-disabled', 'true');
      else button.removeAttribute('aria-disabled');
    }
    menu.replaceChildren(
      element(doc, 'option', { value: '', disabled: true }, labels.actions),
      ...buttons.map(({ action, button }) => element(doc, 'option', { value: action.id, disabled: button.hasAttribute('aria-disabled') }, action.label)),
      ...(offer ? [element(doc, 'option', { value: '__matching' }, matching.textContent)] : []),
      element(doc, 'option', { value: '__clear' }, labels.clearSelection),
    );
    menu.value = '';
  }
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
  doc: Document, actions: readonly RowAction<TData>[], row: Row<TData>, name: string, labels: DataTableLabels, maxInline = Infinity,
): HTMLTableCellElement {
  const td = element(doc, 'td', { class: 'adt-actions', 'data-label': labels.actions });
  const run = (action: RowAction<TData>, disabled: boolean): void => {
    if (!disabled && confirmed(action, row, doc.defaultView ?? (globalThis as never))) action.onSelect(row);
  };
  const { inline, menu } = splitActions(actions, row, maxInline);
  for (const action of inline) {
    const disabled = action.disabled?.(row) === true;
    const button = element(doc, 'button', {
      type: 'button',
      class: ['adt-action', action.iconOnly && action.icon ? 'adt-action--icon' : '', action.danger ? 'adt-action--danger' : ''].filter(Boolean).join(' '),
      'data-action': action.id,
      'aria-label': labels.rowAction(action.label, name),
      title: action.iconOnly && action.icon ? action.label : undefined,
      'aria-disabled': disabled ? 'true' : undefined,
      'data-adt-focus': `action:${action.id}:${row.id}`,
    });
    if (action.icon) button.append(icon(doc, action.icon));
    if (!(action.iconOnly && action.icon)) button.append(element(doc, 'span', {}, action.label));
    button.addEventListener('click', () => run(action, disabled));
    td.append(button);
  }
  if (menu.length > 0) {
    const details = element(doc, 'details', { class: 'adt-row-menu' });
    const summary = element(doc, 'summary', {
      class: 'adt-action adt-action--icon', 'aria-label': labels.moreActions(name), title: labels.moreActions(name),
      'data-adt-focus': `actions:${row.id}`,
    });
    summary.append(icon(doc, 'more'));
    const list = element(doc, 'div', { class: 'adt-menu-list' });
    for (const action of menu) {
      const disabled = action.disabled?.(row) === true;
      const item = element(doc, 'button', {
        type: 'button', class: action.danger ? 'adt-menu-item adt-menu-item--danger' : 'adt-menu-item', 'data-action': action.id,
        'aria-label': labels.rowAction(action.label, name), 'aria-disabled': disabled ? 'true' : undefined,
      });
      if (action.icon) item.append(icon(doc, action.icon));
      item.append(element(doc, 'span', {}, action.label));
      item.addEventListener('click', () => { details.open = false; run(action, disabled); });
      list.append(item);
    }
    details.addEventListener('keydown', event => {
      if (event.key === 'Escape' && details.open) { details.open = false; summary.focus(); }
    });
    details.addEventListener('toggle', () => placeMenu(details));
    details.append(summary, list);
    td.append(details);
  }
  return td;
}
