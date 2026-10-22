// Compile-time check that the package README example matches the public API.
import { createDataTable } from '../src/index';

declare const orders: readonly { id: number; customer: string; total: string }[];
declare function render(page: unknown): void;

const table = createDataTable({
  data: orders,
  columns: [
    { id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
    { id: 'total', header: 'Total', accessorKey: 'total', type: 'decimal', enableSorting: true, enableFiltering: true },
  ],
  locale: 'tr',
  initialState: { pageSize: 25 },
});

table.subscribe((state, event) => render([table.getPage(), state, event]));
table.setSorting([{ field: 'total', direction: 'desc' }]);
table.setGlobalSearch('ayse "istanbul"');
table.setFilters([{ field: 'total', operator: 'between', value: ['100', '500'] }]);
