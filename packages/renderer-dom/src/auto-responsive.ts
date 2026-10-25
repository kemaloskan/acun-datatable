/**
 * `responsive: 'auto'`: hide the columns that do not fit, measured instead
 * of fixed breakpoints (DataTables Responsive). Columns go lowest priority
 * first (`adt-col--p3`, then `--p2`; ties from the right); priority 1 always
 * stays. Hidden cells get `adt-auto-hidden`, their values in the details
 * (`[data-column-id]` items) `adt-auto-shown`, and the table
 * `adt-auto-collapsed` while anything is hidden, which shows the ⊕ buttons.
 * Columns the user sized (the table has `adt-user-widths`) are a choice: then
 * nothing is hidden and the table scrolls sideways. Works on the markup of
 * every renderer and follows re-renders and resizes.
 * Returns `stop`.
 */
export function autoResponsive(container: HTMLElement): () => void {
  const view = container.ownerDocument.defaultView;
  let observer: MutationObserver | undefined;
  // Re-renders, and class changes such as a Livewire update putting the markup back.
  const watch = (): void => observer?.observe(container, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  const apply = (): void => {
    observer?.disconnect(); // our own changes must not trigger another pass
    const table = container.querySelector<HTMLTableElement>('table.adt-table');
    const head = table?.tHead?.rows[table.tHead.rows.length - 1];
    const scroller = table?.parentElement;
    if (table && head && scroller) {
      const cells = [...head.cells];
      // Widths the user set are a choice: keep every column and let the table scroll sideways.
      const userWidths = table.classList.contains('adt-user-widths');
      const idOf = (cell: HTMLTableCellElement): string | undefined =>
        cell.dataset['columnId'] ?? (cell.classList.contains('adt-actions') ? '__actions' : undefined);
      const level = (cell: HTMLTableCellElement): number => Number(/adt-col--p(\d)/.exec(cell.className)?.[1] ?? 1);
      // Hiding order: priority 3 before 2, then from the right.
      const candidates = cells.map((cell, index) => ({ cell, index, level: level(cell) }))
        .filter(item => item.level > 1 && idOf(item.cell) !== undefined)
        .sort((a, b) => b.level - a.level || b.index - a.index);
      const rows = [...table.rows].filter(row => row.cells.length === cells.length);
      const setHidden = (hidden: Set<number>): void => {
        for (const row of rows) [...row.cells].forEach((cell, index) => cell.classList.toggle('adt-auto-hidden', hidden.has(index)));
        const ids = new Set([...hidden].map(index => idOf(cells[index]!)));
        table.querySelectorAll<HTMLElement>('.adt-detail-item[data-column-id]')
          .forEach(item => item.classList.toggle('adt-auto-shown', ids.has(item.dataset['columnId']!)));
        table.classList.toggle('adt-auto-collapsed', hidden.size > 0);
      };
      const hidden = new Set<number>();
      setHidden(hidden);
      const overflows = (): boolean => table.scrollWidth > scroller.clientWidth + 1;
      for (const candidate of userWidths ? [] : candidates) {
        if (!overflows()) break;
        hidden.add(candidate.index);
        setHidden(hidden);
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
  if (view && typeof view.MutationObserver === 'function') observer = new view.MutationObserver(schedule);
  apply();
  const resize = view && typeof (view as { ResizeObserver?: unknown }).ResizeObserver === 'function'
    ? new (view as unknown as { ResizeObserver: typeof ResizeObserver }).ResizeObserver(schedule)
    : undefined;
  resize?.observe(container);
  return () => {
    observer?.disconnect();
    observer = undefined;
    resize?.disconnect();
  };
}
