// Compiled by npm run check; this function is intentionally never executed.
import { expectTypeOf } from 'vitest';
import { createColumns, createRows, type ColumnDef, type Row } from '../src/index';

export function verifyPublicTypes(): void {
  type Person = { readonly id: number; readonly name: string; readonly age?: number };
  const key = { id: 'name', header: 'Name', accessorKey: 'name' } as const satisfies ColumnDef<Person, string>;
  const fn = { id: 'length', header: 'Length', accessorFn: row => row.name.length } satisfies ColumnDef<Person, number>;
  expectTypeOf(fn.accessorFn).returns.toEqualTypeOf<number>();
  expectTypeOf(fn.accessorFn).parameter(0).toEqualTypeOf<Readonly<Person>>();
  const columns = createColumns<Person>([key, fn] as const);
  expectTypeOf(columns).toEqualTypeOf<readonly ColumnDef<Person>[]>();
  // @ts-expect-error unknown row property
  const badKey: ColumnDef<Person> = { id: 'x', header: 'X', accessorKey: 'missing' };
  // @ts-expect-error key value is string, not number
  const badValue: ColumnDef<Person, number> = { id: 'x', header: 'X', accessorKey: 'name' };
  // @ts-expect-error optional age includes undefined
  const optionalValue: ColumnDef<Person, number> = { id: 'x', header: 'X', accessorKey: 'age' };
  // @ts-expect-error wrong function return value
  const badFn: ColumnDef<Person, number> = { id: 'x', header: 'X', accessorFn: row => row.name };
  // @ts-expect-error mutually exclusive accessors
  const both: ColumnDef<Person> = { id: 'x', header: 'X', accessorKey: 'name', accessorFn: () => 1 };
  // @ts-expect-error data columns need an accessor
  const missing: ColumnDef<Person> = { id: 'x', header: 'X' };
  // @ts-expect-error columns are readonly
  columns.push(key);
  // @ts-expect-error definitions are readonly
  columns[0]!.header = 'changed';
  const rows = createRows([{ id: 1, name: 'A' }] as const);
  expectTypeOf(rows).toEqualTypeOf<readonly Row<{ readonly id: 1; readonly name: 'A' }>[]>();
  expectTypeOf(rows[0]!.id).toEqualTypeOf<string>();
  createRows([{ key: 'a' }], { getRowId: row => row.key });
  // @ts-expect-error no default ID
  createRows([{ key: 'a' }]);
  // @ts-expect-error optional ID cannot be the default
  createRows([] as { id?: number }[]);
  // @ts-expect-error invalid default ID type
  createRows([{ id: true }]);
  // @ts-expect-error invalid callback result
  createRows([{}], { getRowId: () => undefined });
  // @ts-expect-error frozen wrapper
  rows[0]!.id = 'new';
  // @ts-expect-error readonly original view
  rows[0]!.original.name = 'B';
  void [badKey, badValue, optionalValue, badFn, both, missing];
}
