import { describe, expect, it, vi } from 'vitest';
import {
  createDataTable, createRows, createTableQuery, filterRows, splitSearchTerms,
  type ColumnDef, type DataTableEvent, type DataTableState, type FilterRule,
} from '../src/index';

type City = { id: number; name: string; plate: unknown; price: unknown; founded: unknown; coastal: unknown; note: unknown };
const columns: readonly ColumnDef<City>[] = [
  { id: 'name', header: 'City', accessorKey: 'name', enableFiltering: true },
  { id: 'plate', header: 'Plate', accessorKey: 'plate', enableFiltering: true, type: 'number' },
  { id: 'price', header: 'Price', accessorKey: 'price', enableFiltering: true, type: 'decimal' },
  { id: 'founded', header: 'Founded', accessorKey: 'founded', enableFiltering: true, type: 'date' },
  { id: 'coastal', header: 'Coastal', accessorKey: 'coastal', enableFiltering: true, type: 'boolean' },
  { id: 'note', header: 'Note', accessorKey: 'note', enableFiltering: true },
];
const cities = createRows<City>([
  { id: 1, name: 'İstanbul', plate: '34', price: '120.50', founded: '2026-01-10', coastal: true, note: 'Boğaz' },
  { id: 2, name: 'Ankara', plate: '06', price: '80.00', founded: '2026-03-01', coastal: false, note: '' },
  { id: 3, name: 'İzmir', plate: '35', price: '99.90', founded: '2026-02-15', coastal: 'true', note: null },
  { id: 4, name: 'Isparta', plate: '32', price: 'n/a', founded: 'unknown', coastal: 'maybe', note: '  ' },
  { id: 5, name: 'New York', plate: null, price: '300', founded: '2025-12-31', coastal: true, note: 'Ankara Caddesi' },
]);
const run = (query: { filters?: FilterRule[]; globalSearch?: string }) =>
  filterRows(cities, columns, query, { locale: 'tr' }).map(row => row.id);

describe('new operators', () => {
  it('startsWith is folded like contains', () => {
    expect(run({ filters: [{ field: 'name', operator: 'startsWith', value: 'is' }] })).toEqual(['1', '4']);
    expect(run({ filters: [{ field: 'name', operator: 'startsWith', value: 'IZ' }] })).toEqual(['3']);
    expect(run({ filters: [{ field: 'name', operator: 'startsWith', value: 'bul' }] })).toEqual([]);
    expect(run({ filters: [{ field: 'name', operator: 'startsWith', value: '  ' }] })).toHaveLength(5); // blank: no constraint
  });

  it('between includes both ends and reads typed values', () => {
    expect(run({ filters: [{ field: 'price', operator: 'between', value: ['80', 120.5] }] })).toEqual(['1', '2', '3']);
    expect(run({ filters: [{ field: 'plate', operator: 'between', value: [30, 34] }] })).toEqual(['1', '4']);
    expect(run({ filters: [{ field: 'founded', operator: 'between', value: [new Date(2026, 0, 1), '2026-02-15'] }] })).toEqual(['1', '3']);
  });

  it('in matches any listed value of the column type', () => {
    expect(run({ filters: [{ field: 'plate', operator: 'in', value: [6, '34'] }] })).toEqual(['1', '2']);
    expect(run({ filters: [{ field: 'coastal', operator: 'in', value: [true] }] })).toEqual(['1', '3', '5']);
    expect(run({ filters: [{ field: 'name', operator: 'in', value: ['Ankara', 'ankara'] }] })).toEqual(['2']); // text is exact
  });

  it('empty and notEmpty cover missing, unreadable and blank values', () => {
    expect(run({ filters: [{ field: 'note', operator: 'empty' }] })).toEqual(['2', '3', '4']);
    expect(run({ filters: [{ field: 'note', operator: 'notEmpty' }] })).toEqual(['1', '5']);
    expect(run({ filters: [{ field: 'price', operator: 'empty' }] })).toEqual(['4']); // 'n/a' is not a decimal
    expect(run({ filters: [{ field: 'plate', operator: 'empty' }] })).toEqual(['5']);
  });

  it('rejects malformed lists and values a type cannot read', () => {
    const bad = (rule: unknown) => () => run({ filters: [rule as FilterRule] });
    expect(bad({ field: 'plate', operator: 'between', value: [1] })).toThrow('between value must be [min, max]');
    expect(bad({ field: 'plate', operator: 'between', value: [10, 1] })).toThrow('min <= max');
    expect(bad({ field: 'name', operator: 'between', value: ['a', 1] })).toThrow('two values of the same type');
    expect(bad({ field: 'coastal', operator: 'between', value: ['true', 'true'] })).toThrow('not supported for boolean columns');
    expect(bad({ field: 'plate', operator: 'in', value: [] })).toThrow('non-empty list');
    expect(bad({ field: 'plate', operator: 'in', value: Array.from({ length: 1001 }, (_, i) => i) })).toThrow('at most 1000');
    expect(bad({ field: 'plate', operator: 'in', value: ['x'] })).toThrow('not a valid number');
    expect(bad({ field: 'note', operator: 'empty', value: '' })).toThrow('empty takes no value');
    expect(bad({ field: 'name', operator: 'startsWith', value: 1 })).toThrow('startsWith value must be a string');
  });
});

describe('smart global search', () => {
  it('needs every word, each in any column', () => {
    expect(run({ globalSearch: 'istanbul 34' })).toEqual(['1']);
    expect(run({ globalSearch: 'ankara' })).toEqual(['2', '5']); // name or note
    expect(run({ globalSearch: 'ankara caddesi' })).toEqual(['5']);
    expect(run({ globalSearch: 'istanbul ankara' })).toEqual([]);
  });

  it('keeps quoted phrases together', () => {
    expect(run({ globalSearch: '"new york"' })).toEqual(['5']);
    expect(run({ globalSearch: '"york new"' })).toEqual([]);
    expect(run({ globalSearch: 'york new' })).toEqual(['5']);
    expect(run({ globalSearch: '"new york' })).toEqual(['5']); // unclosed quote
  });

  it('splits terms like DataTables', () => {
    expect(splitSearchTerms('  ali  "new york"  2026 ')).toEqual(['ali', 'new york', '2026']);
    expect(splitSearchTerms('"" "  "')).toEqual([]);
    expect(splitSearchTerms('o"neil')).toEqual(['o"neil']);
  });
});

describe('remote queries and table state with the new operators', () => {
  it('createTableQuery copies lists and omits values for empty rules', () => {
    const list = [6, 34];
    const query = createTableQuery({ page: 1, pageSize: 10, filters: [
      { field: 'plate', operator: 'in', value: list },
      { field: 'note', operator: 'empty' },
      { field: 'name', operator: 'startsWith', value: ' ' },
    ] });
    list.push(99);
    expect(query.filters).toEqual([{ field: 'plate', operator: 'in', value: [6, 34] }, { field: 'note', operator: 'empty' }]);
    expect(Object.isFrozen(query.filters[0]!.value)).toBe(true);
    expect('value' in query.filters[1]!).toBe(false);
    expect(() => createTableQuery({ page: 1, pageSize: 10, filters: [{ field: 'x', operator: 'in', value: [] }] })).toThrow('non-empty list');
  });

  it('setFilters treats equal lists as unchanged', () => {
    const table = createDataTable<City>({ data: [], columns, initialState: { filters: [{ field: 'plate', operator: 'in', value: [6, 34] }] } });
    const listener = vi.fn<(state: Readonly<DataTableState>, event: Readonly<DataTableEvent>) => void>();
    table.subscribe(listener);
    table.setFilters([{ field: 'plate', operator: 'in', value: [6, 34] }]);
    expect(listener).not.toHaveBeenCalled();
    table.setFilters([{ field: 'plate', operator: 'in', value: [6] }]);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
