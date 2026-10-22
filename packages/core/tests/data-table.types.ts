// Compiled by npm run check; this function is intentionally never executed.
import { expectTypeOf } from 'vitest';
import { createDataTable, type DataTable, type PageView } from '../src/index';

export function verifyDataTableTypes(): void {
  type Order = { readonly id: number; readonly customer: string };
  const table = createDataTable({
    data: [] as Order[],
    columns: [{ id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true }],
  });
  expectTypeOf(table).toEqualTypeOf<DataTable<Order>>();
  expectTypeOf(table.getPage()).toEqualTypeOf<PageView<Order>>();

  type Raw = { readonly code: string };
  createDataTable({ data: [] as Raw[], columns: [], getRowId: row => row.code });
  // @ts-expect-error records without an id need getRowId
  createDataTable({ data: [] as Raw[], columns: [] });
  // @ts-expect-error accessorKey must belong to the record
  createDataTable({ data: [] as Order[], columns: [{ id: 'x', header: '', accessorKey: 'missing' }] });
  // @ts-expect-error state is readonly
  table.getState().page = 2;
}
