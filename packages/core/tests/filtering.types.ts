// Compiled by npm run check; this function is intentionally never executed.
import { expectTypeOf } from 'vitest';
import { createRows, filterRows, type FilterRule, type Row } from '../src/index';

export function verifyFilteringTypes(): void {
  type Item = { id: number; name: string };
  const rows = createRows<Item>([{ id: 1, name: 'a' }]);
  const columns = [{ id: 'name', header: '', accessorKey: 'name', enableFiltering: true }] as const;
  const result = filterRows(rows, columns, { filters: [{ field: 'name', operator: 'contains', value: 'a' }] });
  expectTypeOf(result).toEqualTypeOf<readonly Row<Item>[]>();
  // @ts-expect-error results are readonly
  result.push(rows[0]!);
  // @ts-expect-error unsupported operator
  const bad: FilterRule = { field: 'name', operator: 'between', value: 1 };
  // @ts-expect-error globalSearch must be a string
  filterRows(rows, columns, { globalSearch: 1 });
  // @ts-expect-error row types must match the columns
  filterRows(createRows([{ id: 1, other: true }]), columns, {});
  void bad;
}
