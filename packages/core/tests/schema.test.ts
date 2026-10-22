import { describe, expect, it, vi } from 'vitest';
import { createColumns, createRows, type ColumnDef, type RowIdValue } from '../src/index';

type Person = { readonly id: number; readonly name: string; readonly age?: number };

describe('column schema', () => {
  it('accepts readonly mixed columns and preserves accessor functions', () => {
    const accessor = vi.fn((row: Readonly<Person>) => row.name.length);
    const input = Object.freeze([
      Object.freeze({ id: 'name', header: 'İsim', accessorKey: 'name', enableSorting: true } as const),
      Object.freeze({ id: 'length', header: '', accessorFn: accessor, enableFiltering: true }),
    ]);
    const columns = createColumns<Person>(input);
    expect(columns).toEqual([
      { ...input[0], enableFiltering: false },
      { ...input[1], enableSorting: false },
    ]);
    expect(columns[1]?.accessorFn).toBe(accessor);
    expect(accessor).not.toHaveBeenCalled();
    expect(Object.isFrozen(columns)).toBe(true);
    expect(columns.every(Object.isFrozen)).toBe(true);
    expect(columns[0]).not.toBe(input[0]);
  });

  it('copies definitions without freezing or mutating inputs', () => {
    const definition = { id: 'name', header: 'Name', accessorKey: 'name' as const };
    const input = [definition];
    const columns = createColumns<Person>(input);
    definition.header = 'Changed';
    input.length = 0;
    expect(columns[0]?.header).toBe('Name');
    expect(Object.isFrozen(definition)).toBe(false);
    expect(() => Object.assign(columns[0]!, { header: 'Changed' })).toThrow(TypeError);
  });

  it('accepts empty schemas and special property keys', () => {
    const key = Symbol('value');
    expect(createColumns<Person>([])).toEqual([]);
    expect(createColumns<{ 0: string; [key]: number }>([
      { id: 'zero', header: 'Zero', accessorKey: 0 },
      { id: '__proto__', header: 'Symbol', accessorKey: key },
    ])).toHaveLength(2);
  });

  it('rejects duplicate IDs regardless of accessor', () => {
    expect(() => createColumns<Person>([
      { id: 'same', header: 'A', accessorKey: 'name' },
      { id: 'same', header: 'B', accessorFn: row => row.id },
    ])).toThrow('duplicate column ID: same');
  });

  it.each([
    [{ header: 'Name', accessorKey: 'name' }, 'id must be a non-empty string'],
    [{ id: '', header: 'Name', accessorKey: 'name' }, 'id must be a non-empty string'],
    [{ id: '  ', header: 'Name', accessorKey: 'name' }, 'id must be a non-empty string'],
    [{ id: 1, header: 'Name', accessorKey: 'name' }, 'id must be a non-empty string'],
    [{ id: 'name', accessorKey: 'name' }, 'header must be a string'],
    [{ id: 'name', header: 'Name' }, 'exactly one'],
    [{ id: 'name', header: 'Name', accessorKey: 'name', accessorFn: () => 'x' }, 'exactly one'],
    [{ id: 'name', header: 'Name', accessorKey: 'name', accessorFn: undefined }, 'exactly one'],
    [{ id: 'name', header: 'Name', accessorKey: undefined }, 'valid property key'],
    [{ id: 'name', header: 'Name', accessorKey: '' }, 'valid property key'],
    [{ id: 'name', header: 'Name', accessorFn: 'name' }, 'must be a function'],
    [{ id: 'name', header: 'Name', accessorKey: 'name', enableSorting: 1 }, 'enableSorting must be a boolean'],
    [{ id: 'name', header: 'Name', accessorKey: 'name', enableFiltering: 'yes' }, 'enableFiltering must be a boolean'],
    [null, 'must be an object'],
  ])('rejects invalid definitions %#', (input, message) => {
    expect(() => createColumns<Person>([input as unknown as ColumnDef<Person>])).toThrow(message);
  });
});

describe('stable row identities', () => {
  it('normalizes default IDs, preserves order and shares data without freezing it', () => {
    const input = [{ id: 0, name: 'A' }, { id: 'İstanbul', name: 'B' }];
    const rows = createRows(input);
    expect(rows.map(row => row.id)).toEqual(['0', 'İstanbul']);
    expect(rows[0]?.original).toBe(input[0]);
    expect(Object.isFrozen(rows)).toBe(true);
    expect(rows.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(input[0])).toBe(false);
    expect(() => Object.assign(rows[0]!, { id: 'other' })).toThrow(TypeError);
    expect(input).toEqual([{ id: 0, name: 'A' }, { id: 'İstanbul', name: 'B' }]);
  });

  it('supports frozen inputs and stable identity across reloads, order and pages', () => {
    const rows = createRows(Object.freeze([Object.freeze({ id: 10 }), Object.freeze({ id: 20 })]));
    const reloaded = createRows([{ id: 20 }, { id: 10 }]);
    const page = createRows([{ id: 10 }]);
    expect(rows[0]?.id).toBe(reloaded[1]?.id);
    expect(rows[0]?.id).toBe(page[0]?.id);
  });

  it('calls an explicit callback once per row, without an index, overriding id', () => {
    const data = [{ id: 'ignored', key: 10 }, { id: 'ignored', key: 20 }];
    const getRowId = vi.fn((row: Readonly<(typeof data)[number]>) => row.key);
    const rows = createRows(data, { getRowId });
    expect(rows.map(row => row.id)).toEqual(['10', '20']);
    expect(getRowId.mock.calls).toEqual([[data[0]], [data[1]]]);
    expect(createRows([{ key: 10 }], { getRowId: row => row.key })[0]?.id).toBe('10');
  });

  it('handles empty input and safe integer/string edge cases', () => {
    expect(createRows([])).toEqual([]);
    expect(createRows([{ id: -1 }, { id: Number.MAX_SAFE_INTEGER }, { id: '01' }, { id: ' 1 ' }])
      .map(row => row.id)).toEqual(['-1', String(Number.MAX_SAFE_INTEGER), '01', ' 1 ']);
  });

  it.each([undefined, null, '', ' \t', NaN, Infinity, -Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1, true, {}, 1n])(
    'rejects invalid default and callback ID %s', id => {
      expect(() => createRows([{ id: id as RowIdValue }])).toThrow('ID must be');
      expect(() => createRows([{}], { getRowId: () => id as RowIdValue })).toThrow('ID must be');
    },
  );

  it('rejects missing and inherited default IDs', () => {
    for (const row of [{}, Object.create({ id: 1 }), null]) {
      expect(() => createRows([row as { id: number }])).toThrow('requires an own id property');
    }
  });

  it.each([[1, 1], [1, '1'], [0, -0], ['__proto__', '__proto__']])(
    'rejects duplicate normalized IDs %s / %s', (first, second) => {
      expect(() => createRows([{ id: first! }, { id: second! }])).toThrow('duplicate row ID');
      expect(() => createRows([first, second], { getRowId: value => value! })).toThrow('duplicate row ID');
    },
  );

  it('propagates callback failures and rejects malformed options', () => {
    const failure = new Error('identity unavailable');
    expect(() => createRows([{}], { getRowId: () => { throw failure; } })).toThrow(failure);
    expect(() => createRows([], { getRowId: null as never })).toThrow('getRowId must be a function');
  });
});
