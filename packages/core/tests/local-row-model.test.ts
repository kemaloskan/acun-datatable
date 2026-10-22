import { describe, expect, it, vi } from 'vitest';
import { createRows, createLocalRowModel, createTableState, type ColumnDef, type LocalRowModelOptions, type SortRule } from '../src/index';

type Item = { id: number; value: unknown; group?: number };
const columns: readonly ColumnDef<Item>[] = [
  { id: 'value', header: 'Value', accessorKey: 'value', enableSorting: true },
  { id: 'group', header: 'Group', accessorKey: 'group', enableSorting: true },
];
const asc = [{ field: 'value', direction: 'asc' }] as const;
const desc = [{ field: 'value', direction: 'desc' }] as const;
function model(values: readonly unknown[], options: LocalRowModelOptions = {}) {
  return createLocalRowModel<Item>(createRows(values.map((value, id) => ({ id, value }))), columns, options);
}
function sorted(values: readonly unknown[], sorting: readonly SortRule[] = asc, options: LocalRowModelOptions = {}) {
  return model(values, options).getSortedRows(sorting).map(row => row.original.value);
}

describe('local sorting', () => {
  it('sorts numbers numerically in both directions', () => {
    expect(sorted([10, 2, -1, 0])).toEqual([-1, 0, 2, 10]);
    expect(sorted([10, 2, -1, 0], desc)).toEqual([10, 2, 0, -1]);
  });
  it('uses column IDs, accessorFn and precedence', () => {
    const rows = createRows([
      { id: 8, value: 1, group: 2 }, { id: 3, value: 3, group: 1 },
      { id: 1, value: 2, group: 1 }, { id: 9, value: 2, group: 1 },
    ]);
    const instance = createLocalRowModel<Item>(rows, [
      ...columns, { id: 'computed', header: '', accessorFn: row => row.group, enableSorting: true },
    ]);
    expect(instance.getSortedRows([
      { field: 'computed', direction: 'asc' }, ...desc,
    ]).map(row => row.id)).toEqual(['3', '1', '9', '8']);
    expect(instance.getSortedRows([
      ...desc, { field: 'computed', direction: 'asc' },
    ]).map(row => row.id)).toEqual(['3', '1', '9', '8']);
    expect(instance.getSortedRows([
      ...asc, { field: 'computed', direction: 'asc' },
    ]).map(row => row.id)).toEqual(['8', '1', '9', '3']);
  });
  it('keeps input order on ties, never row ID order', () => {
    const rows = createRows([{ id: 9, value: 2 }, { id: 1, value: 2 }, { id: 3, value: 2 }]);
    const instance = createLocalRowModel<Item>(rows, columns);
    for (const rules of [asc, desc]) expect(instance.getSortedRows(rules).map(row => row.id)).toEqual(['9', '1', '3']);
  });
  it('uses Turkish collation and a configurable locale', () => {
    expect(sorted(['ş', 's', 'ı', 'i', 'ğ', 'g', 'ç', 'c'], asc, { locale: 'tr' }))
      .toEqual(['c', 'ç', 'g', 'ğ', 'ı', 'i', 's', 'ş']);
    expect(sorted(['z', 'ä'], asc, { locale: 'de' })).toEqual(['ä', 'z']);
    expect(sorted(['z', 'ä'], asc, { locale: 'sv' })).toEqual(['z', 'ä']);
  });
  it.each(['asc', 'desc'] as const)('places missing values independently of %s direction', direction => {
    const values = [null, 2, undefined, NaN, 1, new Date(NaN)];
    const rules = [{ field: 'value', direction }];
    const ordered = direction === 'asc' ? [1, 2] : [2, 1];
    expect(sorted(values, rules)).toEqual([...ordered, null, undefined, NaN, new Date(NaN)]);
    expect(sorted(values, rules, { nulls: 'first' })).toEqual([null, undefined, NaN, new Date(NaN), ...ordered]);
  });
  it('uses subsequent criteria when both primary values are missing', () => {
    const rows = createRows([{ id: 1, value: null, group: 2 }, { id: 2, value: undefined, group: 1 }]);
    expect(createLocalRowModel(rows, columns).getSortedRows([...asc, { field: 'group', direction: 'asc' }])
      .map(row => row.id)).toEqual(['2', '1']);
  });
  it('handles infinities, signed zero and equal numeric values', () => {
    expect(sorted([Infinity, -0, -Infinity, 0, Infinity, 4])).toEqual([-Infinity, -0, 0, 4, Infinity, Infinity]);
    expect(sorted([Infinity, -Infinity, 4], desc)).toEqual([Infinity, 4, -Infinity]);
  });
  it('sorts booleans and dates without changing Dates', () => {
    expect(sorted([true, false, true])).toEqual([false, true, true]);
    expect(sorted([true, false], desc)).toEqual([true, false]);
    const early = new Date('2020-01-01T00:00:00Z');
    const late = new Date('2024-01-01T00:00:00Z');
    expect(sorted([late, early])).toEqual([early, late]);
    expect(sorted([early, late], desc)).toEqual([late, early]);
    expect(early.toISOString()).toBe('2020-01-01T00:00:00.000Z');
  });
  it('orders mixed types without coercion, text in natural order', () => {
    const date = new Date(0);
    expect(sorted([date, '2', 10, true, false, '10', 2])).toEqual([false, true, 2, 10, '2', '10', date]);
    expect(sorted([date, '2', 10, true, false], desc)).toEqual([date, '2', 10, true, false]);
  });
  it('uses custom value comparison and still manages nulls/direction', () => {
    const comparator = vi.fn((a: unknown, b: unknown) => String(a).length - String(b).length);
    expect(sorted(['long', null, 'x', 'mid'], desc, { comparators: { value: comparator } })).toEqual(['long', 'mid', 'x', null]);
    expect(comparator.mock.calls.every(([a, b]) => a != null && b != null)).toBe(true);
    expect(sorted([{ score: 2 }, { score: 1 }], asc, {
      comparators: { value: (a, b) => (a as { score: number }).score - (b as { score: number }).score },
    })).toEqual([{ score: 1 }, { score: 2 }]);
  });
  it.each([NaN, Infinity, -Infinity, '1', undefined, null])('rejects unsafe comparator output %s', value => {
    expect(() => sorted([1, 2], asc, { comparators: { value: () => value as number } })).toThrow('must return a finite number');
  });
  it.each([{}, [], Symbol('x'), 1n, () => 1])('rejects unsupported defaults even on singletons: %s', value => {
    expect(() => sorted([value])).toThrow('unsupported sort value');
  });
  it.each([
    [[{ field: 'missing', direction: 'asc' }], 'unknown sort column ID'],
    [[...asc, ...desc], 'duplicate sort field'],
    [[{ field: 'value', direction: 'up' }], 'must be "asc" or "desc"'],
    [[{ field: '', direction: 'asc' }], 'non-empty column ID'],
    [[null], 'non-empty column ID'],
    [null, 'sorting must be an array'],
  ])('rejects invalid rules even on empty inputs %#', (rules, error) => {
    expect(() => model([]).getSortedRows(rules as readonly SortRule[])).toThrow(error);
  });
  it('rejects disabled columns and malformed configuration', () => {
    expect(() => createLocalRowModel([], [{ id: 'value', header: '', accessorFn: () => 1 }]).getSortedRows(asc)).toThrow('sorting is disabled');
    expect(() => model([], { nulls: 'middle' as never })).toThrow('nulls must be');
    expect(() => model([], { locale: '' })).toThrow('locale must be');
    expect(() => model([], { locale: 'invalid_locale' })).toThrow(RangeError);
    expect(() => model([], { comparators: { absent: () => 0 } })).toThrow('unknown comparator column ID');
    expect(() => model([], { comparators: { value: null as never } })).toThrow('must be a function');
    expect(() => model([], { comparators: [] as never })).toThrow('comparators must be a record');
  });
  it('preserves frozen originals, source arrays, wrappers and IDs', () => {
    const input = Object.freeze([Object.freeze({ id: 2, value: 9 }), Object.freeze({ id: 1, value: 1 })]);
    const rows = createRows(input);
    const instance = createLocalRowModel<Item>(rows, columns);
    const result = instance.getSortedRows(asc);
    expect(instance.getCoreRows()).toBe(rows);
    expect(result[0]).toBe(rows[1]);
    expect(result[1]).toBe(rows[0]);
    expect(rows.map(row => row.id)).toEqual(['2', '1']);
    expect(input.map(row => row.value)).toEqual([9, 1]);
    expect(Object.isFrozen(result)).toBe(true);
    expect(instance.getSortedRows([])).toBe(rows);
  });
  it('handles empty and singleton inputs', () => {
    expect(model([]).getSortedRows(asc)).toEqual([]);
    expect(sorted([1])).toEqual([1]);
  });
});

describe('local row cache and state', () => {
  it('extracts each active accessor once per row and caches semantic sorting', () => {
    const accessor = vi.fn((row: Readonly<Item>) => row.value);
    const unused = vi.fn(() => 0);
    const instance = createLocalRowModel(createRows([{ id: 1, value: 2 }, { id: 2, value: 1 }]), [
      { id: 'value', header: '', accessorFn: accessor, enableSorting: true },
      { id: 'unused', header: '', accessorFn: unused, enableSorting: true },
    ]);
    const state = createTableState({ sorting: asc });
    const oldState = state.getState();
    const first = instance.getSortedRows(oldState.sorting);
    expect(accessor).toHaveBeenCalledTimes(2);
    expect(unused).not.toHaveBeenCalled();
    state.setPage(2);
    expect(instance.getSortedRows(state.getState().sorting)).toBe(first);
    expect(instance.getSortedRows([...asc])).toBe(first);
    expect(accessor).toHaveBeenCalledTimes(2);
    state.setSorting(desc);
    expect(instance.getSortedRows(state.getState().sorting).map(row => row.id)).toEqual(['1', '2']);
    expect(accessor).toHaveBeenCalledTimes(4);
    expect(oldState.sorting).toEqual(asc);
    expect(first.map(row => row.id)).toEqual(['2', '1']);
  });
  it('copies caller sorting and configuration and isolates mutable array containers', () => {
    const rows = [...createRows([{ id: 1, value: 2 }, { id: 2, value: 1 }])];
    const definitions = columns.map(column => ({ ...column }));
    const options = { comparators: { value: (a: unknown, b: unknown) => Number(a) - Number(b) } };
    const instance = createLocalRowModel(rows, definitions, options);
    rows.reverse();
    definitions[0]!.enableSorting = false;
    options.comparators.value = () => 0;
    const sorting: SortRule[] = [...asc];
    const first = instance.getSortedRows(sorting);
    sorting[0] = desc[0];
    expect(instance.getSortedRows(sorting).map(row => row.id)).toEqual(['1', '2']);
    expect(first.map(row => row.id)).toEqual(['2', '1']);
    expect(instance.getCoreRows().map(row => row.id)).toEqual(['1', '2']);
  });
  it('invalidates on replacement, explicit invalidation and same-reference setRows', () => {
    const data = [{ id: 1, value: 2 }, { id: 2, value: 1 }];
    const rows = createRows(data);
    const instance = createLocalRowModel<Item>(rows, columns);
    const first = instance.getSortedRows(asc);
    data[0]!.value = 0;
    expect(instance.getSortedRows(asc)).toBe(first); // Explicit ownership contract.
    instance.invalidate();
    expect(instance.getSortedRows(asc).map(row => row.id)).toEqual(['1', '2']);
    data[0]!.value = 5;
    instance.setRows(rows);
    expect(instance.getSortedRows(asc).map(row => row.id)).toEqual(['2', '1']);
    instance.setRows(createRows([{ id: 7, value: -1 }]));
    expect(instance.getSortedRows(asc).map(row => row.id)).toEqual(['7']);
  });
  it('propagates callback errors and does not cache failed computations', () => {
    let fail = true;
    const error = new Error('failed comparator');
    const instance = model([2, 1], { comparators: { value: (a, b) => {
      if (fail) throw error;
      return Number(a) - Number(b);
    } } });
    expect(() => instance.getSortedRows(asc)).toThrow(error);
    fail = false;
    expect(instance.getSortedRows(asc).map(row => row.original.value)).toEqual([1, 2]);
    expect(() => createLocalRowModel(createRows([{ id: 1 }]), [
      { id: 'value', header: '', accessorFn: () => { throw error; }, enableSorting: true },
    ]).getSortedRows(asc)).toThrow(error);
  });
  it('produces deterministic stable results on 10,000 rows', () => {
    const data = Array.from({ length: 10_000 }, (_, id) => ({ id: 10_000 - id, value: (id * 7919) % 101, group: id % 7 }));
    const rows = createRows(data);
    const instance = createLocalRowModel(rows, columns);
    const rules = [{ field: 'group', direction: 'asc' }, ...desc] as const;
    const result = instance.getSortedRows(rules);
    const expected = [...data].sort((a, b) => a.group - b.group || b.value - a.value);
    expect(result.map(row => row.id)).toEqual(expected.map(row => String(row.id)));
    instance.invalidate();
    expect(instance.getSortedRows(rules)).toEqual(result);
    expect(rows[0]?.id).toBe('10000');
  });
});
