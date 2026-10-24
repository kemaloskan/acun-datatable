/** Rows to draw for a scroll position: `[start, end)`, and the space above and below them. */
export interface VirtualWindow {
  readonly start: number;
  readonly end: number;
  /** Pixels for the rows above `start`. */
  readonly before: number;
  /** Pixels for the rows from `end` on. */
  readonly after: number;
}

/**
 * The rows of a long list that are in view (with `overscan` rows on each
 * side), for rows of one height. Used by the renderers' `virtual` option and
 * usable for your own lists.
 */
export function virtualWindow(total: number, rowHeight: number, scrollTop: number, viewport: number, overscan = 8): VirtualWindow {
  if (total <= 0) return { start: 0, end: 0, before: 0, after: 0 };
  const height = rowHeight > 0 ? rowHeight : 40;
  const first = Math.floor(Math.max(0, scrollTop) / height);
  const visible = Math.ceil(Math.max(viewport, height) / height);
  const start = Math.max(0, Math.min(total - 1, first - overscan));
  const end = Math.min(total, first + visible + overscan);
  return { start, end, before: start * height, after: (total - end) * height };
}

/** Validate the `virtual` option: `true` or `{ rowHeight?, overscan? }`. */
export function checkVirtual(value: unknown): { rowHeight: number; overscan: number } | undefined {
  if (value === undefined || value === false) return undefined;
  if (value === true) return { rowHeight: 0, overscan: 8 };
  if (typeof value !== 'object' || value === null) throw new TypeError('virtual must be true or { rowHeight, overscan }');
  const { rowHeight = 0, overscan = 8 } = value as { rowHeight?: number; overscan?: number };
  if (!Number.isFinite(rowHeight) || rowHeight < 0) throw new RangeError('virtual.rowHeight must be a positive number of pixels');
  if (!Number.isInteger(overscan) || overscan < 0 || overscan > 100) throw new RangeError('virtual.overscan must be a whole number from 0 to 100');
  return { rowHeight, overscan };
}
