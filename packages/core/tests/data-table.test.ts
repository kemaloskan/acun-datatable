import { describe, expect, it, vi } from 'vitest';
import {
  createDataTable, type ColumnDef, type DataTableEvent, type DataTableState,
} from '../src/index';

type Order = { id: number; customer: string; total: number; city: string };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
  { id: 'total', header: 'Tutar', accessorKey: 'total', enableSorting: true, enableFiltering: true },
  { id: 'city', header: 'Şehir', accessorKey: 'city', enableFiltering: true },
];
const orders: Order[] = [
  { id: 1, customer: 'Ayşe', total: 90, city: 'İstanbul' },
  { id: 2, customer: 'Ali', total: 250, city: 'Ankara' },
  { id: 3, customer: 'Can', total: 40, city: 'İzmir' },
  { id: 4, customer: 'Deniz', total: 250, city: 'İstanbul' },
  { id: 5, customer: 'Ece', total: 120, city: 'Bursa' },
];
type Listener = (state: Readonly<DataTableState>, event: Readonly<DataTableEvent>) => void;
const ids = (rows: readonly { id: string }[]) => rows.map(row => row.id);
const table = (overrides: Partial<Parameters<typeof createDataTable<Order>>[0]> = {}) =>
  createDataTable<Order>({ data: orders, columns, locale: 'tr', ...overrides });
const events = (listener: ReturnType<typeof vi.fn<Listener>>) => listener.mock.calls.map(([, event]) => event.type);

describe('createDataTable — view', () => {
  it('starts with defaults and a frozen state', () => {
    const t = table();
    expect(t.getState()).toEqual({ page: 1, pageSize: 25, sorting: [], filters: [], globalSearch: '', selectedIds: [] });
    expect(Object.isFrozen(t.getState())).toBe(true);
    expect(ids(t.getCoreRows())).toEqual(['1', '2', '3', '4', '5']);
    expect(t.getPage()).toMatchObject({ page: 1, pageCount: 1, totalRows: 5 });
  });

  it('runs rows → sort → filter/search → page', () => {
    const t = table({ initialState: { pageSize: 2 } });
    t.setSorting([{ field: 'total', direction: 'desc' }, { field: 'customer', direction: 'asc' }]);
    expect(ids(t.getFilteredRows())).toEqual(['2', '4', '5', '1', '3']);
    t.setFilters([{ field: 'total', operator: 'gt', value: 50 }]);
    expect(ids(t.getFilteredRows())).toEqual(['2', '4', '5', '1']);
    t.setGlobalSearch('istanbul');
    expect(ids(t.getFilteredRows())).toEqual(['4', '1']);
    expect(ids(t.getPage().rows)).toEqual(['4', '1']);
    t.setGlobalSearch('');
    t.setPage(2);
    expect(ids(t.getPage().rows)).toEqual(['5', '1']);
    expect(t.getPage()).toMatchObject({ page: 2, pageCount: 2, totalRows: 4 });
  });

  it('applies and validates the initial state, clamping the page', () => {
    const t = table({ initialState: {
      page: 9, pageSize: 2, sorting: [{ field: 'customer', direction: 'asc' }],
      filters: [{ field: 'city', operator: 'contains', value: 'i' }], globalSearch: '', selectedIds: ['3'],
    } });
    expect(t.getState()).toMatchObject({ page: 2, pageSize: 2, selectedIds: ['3'] });
    expect(ids(t.getFilteredRows())).toEqual(['1', '3', '4']); // Ayşe, Can, Deniz
    expect(ids(t.getPage().rows)).toEqual(['4']);
  });

  it('uses getRowId when given', () => {
    const t = createDataTable({
      data: [{ code: 'B', n: 2 }, { code: 'A', n: 1 }],
      columns: [{ id: 'n', header: '', accessorKey: 'n', enableSorting: true }],
      getRowId: row => row.code,
      initialState: { sorting: [{ field: 'n', direction: 'asc' }] },
    });
    expect(ids(t.getFilteredRows())).toEqual(['A', 'B']);
  });
});

describe('createDataTable — page rules and events', () => {
  it('returns to page 1 when sorting, filters, search or page size change', () => {
    for (const change of [
      (t: ReturnType<typeof table>) => t.setSorting([{ field: 'total', direction: 'asc' }]),
      (t: ReturnType<typeof table>) => t.setFilters([{ field: 'total', operator: 'gt', value: 0 }]),
      (t: ReturnType<typeof table>) => t.setGlobalSearch('a'),
      (t: ReturnType<typeof table>) => t.setPageSize(3),
    ]) {
      const t = table({ initialState: { pageSize: 2, page: 3 } });
      expect(t.getState().page).toBe(3);
      change(t);
      expect(t.getState().page).toBe(1);
    }
  });

  it('keeps the page within range and emits only effective changes', () => {
    const t = table({ initialState: { pageSize: 2 } });
    const listener = vi.fn<Listener>();
    t.subscribe(listener);
    t.setPage(99); // clamps to 3
    t.setPage(3); // same page: no event
    t.setPageSize(2); // same size: no event
    t.setSorting([]); // same sorting: no event
    t.setFilters([]); // same filters: no event
    t.setGlobalSearch(''); // same search: no event
    expect(t.getState().page).toBe(3);
    expect(events(listener)).toEqual(['page']);
    expect(listener.mock.calls[0]![1]).toEqual({ type: 'page', page: 3 });
  });

  it('emits exactly one documented event per action with the resulting state', () => {
    const t = table();
    const listener = vi.fn<Listener>();
    t.subscribe(listener);
    t.setSorting([{ field: 'total', direction: 'desc' }]);
    t.setFilters([{ field: 'city', operator: 'eq', value: 'Ankara' }]);
    t.setGlobalSearch('ali');
    t.setPageSize(10);
    t.selectRow('2');
    t.setData(orders.slice(2));
    expect(events(listener)).toEqual(['sorting', 'filters', 'globalSearch', 'pageSize', 'selection', 'data']);
    const [state, event] = listener.mock.calls[0]!;
    expect(event).toEqual({ type: 'sorting', sorting: [{ field: 'total', direction: 'desc' }] });
    expect(state.sorting).toEqual([{ field: 'total', direction: 'desc' }]);
    expect(Object.isFrozen(event)).toBe(true);
    expect(listener.mock.calls[4]![1]).toEqual({ type: 'selection', change: { action: 'select', added: ['2'], removed: [] } });
    expect(listener.mock.calls[5]![1]).toEqual({ type: 'data', totalRows: 3, removedIds: ['2'] });
  });

  it('treats equal filter values, including Dates, as unchanged', () => {
    const t = createDataTable({
      data: [{ id: 1, d: new Date('2025-01-01') }],
      columns: [{ id: 'd', header: '', accessorKey: 'd', enableFiltering: true }],
      initialState: { filters: [{ field: 'd', operator: 'eq', value: new Date('2025-01-01') }] },
    });
    const listener = vi.fn<Listener>();
    t.subscribe(listener);
    t.setFilters([{ field: 'd', operator: 'eq', value: new Date('2025-01-01') }]);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe('createDataTable — data', () => {
  it('replaces data, re-sorts, clamps the page and prunes the selection', () => {
    const t = table({ initialState: { pageSize: 2, page: 3, sorting: [{ field: 'customer', direction: 'asc' }], selectedIds: ['1', '5'] } });
    t.setData([{ id: 5, customer: 'Ece', total: 1, city: 'X' }, { id: 7, customer: 'Bora', total: 2, city: 'Y' }]);
    expect(ids(t.getFilteredRows())).toEqual(['7', '5']);
    expect(t.getState()).toMatchObject({ page: 1, selectedIds: ['5'] });
  });

  it('never mutates or keeps caller arrays', () => {
    const data = orders.map(order => ({ ...order }));
    const filters = [{ field: 'total', operator: 'gt' as const, value: 50 }];
    const t = table({ data, initialState: { filters } });
    filters.push({ field: 'total', operator: 'gt', value: 1000 });
    data.reverse();
    expect(ids(t.getFilteredRows())).toEqual(['1', '2', '4', '5']);
    t.setSorting([{ field: 'total', direction: 'asc' }]);
    expect(data.map(order => order.id)).toEqual([5, 4, 3, 2, 1]);
    expect(Object.isFrozen(t.getState().filters[0])).toBe(true);
  });
});

describe('createDataTable — selection', () => {
  it('selects through the table, defaults status to the current page and lists rows in data order', () => {
    const t = table({ initialState: { pageSize: 2 } });
    t.selectRows(['2', '1']);
    expect(t.getSelectionStatus()).toBe('all'); // page 1 = rows 1, 2
    t.setPage(2);
    expect(t.getSelectionStatus()).toBe('none');
    t.toggleRow('3');
    expect(t.getSelectionStatus()).toBe('some');
    expect(ids(t.getSelectedRows())).toEqual(['1', '2', '3']);
    t.deselectRow('1');
    t.setSelectedRows(['5']);
    expect(t.isSelected('5')).toBe(true);
    t.clearSelection();
    expect(t.getState().selectedIds).toEqual([]);
  });

  it('keeps the selection while rows are filtered out', () => {
    const t = table();
    t.selectRow('3');
    t.setGlobalSearch('ankara');
    expect(t.getState().selectedIds).toEqual(['3']);
    expect(t.getSelectionStatus()).toBe('none');
  });

  it('only accepts IDs of rows in the table', () => {
    const t = table();
    expect(() => t.selectRow('99')).toThrow('unknown row ID: 99');
    expect(() => t.toggleRow('99')).toThrow('unknown row ID: 99');
    expect(() => t.selectRows(['1', '99'])).toThrow('unknown row ID: 99');
    expect(() => t.setSelectedRows(['99'])).toThrow('unknown row ID: 99');
    expect(() => table({ initialState: { selectedIds: ['99'] } })).toThrow('unknown row ID: 99');
    t.deselectRow('99'); // no-op, not an error
    expect(t.getState().selectedIds).toEqual([]);
  });

  it('supports single mode', () => {
    const t = table({ selectionMode: 'single' });
    expect(t.getSelectionMode()).toBe('single');
    expect(table().getSelectionMode()).toBe('multiple');
    t.selectRow('1');
    t.selectRow('2');
    expect(t.getState().selectedIds).toEqual(['2']);
    expect(() => t.selectRows(['3'])).toThrow('requires mode "multiple"');
  });
});

describe('createDataTable — validation and lifecycle', () => {
  it('rejects invalid input without changing state', () => {
    const t = table();
    const before = t.getState();
    expect(() => t.setSorting([{ field: 'city', direction: 'asc' }])).toThrow('sorting is disabled for column "city"');
    expect(() => t.setSorting([{ field: 'nope', direction: 'asc' }])).toThrow('unknown sort column ID: nope');
    expect(() => t.setSorting([{ field: 'total', direction: 'up' as never }])).toThrow('must be "asc" or "desc"');
    expect(() => t.setFilters([{ field: 'nope', operator: 'eq', value: 1 }])).toThrow('unknown filter column ID');
    expect(() => t.setFilters('x' as never)).toThrow('filters must be an array');
    expect(() => t.setGlobalSearch(1 as never)).toThrow('globalSearch must be a string');
    expect(() => t.setPage(0)).toThrow(RangeError);
    expect(() => t.setPageSize(1001)).toThrow(RangeError);
    expect(() => t.setData([{ id: 1 } as Order, { id: 1 } as Order])).toThrow('duplicate row ID');
    expect(() => t.selectRow(1 as never)).toThrow('row ID must be a non-empty string');
    expect(t.getState()).toBe(before);
    expect(ids(t.getCoreRows())).toEqual(['1', '2', '3', '4', '5']);
  });

  it('rejects invalid options', () => {
    expect(() => createDataTable(null as never)).toThrow('options must be an object');
    expect(() => table({ initialState: { sorting: [{ field: 'city', direction: 'asc' }] } })).toThrow('sorting is disabled');
    expect(() => table({ initialState: { pageSize: 0 } })).toThrow(RangeError);
    expect(() => table({ initialState: { globalSearch: 5 as never } })).toThrow('globalSearch must be a string');
    expect(() => table({ selectionMode: 'many' as never })).toThrow('mode must be');
    expect(() => createDataTable({ data: [{ code: 'x' }], columns: [] } as never)).toThrow('own id property');
  });

  it('supports unsubscribe and destroy', () => {
    const t = table();
    const listener = vi.fn<Listener>();
    const unsubscribe = t.subscribe(listener);
    t.setGlobalSearch('a');
    unsubscribe();
    t.setGlobalSearch('b');
    expect(listener).toHaveBeenCalledTimes(1);
    const other = vi.fn<Listener>();
    t.subscribe(other);
    const final = t.getState();
    t.destroy();
    t.destroy();
    t.setPage(2);
    t.setGlobalSearch('c');
    t.selectRow('1');
    t.setData([]);
    expect(t.getState()).toBe(final);
    expect(other).not.toHaveBeenCalled();
    expect(t.subscribe(vi.fn())).toBeTypeOf('function');
    expect(() => table().subscribe(null as never)).toThrow('listener must be a function');
  });
});
