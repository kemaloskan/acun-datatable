import { describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef, type DataTableEvent, type DataTableState } from '../src/index';

type Order = { id: number; customer: string; total: number };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
  { id: 'total', header: 'Tutar', accessorKey: 'total', enableSorting: true, enableFiltering: true },
];
type Listener = (state: Readonly<DataTableState>, event: Readonly<DataTableEvent>) => void;
const serverTable = (initialState = {}) =>
  createDataTable<Order>({ mode: 'server', columns, initialState: { pageSize: 2, ...initialState } });
const rows = (...ids: number[]) => ids.map(id => ({ id, customer: `C${id}`, total: id * 10 }));
const ids = (list: readonly { id: string }[]) => list.map(row => row.id);

describe('createDataTable — server mode', () => {
  it('starts empty with an unknown total and exposes the query', () => {
    const t = serverTable({ sorting: [{ field: 'total', direction: 'desc' }], globalSearch: ' ay ' });
    expect(t.getMode()).toBe('server');
    expect(t.getTotalRows()).toBeUndefined();
    expect(t.getPage()).toEqual({ rows: [], page: 1, pageSize: 2, totalRows: 0, pageCount: 1 });
    expect(t.getQuery()).toEqual({
      page: 1, pageSize: 2, sorting: [{ field: 'total', direction: 'desc' }], filters: [], globalSearch: 'ay',
    });
  });

  it('shows the server page as received, without local sorting or filtering', () => {
    const t = serverTable({ sorting: [{ field: 'total', direction: 'asc' }], globalSearch: 'zzz' });
    t.setPageResult({ rows: rows(9, 3), totalRows: 7 });
    expect(ids(t.getFilteredRows())).toEqual(['9', '3']); // not re-sorted, not filtered
    expect(t.getPage()).toMatchObject({ page: 1, pageSize: 2, totalRows: 7, pageCount: 4 });
    expect(t.getTotalRows()).toBe(7);
    expect(ids(t.getCoreRows())).toEqual(['9', '3']);
  });

  it('emits a result event and changes no other state', () => {
    const t = serverTable();
    const listener = vi.fn<Listener>();
    t.subscribe(listener);
    const before = t.getState();
    t.setPageResult({ rows: rows(1, 2), totalRows: 10 });
    t.setPageResult({ rows: rows(3) }); // unknown total
    expect(listener.mock.calls.map(([, event]) => event)).toEqual([
      { type: 'result', rows: 2, totalRows: 10 },
      { type: 'result', rows: 1 },
    ]);
    expect(t.getState()).toEqual(before);
  });

  it('does not clamp the page while the total is unknown', () => {
    const t = serverTable();
    t.setPage(5);
    expect(t.getState().page).toBe(5);
    t.setPageResult({ rows: rows(9, 10) }); // full page, total unknown
    expect(t.getPage()).toMatchObject({ page: 5, totalRows: 10, pageCount: 6 });
    t.setPageResult({ rows: rows(9) }); // short page: this is the last one
    expect(t.getPage()).toMatchObject({ page: 5, totalRows: 9, pageCount: 5 });
  });

  it('clamps to the last page once the server reports fewer rows', () => {
    const t = serverTable({ page: 4 });
    const listener = vi.fn<Listener>();
    t.subscribe(listener);
    t.setPageResult({ rows: [], totalRows: 5 }); // 3 pages of 2
    expect(t.getState().page).toBe(3);
    expect(listener.mock.calls.map(([, event]) => event.type)).toEqual(['result', 'page']);
    expect(t.getQuery().page).toBe(3); // the caller re-queries
    t.setPage(9);
    expect(t.getState().page).toBe(3);
  });

  it('returns to page 1 when the view changes and keeps validating against columns', () => {
    const t = serverTable({ page: 3 });
    t.setGlobalSearch('ali');
    expect(t.getQuery()).toMatchObject({ page: 1, globalSearch: 'ali' });
    t.setPage(2);
    t.setFilters([{ field: 'total', operator: 'gt', value: 5 }]);
    expect(t.getQuery()).toMatchObject({ page: 1, filters: [{ field: 'total', operator: 'gt', value: 5 }] });
    expect(() => t.setSorting([{ field: 'nope', direction: 'asc' }])).toThrow('unknown sort column ID');
    expect(() => t.setFilters([{ field: 'nope', operator: 'eq', value: 1 }])).toThrow('unknown filter column ID');
  });

  it('keeps selection across pages and accepts IDs that are not loaded', () => {
    const t = serverTable({ selectedIds: ['99'] }); // e.g. restored from a previous visit
    t.setPageResult({ rows: rows(1, 2), totalRows: 4 });
    t.selectRow('1');
    expect(t.getSelectionStatus()).toBe('some');
    t.setPage(2);
    t.setPageResult({ rows: rows(3, 4), totalRows: 4 });
    expect(t.getState().selectedIds).toEqual(['99', '1']); // nothing pruned
    expect(t.getSelectionStatus()).toBe('none'); // default: the loaded page
    t.selectRows(['3', '4']);
    expect(t.getSelectionStatus()).toBe('all');
    expect(ids(t.getSelectedRows())).toEqual(['3', '4']); // loaded rows only
  });

  it('validates page results and keeps state on failure', () => {
    const t = serverTable();
    t.setPageResult({ rows: rows(1), totalRows: 1 });
    const before = t.getPage();
    expect(() => t.setPageResult({ rows: rows(1, 2, 3) })).toThrow('more than the requested page size 2');
    expect(() => t.setPageResult({ rows: rows(1, 1) })).toThrow('duplicate row ID');
    expect(() => t.setPageResult({ rows: [{ customer: 'x', total: 1 }] as never })).toThrow('own id property');
    expect(() => t.setPageResult({ rows: 'x' } as never)).toThrow('rows must be an array');
    expect(() => t.setPageResult({ rows: [], totalRows: -1 })).toThrow('non-negative');
    expect(t.getPage()).toEqual(before);
  });

  it('keeps each mode to its own data method', () => {
    expect(() => serverTable().setData(rows(1))).toThrow('use setPageResult');
    const local = createDataTable<Order>({ data: rows(1), columns });
    expect(() => local.setPageResult({ rows: rows(1) })).toThrow('only available in server mode');
    expect(local.getMode()).toBe('local');
    expect(local.getTotalRows()).toBe(1);
    expect(local.getQuery()).toEqual({ page: 1, pageSize: 25, sorting: [], filters: [] });
    expect(() => createDataTable<Order>({ mode: 'remote' as never, columns })).toThrow('mode must be "local" or "server"');
  });

  it('ignores actions after destroy', () => {
    const t = serverTable();
    t.destroy();
    t.setPageResult({ rows: rows(1), totalRows: 1 });
    expect(t.getPage().rows).toEqual([]);
  });
});
