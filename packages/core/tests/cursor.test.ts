import { describe, expect, it } from 'vitest';
import { createDataTable, createTableQuery, type ColumnDef } from '../src/index';

type R = { id: number; name: string };
const columns: readonly ColumnDef<R>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', enableSorting: true }];
const rows = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: from + i, name: `N${from + i}` }));
const make = () => createDataTable<R>({ mode: 'server', paging: 'cursor', columns, initialState: { pageSize: 2 } });

describe('cursor paging', () => {
  it('sends the cursor of the page before and only reaches known pages', () => {
    const t = make();
    expect(t.getPaging()).toBe('cursor');
    expect(t.getQuery()).toEqual({ page: 1, pageSize: 2, sorting: [], filters: [] }); // page 1: no cursor
    t.setPageResult({ rows: rows(1, 2), nextCursor: 'c2' });
    expect(t.getPage().pageCount).toBe(2);
    t.setPage(5);
    expect(t.getState().page).toBe(2); // clamped to the furthest known page
    expect(t.getQuery()).toMatchObject({ page: 2, cursor: 'c2' });
    t.setPageResult({ rows: rows(3, 2), nextCursor: 'c3' });
    t.setPage(3);
    t.setPageResult({ rows: rows(5, 1) }); // the last page: no nextCursor
    expect(t.getPage()).toMatchObject({ page: 3, pageCount: 3 });
    t.setPage(1);
    expect(t.getQuery().cursor).toBeUndefined();
  });

  it('starts over when sorting, filters, search or the page size change', () => {
    const t = make();
    t.setPageResult({ rows: rows(1, 2), nextCursor: 'c2' });
    t.setPage(2);
    t.setSorting([{ field: 'name', direction: 'desc' }]);
    expect(t.getState().page).toBe(1);
    expect(t.getPage().pageCount).toBe(1);
    expect(t.getQuery().cursor).toBeUndefined();
  });

  it('keeps the total when the server sends one, and checks its input', () => {
    const t = make();
    t.setPageResult({ rows: rows(1, 2), totalRows: 9, nextCursor: 'c2' });
    expect(t.getPage()).toMatchObject({ totalRows: 9, pageCount: 2 });
    expect(() => createDataTable<R>({ columns, paging: 'cursor' })).toThrow('cursor paging needs mode: "server"');
    expect(() => createTableQuery({ page: 2, pageSize: 2, cursor: '' })).toThrow('cursor must be');
    expect(createDataTable<R>({ mode: 'server', columns }).getPaging()).toBe('pages');
  });
});
