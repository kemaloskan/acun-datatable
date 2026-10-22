import { describe, expect, it } from 'vitest';
import { createDataTable, type ColumnDef, type DataSource, type TableQuery } from '@acunsoft/datatable-core';
import { connectTable, createQueryRunner } from '../src/index';

type Order = { id: number; customer: string };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: '', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
];
type Call = { query: TableQuery; resolve: (value: unknown) => void };

function setup(initialState = {}) {
  const calls: Call[] = [];
  const source: DataSource<Order> = {
    getPage: (query) => new Promise(resolve => { calls.push({ query, resolve: resolve as Call['resolve'] }); }),
  };
  const table = createDataTable<Order>({ mode: 'server', columns, initialState: { pageSize: 2, ...initialState } });
  const runner = createQueryRunner(source);
  const disconnect = connectTable(table, runner);
  return { table, runner, calls, disconnect };
}
const orders = (...ids: number[]) => ids.map(id => ({ id, customer: `C${id}` }));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('connectTable', () => {
  it('loads the first page and applies the result', async () => {
    const { table, runner, calls } = setup();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.query).toEqual({ page: 1, pageSize: 2, sorting: [], filters: [] });
    expect(runner.getState().status).toBe('loading');
    calls[0]!.resolve({ rows: orders(1, 2), totalRows: 5 });
    await flush();
    expect(table.getPage()).toMatchObject({ page: 1, totalRows: 5, pageCount: 3 });
    expect(table.getPage().rows.map(row => row.id)).toEqual(['1', '2']);
    expect(runner.getState().status).toBe('success');
  });

  it('re-queries on paging, sorting, filtering and search, but not on selection', async () => {
    const { table, calls } = setup();
    calls[0]!.resolve({ rows: orders(1, 2), totalRows: 5 });
    await flush();
    table.setPage(2);
    table.setSorting([{ field: 'customer', direction: 'desc' }]);
    table.setFilters([{ field: 'customer', operator: 'contains', value: 'c' }]);
    table.setGlobalSearch('ayşe');
    table.selectRow('1');
    expect(calls.map(call => call.query.page)).toEqual([1, 2, 1, 1, 1]);
    expect(calls.at(-1)!.query).toMatchObject({
      sorting: [{ field: 'customer', direction: 'desc' }],
      filters: [{ field: 'customer', operator: 'contains', value: 'c' }],
      globalSearch: 'ayşe',
    });
  });

  it('never applies a stale response', async () => {
    const { table, calls } = setup();
    table.setGlobalSearch('new');
    calls[1]!.resolve({ rows: orders(7), totalRows: 1 }); // current query answers first
    await flush();
    calls[0]!.resolve({ rows: orders(1, 2), totalRows: 50 }); // old query answers late
    await flush();
    expect(table.getPage().rows.map(row => row.id)).toEqual(['7']);
    expect(table.getTotalRows()).toBe(1);
  });

  it('follows a clamp to the last page with a new request', async () => {
    const { table, calls } = setup({ page: 9 });
    expect(calls[0]!.query.page).toBe(9);
    calls[0]!.resolve({ rows: [], totalRows: 3 }); // only 2 pages exist
    await flush();
    expect(table.getState().page).toBe(2);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.query.page).toBe(2);
    calls[1]!.resolve({ rows: orders(3), totalRows: 3 });
    await flush();
    expect(table.getPage().rows.map(row => row.id)).toEqual(['3']);
  });

  it('leaves errors on the runner and keeps the table rows', async () => {
    const calls: { reject: (e: unknown) => void; resolve: (v: unknown) => void }[] = [];
    const source: DataSource<Order> = { getPage: () => new Promise((resolve, reject) => { calls.push({ resolve: resolve as never, reject }); }) };
    const table = createDataTable<Order>({ mode: 'server', columns, initialState: { pageSize: 2 } });
    const runner = createQueryRunner(source);
    connectTable(table, runner);
    calls[0]!.resolve({ rows: orders(1), totalRows: 1 });
    await flush();
    table.setGlobalSearch('x');
    calls[1]!.reject(new Error('HTTP 500'));
    await flush();
    expect(runner.getState().status).toBe('error');
    expect(table.getPage().rows.map(row => row.id)).toEqual(['1']);
  });

  it('disconnects both directions', async () => {
    const { table, runner, calls, disconnect } = setup();
    disconnect();
    table.setPage(2);
    expect(calls).toHaveLength(1);
    calls[0]!.resolve({ rows: orders(1), totalRows: 1 });
    await flush();
    expect(runner.getState().status).toBe('success');
    expect(table.getPage().rows).toEqual([]);
  });

  it('requires a server-mode table', () => {
    const local = createDataTable<Order>({ data: [], columns });
    const runner = createQueryRunner<Order>({ getPage: async () => ({ rows: [] }) });
    expect(() => connectTable(local, runner)).toThrow('requires a table created with mode: "server"');
  });
});
