import { validatePage, validatePageSize, type Pagination } from './state';
import type { Row } from './rows';

/** The visible slice of a row view plus derived, clamped page metadata. */
export interface PageView<TData> {
  /** Rows visible on the effective page; a frozen slice of the input wrappers. */
  readonly rows: readonly Row<TData>[];
  /** Effective 1-based page after clamping into `[1, pageCount]`. */
  readonly page: number;
  readonly pageSize: number;
  readonly totalRows: number;
  /** Number of pages; at least 1 even when there are no rows. */
  readonly pageCount: number;
}

/**
 * Return the visible page of a row view without mutating the input.
 *
 * `page` and `pageSize` are validated with the same rules as `createTableState`.
 * A `page` beyond the last page is clamped to the final page (rows shrinking
 * must not throw); the clamped value is reported in the result. An empty input
 * yields `pageCount` 1 and an empty slice. The same `Row` wrappers are reused.
 */
export function paginateRows<TData>(
  rows: readonly Row<TData>[],
  pagination: Pagination,
): PageView<TData> {
  if (!Array.isArray(rows)) throw new TypeError('rows must be an array');
  if (!pagination || typeof pagination !== 'object') {
    throw new TypeError('pagination must be an object with page and pageSize');
  }
  const { page, pageSize } = pagination;
  validatePage(page);
  validatePageSize(pageSize);

  const totalRows = rows.length;
  const pageCount = totalRows === 0 ? 1 : Math.ceil(totalRows / pageSize);
  const effectivePage = Math.min(page, pageCount);
  const start = (effectivePage - 1) * pageSize;
  const visible = Object.freeze(rows.slice(start, start + pageSize));

  return Object.freeze({
    rows: visible,
    page: effectivePage,
    pageSize,
    totalRows,
    pageCount,
  });
}

/** One entry of a numbered pager: a page number or a gap (`…`). */
export type PageItem = number | 'gap';

export interface PageItemsOptions {
  /** Pages shown on each side of the current page. Default 1. */
  readonly siblings?: number;
  /** Pages always shown at the start and the end. Default 1. */
  readonly boundaries?: number;
}

/**
 * The numbers of a pager such as `1 … 4 5 6 … 20`. While there are more pages
 * than fit, the list always has the same length (`2·boundaries + 2·siblings + 3`),
 * so the pager does not change width as the user moves through it. A gap
 * replaces at least two pages; a single hidden page is shown as its number.
 */
export function getPageItems(page: number, pageCount: number, options: PageItemsOptions = {}): readonly PageItem[] {
  const siblings = options.siblings ?? 1;
  const boundaries = options.boundaries ?? 1;
  for (const [name, value] of [['page', page], ['pageCount', pageCount]] as const) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
  }
  for (const [name, value] of [['siblings', siblings], ['boundaries', boundaries]] as const) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 10) throw new RangeError(`${name} must be an integer from 0 to 10`);
  }
  const current = Math.min(page, pageCount);
  const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);
  const slots = 2 * boundaries + 2 * siblings + 3;
  if (pageCount <= slots) return Object.freeze(range(1, pageCount));

  // The window around the current page slides between the two gaps without changing size.
  const start = Math.max(Math.min(current - siblings, pageCount - boundaries - 2 * siblings - 1), boundaries + 2);
  const end = Math.min(Math.max(current + siblings, boundaries + 2 * siblings + 2), pageCount - boundaries - 1);
  return Object.freeze([
    ...range(1, boundaries),
    start > boundaries + 2 ? 'gap' as const : boundaries + 1,
    ...range(start, end),
    end < pageCount - boundaries - 1 ? 'gap' as const : pageCount - boundaries,
    ...range(pageCount - boundaries + 1, pageCount),
  ]);
}
