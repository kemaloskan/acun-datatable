import { describe, expect, it } from 'vitest';
import { createRows, paginateRows, type Pagination } from '../src/index';

type Item = { readonly id: number };
const makeRows = (count: number) =>
  createRows(Array.from({ length: count }, (_, index) => ({ id: index + 1 })));
const ids = (rows: readonly { id: string }[]) => rows.map((row) => row.id);

describe('paginateRows', () => {
  it('returns the first page slice with derived metadata', () => {
    const rows = makeRows(25);
    const view = paginateRows(rows, { page: 1, pageSize: 10 });

    expect(ids(view.rows)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
    expect(view).toMatchObject({ page: 1, pageSize: 10, totalRows: 25, pageCount: 3 });
  });

  it('returns a middle and a short final page', () => {
    const rows = makeRows(25);
    expect(ids(paginateRows(rows, { page: 2, pageSize: 10 }).rows)).toEqual(
      ['11', '12', '13', '14', '15', '16', '17', '18', '19', '20'],
    );
    const last = paginateRows(rows, { page: 3, pageSize: 10 });
    expect(ids(last.rows)).toEqual(['21', '22', '23', '24', '25']);
    expect(last.page).toBe(3);
  });

  it('clamps a page beyond the last page instead of throwing', () => {
    const rows = makeRows(25);
    const view = paginateRows(rows, { page: 99, pageSize: 10 });

    expect(view.page).toBe(3);
    expect(ids(view.rows)).toEqual(['21', '22', '23', '24', '25']);
    expect(view.pageCount).toBe(3);
  });

  it('handles empty input as a single empty page', () => {
    const view = paginateRows(makeRows(0), { page: 1, pageSize: 10 });
    expect(view).toMatchObject({ page: 1, pageSize: 10, totalRows: 0, pageCount: 1 });
    expect(view.rows).toEqual([]);
    // An out-of-range page on empty data still clamps to page 1.
    expect(paginateRows(makeRows(0), { page: 5, pageSize: 10 }).page).toBe(1);
  });

  it('respects page-size boundaries and exact divisions', () => {
    const rows = makeRows(20);
    expect(paginateRows(rows, { page: 20, pageSize: 1 })).toMatchObject({
      page: 20,
      pageCount: 20,
    });
    expect(ids(paginateRows(rows, { page: 20, pageSize: 1 }).rows)).toEqual(['20']);
    const whole = paginateRows(makeRows(1000), { page: 1, pageSize: 1000 });
    expect(whole.pageCount).toBe(1);
    expect(whole.rows).toHaveLength(1000);
  });

  it('reuses the same Row wrappers and freezes its output without mutating input', () => {
    const rows = makeRows(5);
    const view = paginateRows(rows, { page: 1, pageSize: 2 });

    expect(view.rows[0]).toBe(rows[0]);
    expect(view.rows[1]).toBe(rows[1]);
    expect(Object.isFrozen(view)).toBe(true);
    expect(Object.isFrozen(view.rows)).toBe(true);
    expect(rows).toHaveLength(5); // input untouched
    expect(() => (view.rows as unknown as unknown[]).push(rows[2])).toThrow(TypeError);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
    'rejects invalid page %s',
    (page) => {
      expect(() => paginateRows(makeRows(3), { page, pageSize: 10 })).toThrow(
        new RangeError('page must be a positive safe integer'),
      );
    },
  );

  it.each([0, -1, 1.5, 1001, Number.NaN])('rejects invalid pageSize %s', (pageSize) => {
    expect(() => paginateRows(makeRows(3), { page: 1, pageSize })).toThrow(
      new RangeError('pageSize must be an integer from 1 to 1000'),
    );
  });

  it('rejects malformed arguments', () => {
    expect(() => paginateRows(null as never, { page: 1, pageSize: 10 })).toThrow(
      'rows must be an array',
    );
    expect(() => paginateRows(makeRows(1), null as never)).toThrow(
      'pagination must be an object',
    );
  });

  it('accepts a createTableState pagination snapshot shape', () => {
    const pagination: Pagination = { page: 2, pageSize: 2 };
    expect(ids(paginateRows(makeRows(5), pagination).rows)).toEqual(['3', '4']);
  });
});
