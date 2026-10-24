// The columns of /e2e/api/orders, shared by the React and Vue fixtures.
import { createDataTable } from '@acunsoft/datatable-core';
import { connectTable, createHttpDataSource, createQueryRunner } from '@acunsoft/datatable-http';

/** A server table on the real Node API; `?cursor` asks for keyset pages. */
export function ordersTable() {
  const cursor = new URLSearchParams(location.search).has('cursor');
  const table = createDataTable({
    mode: 'server', locale: 'tr', ...(cursor ? { paging: 'cursor' } : {}), initialState: { pageSize: 10 },
    columns: [
      { id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
      { id: 'city', header: 'City', accessorKey: 'city', enableSorting: true, enableFiltering: true },
      { id: 'total', header: 'Total', accessorKey: 'total', type: 'decimal', enableSorting: true, enableFiltering: true, filter: true },
      { id: 'paid', header: 'Paid', accessorKey: 'paid', type: 'boolean', enableFiltering: true, filter: true },
    ],
  });
  const runner = createQueryRunner(createHttpDataSource({ url: '/e2e/api/orders', ...(cursor ? { paging: 'cursor' } : {}) }));
  window.__table = table;
  return { table, runner, connect: () => connectTable(table, runner) };
}
