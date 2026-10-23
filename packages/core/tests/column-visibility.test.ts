import { describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '../src/index';

type Order = { id: number; customer: string; city: string; total: number };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true, enableFiltering: true, enableHiding: false },
  { id: 'city', header: 'City', accessorKey: 'city', enableFiltering: true },
  { id: 'total', header: 'Total', accessorKey: 'total', enableSorting: true },
];
const data: Order[] = [
  { id: 1, customer: 'Ayşe', city: 'İstanbul', total: 10 },
  { id: 2, customer: 'Ali', city: 'Ankara', total: 20 },
];
const make = (hiddenColumns?: string[]) => createDataTable<Order>({
  data, columns, ...(hiddenColumns ? { initialState: { hiddenColumns } } : {}),
});
const ids = (list: readonly { id: string }[]) => list.map(column => column.id);

describe('column visibility', () => {
  it('shows every column by default and accepts hidden columns at first', () => {
    expect(ids(make().getVisibleColumns())).toEqual(['customer', 'city', 'total']);
    const table = make(['total', 'city']);
    expect(table.getState().hiddenColumns).toEqual(['city', 'total']); // column order
    expect(ids(table.getVisibleColumns())).toEqual(['customer']);
    expect(ids(table.getColumns())).toEqual(['customer', 'city', 'total']); // definitions are unchanged
  });

  it('hides and shows one column with one event, keeping the page and the query', () => {
    const table = createDataTable<Order>({ data, columns, initialState: { pageSize: 1, page: 2 } });
    const listener = vi.fn();
    table.subscribe(listener);
    table.setColumnVisibility('city', false);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![1]).toEqual({ type: 'columnVisibility', hiddenColumns: ['city'] });
    expect(table.getState()).toMatchObject({ page: 2, hiddenColumns: ['city'] });
    expect(table.getQuery()).not.toHaveProperty('hiddenColumns');
    table.setColumnVisibility('city', false); // no change: no event
    table.setColumnVisibility('city', true);
    expect(listener).toHaveBeenCalledTimes(2);
    expect(ids(table.getVisibleColumns())).toEqual(['customer', 'city', 'total']);
  });

  it('keeps sorting, filtering and search on hidden columns', () => {
    const table = make(['city']);
    table.setGlobalSearch('ankara');
    expect(table.getPage().rows.map(row => row.original.customer)).toEqual(['Ali']);
    table.setGlobalSearch('');
    table.setColumnVisibility('total', false);
    table.setSorting([{ field: 'total', direction: 'desc' }]);
    expect(table.getPage().rows.map(row => row.original.customer)).toEqual(['Ali', 'Ayşe']);
  });

  it('returns frozen snapshots and does not keep the caller array', () => {
    const hidden = ['city'];
    const table = make(hidden);
    hidden.push('total');
    expect(table.getState().hiddenColumns).toEqual(['city']);
    expect(Object.isFrozen(table.getState().hiddenColumns)).toBe(true);
    expect(Object.isFrozen(table.getVisibleColumns())).toBe(true);
  });

  it('rejects unknown, protected, duplicate and all-hiding requests', () => {
    const table = make();
    expect(() => table.setColumnVisibility('nope', false)).toThrow('unknown column ID: nope');
    expect(() => table.setColumnVisibility('customer', false)).toThrow('hiding is disabled for column "customer"');
    expect(() => table.setColumnVisibility('city', 'no' as never)).toThrow('visible must be a boolean');
    expect(() => table.setHiddenColumns(['city', 'city'])).toThrow('duplicate hidden column ID');
    expect(() => table.setHiddenColumns('city' as never)).toThrow('hiddenColumns must be an array');
    expect(() => make(['nope'])).toThrow('unknown column ID');
    const open = createDataTable<Order>({ data, columns: columns.slice(1) });
    expect(() => open.setHiddenColumns(['city', 'total'])).toThrow('at least one column must stay visible');
    expect(table.getState().hiddenColumns).toEqual([]);
  });

  it('validates enableHiding and ignores calls after destroy', () => {
    expect(() => createDataTable<Order>({
      data, columns: [{ id: 'city', header: 'City', accessorKey: 'city', enableHiding: 'yes' as never }],
    })).toThrow('enableHiding must be a boolean');
    const table = make();
    table.destroy();
    table.setColumnVisibility('city', false);
    expect(table.getState().hiddenColumns).toEqual([]);
  });
});
