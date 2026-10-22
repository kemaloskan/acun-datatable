import { expectTypeOf } from 'vitest';
import { createRows, createLocalRowModel, createTableState, type LocalRowModel, type Row, type SortComparator } from '../src/index';

export function verifyLocalModelTypes(): void {
  type Item = { id: number; value: number };
  const rows = createRows<Item>([{ id: 1, value: 2 }]);
  const model = createLocalRowModel(rows, [{ id: 'value', header: '', accessorKey: 'value', enableSorting: true }]);
  expectTypeOf(model).toEqualTypeOf<LocalRowModel<Item>>();
  expectTypeOf(model.getSortedRows(createTableState().getState().sorting)).toEqualTypeOf<readonly Row<Item>[]>();
  expectTypeOf(model.getCoreRows()).toEqualTypeOf<readonly Row<Item>[]>();
  // @ts-expect-error result arrays are readonly
  model.getSortedRows([]).push(rows[0]!);
  // @ts-expect-error row types must match
  model.setRows(createRows([{ id: 1, value: 'text' }]));
  // @ts-expect-error accessorKey must belong to Item
  createLocalRowModel(rows, [{ id: 'x', header: '', accessorKey: 'missing' }]);
  // @ts-expect-error invalid null placement
  createLocalRowModel(rows, [], { nulls: 'middle' });
  // @ts-expect-error invalid comparator output
  const comparator: SortComparator = () => 'ascending';
  void comparator;
}
