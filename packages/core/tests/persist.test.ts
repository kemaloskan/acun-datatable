import { describe, expect, it } from 'vitest';
import { createDataTable, persistState, type ColumnDef, type StateStorage } from '../src/index';

type R = { id: number; name: string; total: number };
const columns: readonly ColumnDef<R>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', enableSorting: true, enableFiltering: true },
  { id: 'total', header: 'Total', accessorKey: 'total', type: 'number', enableSorting: true, enableFiltering: true },
];
const data = Array.from({ length: 50 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}`, total: i }));
const memory = (): StateStorage & { items: Map<string, string> } => {
  const items = new Map<string, string>();
  return { items, getItem: key => items.get(key) ?? null, setItem: (key, value) => { items.set(key, value); } };
};

describe('persistState', () => {
  it('saves every change and restores it in a new table', () => {
    const storage = memory();
    const first = createDataTable<R>({ data, columns });
    persistState(first, { key: 'orders', storage });
    first.setPageSize(10);
    first.setSorting([{ field: 'total', direction: 'desc' }]);
    first.setFilters([{ field: 'total', operator: 'gte', value: 5 }]);
    first.setHiddenColumns(['name']);
    first.setPage(3);
    first.toggleRow('1'); // the selection is not kept

    const second = createDataTable<R>({ data, columns });
    persistState(second, { key: 'orders', storage });
    expect(second.getState()).toMatchObject({
      page: 3, pageSize: 10, sorting: [{ field: 'total', direction: 'desc' }],
      filters: [{ field: 'total', operator: 'gte', value: 5 }], hiddenColumns: ['name'], selectedIds: [],
    });
  });

  it('applies the page again when rows arrive later and skips parts that no longer fit', () => {
    const storage = memory();
    storage.setItem('acun-datatable:late', JSON.stringify({ v: 1, state: { page: 4, pageSize: 10, sorting: [{ field: 'gone', direction: 'asc' }] } }));
    const table = createDataTable<R>({ data: [], columns });
    persistState(table, { key: 'late', storage });
    expect(table.getState()).toMatchObject({ page: 1, pageSize: 10, sorting: [] }); // no rows yet; unknown column skipped
    table.setData(data);
    expect(table.getState().page).toBe(4);
  });

  it('ignores unreadable or old data, honours include and works without storage', () => {
    const storage = memory();
    storage.setItem('acun-datatable:x', '{oops');
    const table = createDataTable<R>({ data, columns });
    persistState(table, { key: 'x', storage, include: ['globalSearch'] });
    table.setGlobalSearch('row 1');
    table.setPage(2);
    expect(JSON.parse(storage.items.get('acun-datatable:x')!)).toEqual({ v: 1, state: { globalSearch: 'row 1' } });
    expect(() => persistState(table, { key: '' })).toThrow('needs a key');
    expect(() => persistState(table, { key: 'k', include: ['selectedIds' as never] })).toThrow('cannot keep');
    expect(typeof persistState(table, { key: 'nothing' })).toBe('function'); // no localStorage in node: a no-op
  });
});

describe('persistState with cursor paging', () => {
  it('keeps the sort and size but not the page, which only the pages before it lead to', () => {
    const storage = memory();
    const first = createDataTable<R>({ mode: 'server', paging: 'cursor', columns });
    persistState(first, { key: 'cursor', storage });
    first.setPageSize(10);
    first.setPageResult({ rows: data.slice(0, 10), nextCursor: 'c2' });
    first.setPage(2);
    expect(JSON.parse(storage.items.get('acun-datatable:cursor')!).state).not.toHaveProperty('page');
    const second = createDataTable<R>({ mode: 'server', paging: 'cursor', columns });
    persistState(second, { key: 'cursor', storage });
    second.setPageResult({ rows: data.slice(0, 10), nextCursor: 'c2' });
    expect(second.getState()).toMatchObject({ page: 1, pageSize: 10 });
  });
});
