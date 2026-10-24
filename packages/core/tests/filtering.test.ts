import { describe, expect, it, vi } from 'vitest';
import {
  createLocalRowModel, createRows, filterRows, paginateRows,
  type ColumnDef, type FilterQuery, type FilterRule,
} from '../src/index';

type Person = { id: number; name: string; city: unknown; age: unknown; note?: string };
const columns: readonly ColumnDef<Person>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', enableFiltering: true, enableSorting: true },
  { id: 'city', header: 'City', accessorKey: 'city', enableFiltering: true },
  { id: 'age', header: 'Age', accessorKey: 'age', enableFiltering: true, enableSorting: true },
  { id: 'note', header: 'Note', accessorKey: 'note' }, // not filterable
];
const people = createRows<Person>([
  { id: 1, name: 'Ayşe', city: 'İstanbul', age: 34, note: 'secret' },
  { id: 2, name: 'Ali', city: 'Izmir', age: 28 },
  { id: 3, name: 'Irmak', city: 'ızmit', age: 41 },
  { id: 4, name: 'Zeynep', city: null, age: null },
  { id: 5, name: 'Mehmet', city: 'Ankara', age: 28 },
]);
const ids = (rows: readonly { id: string }[]) => rows.map(row => row.id);
const run = (query: FilterQuery, locale?: string) =>
  ids(filterRows(people, columns, query, locale === undefined ? {} : { locale }));

describe('filterRows operators', () => {
  it('contains is case-, accent- and Turkish-insensitive in every locale', () => {
    expect(run({ filters: [{ field: 'name', operator: 'contains', value: 'AY' }] })).toEqual(['1']);
    // İ, I, ı and i all match each other, so users find "İzmir" and "ızmit" by typing "iz".
    expect(run({ filters: [{ field: 'city', operator: 'contains', value: 'istanbul' }] }, 'tr')).toEqual(['1']);
    expect(run({ filters: [{ field: 'city', operator: 'contains', value: 'ız' }] }, 'tr')).toEqual(['2', '3']);
    expect(run({ filters: [{ field: 'city', operator: 'contains', value: 'iz' }] }, 'tr')).toEqual(['2', '3']);
    expect(run({ filters: [{ field: 'city', operator: 'contains', value: 'IZ' }] })).toEqual(['2', '3']);
  });

  it('contains matches the text of numbers, dates and booleans, but not objects or infinities', () => {
    expect(run({ filters: [{ field: 'age', operator: 'contains', value: '4' }] })).toEqual(['1', '3']);
    const rows = createRows([{ id: 1, v: true }, { id: 2, v: new Date(2026, 9, 23) }, { id: 3, v: Infinity }, { id: 4, v: 'true' }, { id: 5, v: {} }]);
    const cols: ColumnDef<{ id: number; v: unknown }>[] = [{ id: 'v', header: '', accessorKey: 'v', enableFiltering: true }];
    const q = (value: string, locale = 'en') => ids(filterRows(rows, cols, { filters: [{ field: 'v', operator: 'contains', value }] }, { locale }));
    expect(q('tru')).toEqual(['1', '4']);
    expect(q('yes')).toEqual(['1']);
    expect(q('evet', 'tr')).toEqual(['1']);
    expect(q('2026-10-23')).toEqual(['2']);
    expect(q('23.10.2026', 'tr')).toEqual(['2']);
    expect(q('Inf')).toEqual([]);
    expect(q('object')).toEqual([]);
  });

  it('an empty or blank contains value is no constraint', () => {
    expect(run({ filters: [{ field: 'city', operator: 'contains', value: '' }] })).toEqual(['1', '2', '3', '4', '5']);
    expect(run({ filters: [{ field: 'city', operator: 'contains', value: '   ' }] })).toEqual(['1', '2', '3', '4', '5']);
  });

  it('eq compares without coercion, and Dates by time', () => {
    expect(run({ filters: [{ field: 'age', operator: 'eq', value: 28 }] })).toEqual(['2', '5']);
    expect(run({ filters: [{ field: 'age', operator: 'eq', value: '28' }] })).toEqual([]);
    expect(run({ filters: [{ field: 'name', operator: 'eq', value: 'ali' }] })).toEqual([]); // eq is exact
    const rows = createRows([{ id: 1, d: new Date('2024-01-01') }, { id: 2, d: new Date('2025-01-01') }, { id: 3, d: true }]);
    const cols: ColumnDef<{ id: number; d: unknown }>[] = [{ id: 'd', header: '', accessorKey: 'd', enableFiltering: true }];
    expect(ids(filterRows(rows, cols, { filters: [{ field: 'd', operator: 'eq', value: new Date('2025-01-01') }] }))).toEqual(['2']);
    expect(ids(filterRows(rows, cols, { filters: [{ field: 'd', operator: 'eq', value: true }] }))).toEqual(['3']);
  });

  it('gt and lt compare numbers, strings (collation) and Dates of the same type only', () => {
    expect(run({ filters: [{ field: 'age', operator: 'gt', value: 30 }] })).toEqual(['1', '3']);
    expect(run({ filters: [{ field: 'age', operator: 'lt', value: 30 }] })).toEqual(['2', '5']);
    expect(run({ filters: [{ field: 'age', operator: 'gt', value: 28 }] })).toEqual(['1', '3']); // strict
    expect(run({ filters: [{ field: 'age', operator: 'gt', value: '30' }] })).toEqual([]); // no coercion
    expect(run({ filters: [{ field: 'name', operator: 'lt', value: 'B' }] })).toEqual(['1', '2']);
    const rows = createRows([{ id: 1, d: new Date('2024-01-01') }, { id: 2, d: new Date('2025-06-01') }]);
    const cols: ColumnDef<{ id: number; d: Date }>[] = [{ id: 'd', header: '', accessorKey: 'd', enableFiltering: true }];
    expect(ids(filterRows(rows, cols, { filters: [{ field: 'd', operator: 'gt', value: new Date('2025-01-01') }] }))).toEqual(['2']);
  });

  it('handles infinities without NaN surprises', () => {
    const rows = createRows([{ id: 1, n: Infinity }, { id: 2, n: -Infinity }, { id: 3, n: 0 }]);
    const cols: ColumnDef<{ id: number; n: number }>[] = [{ id: 'n', header: '', accessorKey: 'n', enableFiltering: true }];
    const q = (operator: 'gt' | 'lt', value: number) => ids(filterRows(rows, cols, { filters: [{ field: 'n', operator, value }] }));
    expect(q('gt', Infinity)).toEqual([]);
    expect(q('lt', Infinity)).toEqual(['2', '3']);
    expect(q('gt', -Infinity)).toEqual(['1', '3']);
  });

  it('missing values never match any operator', () => {
    for (const operator of ['contains', 'eq', 'gt', 'lt'] as const) {
      const value = operator === 'contains' ? 'a' : 0;
      expect(run({ filters: [{ field: 'city', operator, value }] })).not.toContain('4');
    }
    const rows = createRows([{ id: 1, v: NaN }, { id: 2, v: new Date(NaN) }, { id: 3, v: undefined }]);
    const cols: ColumnDef<{ id: number; v: unknown }>[] = [{ id: 'v', header: '', accessorKey: 'v', enableFiltering: true }];
    expect(filterRows(rows, cols, { filters: [{ field: 'v', operator: 'lt', value: 10 }] })).toEqual([]);
  });

  it('combines multiple rules with AND, including a range on one column', () => {
    expect(run({ filters: [
      { field: 'age', operator: 'gt', value: 27 },
      { field: 'age', operator: 'lt', value: 35 },
      { field: 'name', operator: 'contains', value: 'a' },
    ] })).toEqual(['1', '2']); // Mehmet (28) is in range but has no "a"
  });
});

describe('global search', () => {
  it('matches any filterable column, case-insensitively, after trimming', () => {
    expect(run({ globalSearch: '  ANK ' })).toEqual(['5']);
    expect(run({ globalSearch: '28' })).toEqual(['2', '5']);
  });

  it('never searches columns without enableFiltering', () => {
    expect(run({ globalSearch: 'secret' })).toEqual([]);
  });

  it('is ANDed with column filters', () => {
    expect(run({ globalSearch: 'a', filters: [{ field: 'age', operator: 'eq', value: 28 }] })).toEqual(['2', '5']);
    expect(run({ globalSearch: 'ankara', filters: [{ field: 'age', operator: 'gt', value: 30 }] })).toEqual([]);
  });

  it('treats empty or whitespace search as no constraint', () => {
    expect(run({ globalSearch: '' })).toEqual(['1', '2', '3', '4', '5']);
    expect(run({ globalSearch: '   ' })).toEqual(['1', '2', '3', '4', '5']);
  });

  it('matches nothing when no column is filterable', () => {
    const rows = createRows([{ id: 1, name: 'A' }]);
    expect(filterRows(rows, [{ id: 'name', header: '', accessorKey: 'name' }], { globalSearch: 'a' })).toEqual([]);
  });
});

describe('filterRows contract', () => {
  it('returns the input untouched when there is nothing to filter', () => {
    expect(filterRows(people, columns, {})).toBe(people);
    expect(filterRows(people, columns, { filters: [], globalSearch: '' })).toBe(people);
    const mutable = [...people];
    const result = filterRows(mutable, columns, {});
    expect(result).not.toBe(mutable);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result).toEqual(people);
  });

  it('keeps input order and wrappers, freezes the result and never mutates input', () => {
    const data = [{ id: 1, name: 'b', city: 'x', age: 1 }, { id: 2, name: 'a', city: 'x', age: 2 }];
    const rows = createRows<Person>(data);
    const result = filterRows(rows, columns, { filters: [{ field: 'city', operator: 'eq', value: 'x' }] });
    expect(ids(result)).toEqual(['1', '2']);
    expect(result[0]).toBe(rows[0]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(data).toEqual([{ id: 1, name: 'b', city: 'x', age: 1 }, { id: 2, name: 'a', city: 'x', age: 2 }]);
  });

  it('does not keep caller filter arrays', () => {
    const filters: FilterRule[] = [{ field: 'age', operator: 'eq', value: 28 }];
    const first = filterRows(people, columns, { filters });
    filters.push({ field: 'name', operator: 'eq', value: 'Ali' });
    expect(ids(first)).toEqual(['2', '5']);
  });

  it('reads each accessor at most once per row and skips it once a row fails', () => {
    const name = vi.fn((row: Readonly<Person>) => row.name);
    const age = vi.fn((row: Readonly<Person>) => row.age);
    const cols: ColumnDef<Person>[] = [
      { id: 'name', header: '', accessorFn: name, enableFiltering: true },
      { id: 'age', header: '', accessorFn: age, enableFiltering: true },
    ];
    filterRows(people, cols, { filters: [{ field: 'age', operator: 'eq', value: 28 }], globalSearch: 'm' });
    expect(age).toHaveBeenCalledTimes(5); // once per row
    expect(name).toHaveBeenCalledTimes(2); // only the two rows that passed age
  });

  it('handles empty input', () => {
    expect(filterRows([], columns, { globalSearch: 'x' })).toEqual([]);
  });

  it('composes with stable sorting and pagination', () => {
    const model = createLocalRowModel(people, columns, { locale: 'tr' });
    const sorted = model.getSortedRows([{ field: 'age', direction: 'asc' }, { field: 'name', direction: 'asc' }]);
    const filtered = filterRows(sorted, columns, { filters: [{ field: 'age', operator: 'lt', value: 40 }] }, { locale: 'tr' });
    expect(ids(filtered)).toEqual(['2', '5', '1']);
    // Same as sorting the filtered rows: filtering preserves the stable order.
    const filteredFirst = filterRows(people, columns, { filters: [{ field: 'age', operator: 'lt', value: 40 }] });
    expect(ids(createLocalRowModel(filteredFirst, columns).getSortedRows([{ field: 'age', direction: 'asc' }, { field: 'name', direction: 'asc' }])))
      .toEqual(ids(filtered));
    const page = paginateRows(filtered, { page: 2, pageSize: 2 });
    expect(ids(page.rows)).toEqual(['1']);
    expect(page).toMatchObject({ totalRows: 3, pageCount: 2 });
  });
});

describe('filterRows validation', () => {
  it.each([
    [{ filters: [{ field: 'missing', operator: 'eq', value: 1 }] }, 'unknown filter column ID: missing'],
    [{ filters: [{ field: 'note', operator: 'eq', value: 'x' }] }, 'filtering is disabled for column "note"'],
    [{ filters: [{ field: '', operator: 'eq', value: 1 }] }, 'non-empty column ID'],
    [{ filters: [null] }, 'non-empty column ID'],
    [{ filters: [{ field: 'age', operator: 'like', value: 1 }] }, 'must be one of contains, startsWith, eq, gt, lt, gte, lte, between, in, empty, notEmpty'],
    [{ filters: [{ field: 'name', operator: 'contains', value: 1 }] }, 'contains value must be a string'],
    [{ filters: [{ field: 'age', operator: 'gt', value: true }] }, 'gt value must be a string, number or valid Date'],
    [{ filters: [{ field: 'age', operator: 'lt', value: NaN }] }, 'lt value must be a string, number or valid Date'],
    [{ filters: [{ field: 'age', operator: 'eq', value: null }] }, 'eq value must be a string, number, boolean or valid Date'],
    [{ filters: [{ field: 'age', operator: 'eq', value: new Date(NaN) }] }, 'eq value must be'],
    [{ filters: 'age' }, 'filters must be an array'],
    [{ globalSearch: 5 }, 'globalSearch must be a string'],
  ])('rejects invalid queries even on empty input %#', (query, message) => {
    expect(() => filterRows([], columns, query as unknown as FilterQuery)).toThrow(message);
  });

  it('rejects malformed arguments and options', () => {
    expect(() => filterRows(null as never, columns, {})).toThrow('rows must be an array');
    expect(() => filterRows(people, columns, null as never)).toThrow('query must be an object');
    expect(() => filterRows(people, columns, {}, { locale: '' })).toThrow('locale must be');
    expect(() => filterRows(people, columns, {}, { locale: 'invalid_locale' })).toThrow(RangeError);
    expect(() => filterRows(people, [{ id: 'x', header: '' } as never], {})).toThrow('exactly one');
  });

  it('propagates accessor errors', () => {
    const failure = new Error('boom');
    const cols: ColumnDef<Person>[] = [{ id: 'name', header: '', accessorFn: () => { throw failure; }, enableFiltering: true }];
    expect(() => filterRows(people, cols, { globalSearch: 'a' })).toThrow(failure);
  });
});
