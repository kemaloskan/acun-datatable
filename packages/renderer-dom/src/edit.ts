import { isDecimal, normalizeValue, type ColumnDef, type FilterOption, type Row } from '@acunsoft/datatable-core';
import { element } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

/** What `onEdit` gets when a cell was changed in place. */
export interface CellEdit<TData> {
  readonly row: Row<TData>;
  readonly column: ColumnDef<TData>;
  /**
   * The new value, read as the column's type: a number, a decimal as text
   * (`"1250.50"`), a date as `YYYY-MM-DD`, a date-time as an ISO string, a
   * boolean, an option's value, or `null` for an emptied cell.
   */
  readonly value: unknown;
  /** The value before the edit, as the row has it. */
  readonly previous: unknown;
}

/**
 * Saves an edit; the table does not change your data. Update it (local
 * mode: `setData`; server mode: reload) once saved. A rejected promise or a
 * thrown error keeps the editor open with the error's message.
 */
export type EditHandler<TData> = (edit: CellEdit<TData>) => unknown;

/** The control a column is edited with. */
export type EditorKind = 'text' | 'number' | 'decimal' | 'date' | 'datetime' | 'boolean' | 'select';

/** Whether a renderer should offer editing for this column. */
export function isEditable(column: { readonly editable?: unknown }): boolean {
  return column.editable !== undefined && column.editable !== false;
}

function optionsOf(column: ColumnDef<unknown>): readonly FilterOption[] | undefined {
  return typeof column.editable === 'object' ? column.editable.options : undefined;
}

export function editorKind(column: ColumnDef<unknown>): EditorKind {
  if (optionsOf(column)) return 'select';
  return column.type ?? 'text';
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The text an editor starts with for a raw cell value. */
export function editText(column: ColumnDef<unknown>, raw: unknown): string {
  const kind = editorKind(column);
  if (kind === 'select') return raw === null || raw === undefined ? '' : String(raw);
  const value = column.type === undefined ? raw : normalizeValue(raw, column.type);
  if (value === null || value === undefined) return '';
  if (isDecimal(value)) return value.text;
  if (value instanceof Date) {
    const day = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
    return kind === 'datetime' ? `${day}T${pad(value.getHours())}:${pad(value.getMinutes())}` : day;
  }
  return String(value);
}

/**
 * Read what was typed as the column's type. A decimal comma is accepted
 * (`12,5`); an empty field is `null` (text keeps `''`). `{ ok: false }` when
 * the text cannot be read.
 */
export function parseEdit(column: ColumnDef<unknown>, input: string | boolean): { ok: true; value: unknown } | { ok: false } {
  const kind = editorKind(column);
  if (kind === 'boolean') return { ok: true, value: input === true || input === 'true' };
  const text = String(input);
  if (kind === 'text') return { ok: true, value: text };
  if (kind === 'select') {
    const option = optionsOf(column)!.find(choice => String(choice.value) === text);
    return option ? { ok: true, value: option.value } : text === '' ? { ok: true, value: null } : { ok: false };
  }
  const trimmed = text.trim();
  if (trimmed === '') return { ok: true, value: null };
  if (kind === 'number' || kind === 'decimal') {
    const dotted = /^[+-]?\d+,\d+$/.test(trimmed) ? trimmed.replace(',', '.') : trimmed;
    const value = normalizeValue(dotted, kind);
    if (value === undefined) return { ok: false };
    return { ok: true, value: isDecimal(value) ? value.text : value };
  }
  if (kind === 'date') return /^\d{4}-\d{2}-\d{2}$/.test(trimmed) && normalizeValue(trimmed, 'date') !== undefined ? { ok: true, value: trimmed } : { ok: false };
  const date = normalizeValue(trimmed, 'datetime');
  return date instanceof Date ? { ok: true, value: date.toISOString() } : { ok: false };
}

export interface CellEditorOptions<TData> {
  readonly row: Row<TData>;
  readonly column: ColumnDef<TData>;
  /** The cell's raw value. */
  readonly value: unknown;
  readonly labels?: Partial<DataTableLabels>;
  readonly onEdit: EditHandler<TData>;
  /** The editor is done: `saved` after a successful save, else cancelled or unchanged. */
  readonly onClose: (saved: boolean) => void;
}

/** A mounted editor: its root element (renderers may move it between re-renders), `focus` and `destroy`. */
export interface CellEditor {
  readonly element: HTMLElement;
  focus(): void;
  destroy(): void;
}

/**
 * The in-place editor of one cell, shared by the DOM, Vue and React tables:
 * a control chosen by the column type (text, number, decimal, date,
 * date-time, yes/no, or a list for `editable.options`). Enter or leaving the
 * field saves through `onEdit`, Escape cancels; a value that cannot be read,
 * or a failed save, shows a message and keeps the editor open. While saving
 * the control is read-only and `aria-busy`.
 */
export function cellEditor<TData>(doc: Document, options: CellEditorOptions<TData>): CellEditor {
  const { row, column } = options;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };
  const kind = editorKind(column as ColumnDef<unknown>);
  const initial = editText(column as ColumnDef<unknown>, options.value);
  const root = element(doc, 'div', { class: 'adt-editor' });
  const message = element(doc, 'span', { class: 'adt-edit-message', role: 'status', 'aria-live': 'polite' });
  let control: HTMLInputElement | HTMLSelectElement;
  if (kind === 'select' || kind === 'boolean') {
    const select = element(doc, 'select', { class: 'adt-edit-control', 'aria-label': column.header, 'data-adt-focus': 'editor' });
    const choices = kind === 'boolean'
      ? [{ value: 'true', label: labels.yes }, { value: 'false', label: labels.no }]
      : [{ value: '', label: '—' }, ...optionsOf(column as ColumnDef<unknown>)!.map(choice => ({ value: String(choice.value), label: choice.label }))];
    for (const choice of choices) select.append(element(doc, 'option', { value: choice.value }, choice.label));
    select.value = kind === 'boolean' ? (initial === 'true' ? 'true' : 'false') : initial;
    control = select;
  } else {
    const type = kind === 'date' ? 'date' : kind === 'datetime' ? 'datetime-local' : 'text';
    const input = element(doc, 'input', {
      type, class: 'adt-edit-control', 'aria-label': column.header, autocomplete: 'off', 'data-adt-focus': 'editor',
      ...(kind === 'number' || kind === 'decimal' ? { inputmode: 'decimal' } : {}),
    });
    input.value = initial;
    control = input;
  }
  root.append(control, message);

  let state: 'editing' | 'saving' | 'closed' = 'editing';
  const close = (saved: boolean): void => {
    if (state === 'closed') return;
    state = 'closed';
    options.onClose(saved);
  };
  const fail = (text: string): void => {
    state = 'editing';
    control.removeAttribute('aria-busy');
    control.toggleAttribute('readonly', false);
    control.disabled = false;
    control.setAttribute('aria-invalid', 'true');
    message.setAttribute('role', 'alert');
    message.textContent = text;
    control.focus();
  };
  const commit = (): void => {
    if (state !== 'editing') return;
    const current = control.value;
    if (current === (kind === 'boolean' ? (initial === 'true' ? 'true' : 'false') : initial)) return close(false);
    const parsed = parseEdit(column as ColumnDef<unknown>, kind === 'boolean' ? current === 'true' : current);
    if (!parsed.ok) return fail(labels.invalidValue);
    state = 'saving';
    control.removeAttribute('aria-invalid');
    control.setAttribute('aria-busy', 'true');
    if (control instanceof HTMLSelectElement) control.disabled = true;
    else control.readOnly = true;
    message.setAttribute('role', 'status');
    message.textContent = labels.saving;
    void (async () => {
      try {
        await options.onEdit({ row, column, value: parsed.value, previous: options.value });
        message.textContent = '';
        close(true);
      } catch (error) {
        if ((state as string) === 'closed') return; // the editor went away meanwhile
        fail(error instanceof Error && error.message ? error.message : labels.saveFailed);
      }
    })();
  };
  control.addEventListener('keydown', event => {
    if ((event as KeyboardEvent).key === 'Enter') { event.preventDefault(); commit(); }
    if ((event as KeyboardEvent).key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (state !== 'saving') close(false); }
  });
  // Leaving the field saves; a renderer moving the editor between re-renders is not leaving it.
  control.addEventListener('blur', () => { queueMicrotask(() => { if (control.isConnected && doc.activeElement !== control) commit(); }); });
  // A list saves once picked with the pointer; from the keyboard (arrows may change it while closed) with Enter or on leaving.
  if (kind === 'select' || kind === 'boolean') {
    let pointer = false;
    control.addEventListener('pointerdown', () => { pointer = true; });
    control.addEventListener('keydown', () => { pointer = false; });
    control.addEventListener('change', () => { if (pointer) commit(); });
  }

  return {
    element: root,
    focus: () => {
      control.focus();
      if (control instanceof HTMLInputElement && control.type === 'text') control.select();
    },
    destroy: () => { state = 'closed'; root.remove(); },
  };
}
