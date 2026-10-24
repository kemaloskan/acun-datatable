import { COLUMN_WIDTH_LIMITS, type DataTable } from '@acunsoft/datatable-core';

export interface ColumnToolsOptions {
  /** Drag the edge of a header, or use the arrow keys on it, to set a column's width. */
  readonly resize?: boolean;
  /** Drag a header onto another to move the column (the column menu has buttons for the keyboard). */
  readonly reorder?: boolean;
}

/** Pixels per arrow key on a resize handle; with Shift, `BIG_STEP`. */
const STEP = 16;
const BIG_STEP = 64;

const clamp = (width: number): number => Math.min(COLUMN_WIDTH_LIMITS.max, Math.max(COLUMN_WIDTH_LIMITS.min, Math.round(width)));

/**
 * Resizing and moving columns on a rendered table, through events on
 * `container` (so it survives re-renders): every renderer (DOM, Vue, React)
 * draws the same markup — `th[data-column-id]`, `draggable` headers and
 * `.adt-resize` handles — and this does the rest.
 *
 * Resize: drag a handle (Escape cancels), use ←/→ on it (Shift: larger
 * steps), Delete or a double click returns the column to its natural width.
 * The first resize fixes every visible column at its current width, so
 * nothing else jumps. Move: drag a header onto another; it lands before or
 * after it, by the side of the drop. Returns `stop`.
 */
export function columnTools<TData>(container: HTMLElement, table: DataTable<TData>, options: ColumnToolsOptions): () => void {
  const doc = container.ownerDocument;
  const headers = (): HTMLTableCellElement[] => [...container.querySelectorAll<HTMLTableCellElement>('thead th[data-column-id]')];
  const header = (id: string): HTMLTableCellElement | undefined => headers().find(th => th.dataset['columnId'] === id);
  const widthOf = (id: string): number => table.getState().columnWidths[id] ?? clamp(header(id)?.getBoundingClientRect().width ?? 0);

  /** Before the first resize: every visible column keeps its current width. */
  const fixWidths = (): void => {
    const current = table.getState().columnWidths;
    const visible = table.getVisibleColumns();
    if (visible.every(column => current[column.id] !== undefined)) return;
    const actions = container.querySelector<HTMLElement>('thead th.adt-actions');
    if (actions) container.style.setProperty('--adt-actions-width', `${Math.ceil(actions.getBoundingClientRect().width)}px`);
    const widths: Record<string, number> = {};
    for (const column of visible) widths[column.id] = current[column.id] ?? clamp(header(column.id)?.getBoundingClientRect().width ?? 0);
    table.setColumnWidths(widths);
  };

  // Resizing ----------------------------------------------------------------
  let drag: { id: string; startX: number; start: number; width: number } | undefined;
  const show = (id: string, width: number): void => {
    const th = header(id);
    if (!th) return;
    th.style.width = `${width}px`;
    th.querySelector('.adt-resize')?.setAttribute('aria-valuenow', String(width));
  };
  const onMove = (event: PointerEvent): void => {
    if (!drag) return;
    drag.width = clamp(drag.start + event.clientX - drag.startX);
    show(drag.id, drag.width);
  };
  const finish = (commit: boolean): void => {
    if (!drag) return;
    const { id, start, width } = drag;
    drag = undefined;
    container.classList.remove('adt-resizing');
    doc.removeEventListener('pointermove', onMove);
    doc.removeEventListener('pointerup', onUp);
    doc.removeEventListener('keydown', onEscape, true);
    if (commit) table.setColumnWidth(id, width);
    else show(id, start);
  };
  const onUp = (): void => finish(true);
  const onEscape = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') { event.stopPropagation(); finish(false); }
  };
  const onPointerDown = (event: PointerEvent): void => {
    const handle = (event.target as Element | null)?.closest?.<HTMLElement>('.adt-resize');
    if (!handle || !container.contains(handle) || event.button !== 0) return;
    const id = handle.dataset['columnId'];
    if (!id) return;
    event.preventDefault(); // no text selection, no header drag
    fixWidths();
    const start = widthOf(id);
    drag = { id, startX: event.clientX, start, width: start };
    container.classList.add('adt-resizing');
    doc.addEventListener('pointermove', onMove);
    doc.addEventListener('pointerup', onUp);
    doc.addEventListener('keydown', onEscape, true);
  };
  const onKeyDown = (event: KeyboardEvent): void => {
    const handle = (event.target as Element | null)?.closest?.<HTMLElement>('.adt-resize');
    const id = handle?.dataset['columnId'];
    if (!handle || !id) return;
    const step = event.shiftKey ? BIG_STEP : STEP;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      fixWidths();
      table.setColumnWidth(id, widthOf(id) + (event.key === 'ArrowRight' ? step : -step));
    } else if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault();
      table.setColumnWidth(id, undefined);
    }
  };
  const onDoubleClick = (event: MouseEvent): void => {
    const id = (event.target as Element | null)?.closest?.<HTMLElement>('.adt-resize')?.dataset['columnId'];
    if (id) table.setColumnWidth(id, undefined);
  };

  // Moving -------------------------------------------------------------------
  let dragged: string | undefined;
  const clearMarks = (): void => {
    container.querySelectorAll('.adt-drop-before, .adt-drop-after, .adt-dragging')
      .forEach(node => node.classList.remove('adt-drop-before', 'adt-drop-after', 'adt-dragging'));
  };
  const target = (event: DragEvent): { th: HTMLTableCellElement; after: boolean } | undefined => {
    const th = (event.target as Element | null)?.closest?.<HTMLTableCellElement>('thead th[data-column-id]');
    if (!th || !dragged || th.dataset['columnId'] === dragged || !container.contains(th)) return undefined;
    const box = th.getBoundingClientRect();
    return { th, after: event.clientX > box.left + box.width / 2 };
  };
  const onDragStart = (event: DragEvent): void => {
    const th = (event.target as Element | null)?.closest?.<HTMLTableCellElement>('thead th[data-column-id][draggable="true"]');
    if (!th || drag) return;
    dragged = th.dataset['columnId'];
    event.dataTransfer?.setData('text/plain', dragged ?? '');
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move';
    th.classList.add('adt-dragging');
  };
  const onDragOver = (event: DragEvent): void => {
    const hit = target(event);
    if (!hit) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    container.querySelectorAll('.adt-drop-before, .adt-drop-after').forEach(node => {
      if (node !== hit.th) node.classList.remove('adt-drop-before', 'adt-drop-after');
    });
    hit.th.classList.toggle('adt-drop-before', !hit.after);
    hit.th.classList.toggle('adt-drop-after', hit.after);
  };
  const onDrop = (event: DragEvent): void => {
    const hit = target(event);
    const id = dragged;
    dragged = undefined;
    clearMarks();
    if (!hit || !id) return;
    event.preventDefault();
    const order = table.getState().columnOrder.filter(other => other !== id);
    table.moveColumn(id, order.indexOf(hit.th.dataset['columnId']!) + (hit.after ? 1 : 0));
  };
  const onDragEnd = (): void => { dragged = undefined; clearMarks(); };

  // A focusable separator needs its value: the measured width until one is set.
  const fillValues = (): void => {
    for (const th of headers()) {
      const handle = th.querySelector<HTMLElement>('.adt-resize');
      if (handle && !handle.hasAttribute('aria-valuenow')) handle.setAttribute('aria-valuenow', String(clamp(th.getBoundingClientRect().width)));
    }
  };
  const onFocus = (event: FocusEvent): void => {
    const handle = (event.target as Element | null)?.closest?.<HTMLElement>('.adt-resize');
    const th = handle?.closest('th');
    if (handle && th) handle.setAttribute('aria-valuenow', String(clamp(th.getBoundingClientRect().width)));
  };
  const view = container.ownerDocument.defaultView;
  const observer = options.resize && view && typeof view.MutationObserver === 'function'
    ? new view.MutationObserver(() => fillValues())
    : undefined;

  const listeners: [string, EventListener][] = [];
  const on = <K extends keyof HTMLElementEventMap>(type: K, listener: (event: HTMLElementEventMap[K]) => void): void => {
    container.addEventListener(type, listener as EventListener);
    listeners.push([type, listener as EventListener]);
  };
  if (options.resize) {
    fillValues();
    observer?.observe(container, { childList: true, subtree: true });
    on('focusin', onFocus);
    on('pointerdown', onPointerDown);
    on('keydown', onKeyDown);
    on('dblclick', onDoubleClick);
  }
  if (options.reorder) {
    on('dragstart', onDragStart);
    on('dragover', onDragOver);
    on('drop', onDrop);
    on('dragend', onDragEnd);
  }
  return () => {
    observer?.disconnect();
    finish(false);
    for (const [type, listener] of listeners) container.removeEventListener(type, listener);
  };
}
