// The columns of /e2e/api/orders, shared by the React and Vue fixtures.
import { createDataTable } from '@acunsoft/datatable-core';
import { connectTable, createHttpDataSource, createQueryRunner } from '@acunsoft/datatable-http';

/** A server table on the real Node API; `?cursor` asks for keyset pages, `?limited` a back end that counts up to 100. */
export function ordersTable() {
  const cursor = new URLSearchParams(location.search).has('cursor');
  const url = new URLSearchParams(location.search).has('limited') ? '/e2e/api/orders-limited' : '/e2e/api/orders';
  const table = createDataTable({
    mode: 'server', locale: 'tr', ...(cursor ? { paging: 'cursor' } : {}), initialState: { pageSize: 10 },
    columns: [
      { id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
      { id: 'city', header: 'City', accessorKey: 'city', enableSorting: true, enableFiltering: true },
      { id: 'total', header: 'Total', accessorKey: 'total', type: 'decimal', enableSorting: true, enableFiltering: true, filter: true },
      { id: 'paid', header: 'Paid', accessorKey: 'paid', type: 'boolean', enableFiltering: true, filter: true },
    ],
  });
  const runner = createQueryRunner(createHttpDataSource({ url, ...(cursor ? { paging: 'cursor' } : {}) }));
  window.__table = table;
  return { table, runner, connect: () => connectTable(table, runner) };
}

/** ?virtual: 20,000 rows in the browser, drawn as they scroll into view. */
export function peopleTable() {
  const names = ['Ayşe Yılmaz', 'Ali Kaya', 'Bartholomew Montgomery-Smith', 'Can', 'Zeynep Doğan', 'Ümit Kılıç'];
  const cities = ['İstanbul', 'Ankara', 'Kahramanmaraş', 'Rize'];
  const table = createDataTable({
    data: Array.from({ length: 20_000 }, (_, i) => ({ id: i + 1, name: `${names[i % names.length]} ${i + 1}`, city: cities[(i * 7) % cities.length], score: (i * 7919) % 100_000 })),
    columns: [
      { id: 'name', header: 'Name', accessorKey: 'name', enableSorting: true },
      { id: 'city', header: 'City', accessorKey: 'city' },
      { id: 'score', header: 'Score', accessorKey: 'score', type: 'number', enableSorting: true },
    ],
  });
  window.__table = table;
  return table;
}
