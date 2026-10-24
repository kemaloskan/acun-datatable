/** Columns kept in place while the table scrolls sideways (DataTables `fixedColumns`). */
export interface FixedColumns {
  /** Data columns at the start; the checkbox and ⊕ columns before them stay too. */
  readonly start?: number;
  /** Cells at the end, counting the actions column. */
  readonly end?: number;
}

/** The largest share of the visible width that pinned cells may take. */
const MAX_PINNED = 0.6;

/** Validate `fixedColumns`: whole numbers from 0 to 10. */
export function checkFixedColumns(value: unknown): { start: number; end: number } {
  if (value === undefined || value === null) return { start: 0, end: 0 };
  if (typeof value !== 'object') throw new TypeError('fixedColumns must be { start, end }');
  const { start = 0, end = 0 } = value as FixedColumns;
  for (const [name, count] of [['start', start], ['end', end]] as const) {
    if (!Number.isInteger(count) || count < 0 || count > 10) throw new RangeError(`fixedColumns.${name} must be a whole number from 0 to 10`);
  }
  return { start, end };
}

/**
 * Keep the first and last columns of the `.adt-table` inside `container` in
 * place while it scrolls sideways: each pinned cell gets `adt-pin` and a
 * sticky offset measured from the header row, so columns of any width line
 * up. Offsets follow re-renders (the table may be replaced) and size
 * changes. Pinned cells never take more than 60% of the visible width: on a
 * narrow screen the end cells scroll again first, then the start ones. The renderers call this for their `fixedColumns` option; it also
 * works on markup rendered elsewhere. Returns `stop`.
 */
export function pinColumns(container: HTMLElement, fixed: FixedColumns): () => void {
  const { start, end } = checkFixedColumns(fixed);
  const view = container.ownerDocument.defaultView;
  let observer: MutationObserver | undefined;
  const watch = (): void => observer?.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });

  const apply = (): void => {
    observer?.disconnect(); // our own changes must not trigger another pass
    const table = container.querySelector<HTMLTableElement>('table.adt-table');
    const head = table?.tHead?.rows[table.tHead.rows.length - 1];
    if (table && head) {
      const cells = [...head.cells];
      const firstData = cells.findIndex(cell => cell.classList.contains('adt-th'));
      let startCount = start > 0 ? Math.min(cells.length, (firstData < 0 ? 0 : firstData) + start) : 0;
      let endCount = Math.min(end, cells.length - startCount);
      const width = (index: number): number => cells[index]!.getBoundingClientRect().width;
      // Pinned cells may take at most 60% of the visible width (phones): the end ones go first, then the start.
      const visible = (table.parentElement ?? container).getBoundingClientRect().width;
      const sum = (from: number, to: number): number => { let total = 0; for (let index = from; index < to; index++) total += width(index); return total; };
      const startWidth = sum(0, startCount);
      if (visible > 0 && startWidth + sum(cells.length - endCount, cells.length) > visible * MAX_PINNED) endCount = 0;
      if (visible > 0 && startWidth > visible * MAX_PINNED) startCount = 0;
      const offsets = new Map<number, { side: 'start' | 'end'; px: number; edge: boolean }>();
      for (let index = 0, x = 0; index < startCount; index++) {
        offsets.set(index, { side: 'start', px: x, edge: index === startCount - 1 });
        x += width(index);
      }
      for (let index = cells.length - 1, x = 0; index >= cells.length - endCount; index--) {
        offsets.set(index, { side: 'end', px: x, edge: index === cells.length - endCount });
        x += width(index);
      }
      for (const row of table.rows) {
        // Rows that span columns (details, empty text) are left alone.
        if (row.cells.length !== cells.length) continue;
        [...row.cells].forEach((cell, index) => {
          const pin = offsets.get(index);
          cell.classList.toggle('adt-pin', pin !== undefined);
          cell.classList.toggle('adt-pin--edge-start', pin?.side === 'start' && pin.edge);
          cell.classList.toggle('adt-pin--edge-end', pin?.side === 'end' && pin.edge);
          cell.style.left = pin?.side === 'start' ? `${pin.px}px` : '';
          cell.style.right = pin?.side === 'end' ? `${pin.px}px` : '';
        });
      }
    }
    watch();
  };

  let queued = false;
  const schedule = (): void => {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; apply(); });
  };
  if (start > 0 || end > 0) {
    if (view && typeof view.MutationObserver === 'function') observer = new view.MutationObserver(schedule);
    apply();
  }
  const resize = (start > 0 || end > 0) && view && typeof (view as { ResizeObserver?: unknown }).ResizeObserver === 'function'
    ? new (view as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver(schedule)
    : undefined;
  resize?.observe(container);
  return () => {
    observer?.disconnect();
    observer = undefined;
    resize?.disconnect();
  };
}
