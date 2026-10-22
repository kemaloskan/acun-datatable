import type { Pagination } from './index';
import type { Row } from './rows';

/** Same bounds as createTableState; kept in sync intentionally. */
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 1000;

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

function validatePage(page: number): void {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('page must be a positive safe integer');
  }
}

function validatePageSize(pageSize: number): void {
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < MIN_PAGE_SIZE ||
    pageSize > MAX_PAGE_SIZE
  ) {
    throw new RangeError('pageSize must be an integer from 1 to 1000');
  }
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
