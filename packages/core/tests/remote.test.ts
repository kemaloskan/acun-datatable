import { describe, expect, it } from 'vitest';
import { createDataTable, createTableQuery, validatePageResult, type SortRule } from '../src/index';

describe('createTableQuery', () => {
  it('builds a frozen query and omits empty search', () => {
    const query = createTableQuery({ page: 2, pageSize: 50 });
    expect(query).toEqual({ page: 2, pageSize: 50, sorting: [], filters: [] });
    expect('globalSearch' in query).toBe(false);
    expect(Object.isFrozen(query)).toBe(true);
    expect(createTableQuery({ page: 1, pageSize: 10, globalSearch: '   ' })).not.toHaveProperty('globalSearch');
  });

  it('copies sorting and filters, and trims search', () => {
    const sorting: SortRule[] = [{ field: 'total', direction: 'desc' }];
    const filters: { field: string; operator: 'eq'; value: unknown }[] = [{ field: 'city', operator: 'eq', value: 'Ankara' }];
    const query = createTableQuery({ page: 1, pageSize: 25, sorting, filters, globalSearch: '  ayşe ' });
    sorting.push({ field: 'x', direction: 'asc' });
    filters[0]!.value = 'changed';
    expect(query).toEqual({
      page: 1, pageSize: 25,
      sorting: [{ field: 'total', direction: 'desc' }],
      filters: [{ field: 'city', operator: 'eq', value: 'Ankara' }],
      globalSearch: 'ayşe',
    });
    expect(Object.isFrozen(query.filters[0])).toBe(true);
  });

  it('accepts a createDataTable state directly', () => {
    const table = createDataTable({
      data: [{ id: 1, name: 'A' }],
      columns: [{ id: 'name', header: '', accessorKey: 'name', enableSorting: true, enableFiltering: true }],
      initialState: { sorting: [{ field: 'name', direction: 'asc' }], globalSearch: 'a' },
    });
    expect(createTableQuery(table.getState())).toEqual({
      page: 1, pageSize: 25, sorting: [{ field: 'name', direction: 'asc' }], filters: [], globalSearch: 'a',
    });
  });

  it.each([
    [{ page: 0, pageSize: 10 }, 'page must be a positive safe integer'],
    [{ page: 1, pageSize: 1001 }, 'pageSize must be an integer from 1 to 1000'],
    [{ page: 1, pageSize: 10, sorting: [{ field: 'a', direction: 'up' }] }, 'must be "asc" or "desc"'],
    [{ page: 1, pageSize: 10, sorting: [{ field: 'a', direction: 'asc' }, { field: 'a', direction: 'desc' }] }, 'duplicate sort field'],
    [{ page: 1, pageSize: 10, filters: 'x' }, 'filters must be an array'],
    [{ page: 1, pageSize: 10, filters: [{ field: '', operator: 'eq' }] }, 'filters[0] must have'],
    [{ page: 1, pageSize: 10, globalSearch: 1 }, 'globalSearch must be a string'],
    [null, 'query input must be an object'],
  ])('rejects invalid input %#', (input, message) => {
    expect(() => createTableQuery(input as never)).toThrow(message);
  });
});

describe('validatePageResult', () => {
  it('returns a frozen copy with only the known fields', () => {
    const rows = [{ id: 1 }, { id: 2 }];
    const result = validatePageResult({ rows, totalRows: 10, nextCursor: 'c2', extra: 'dropped' }, { pageSize: 2 });
    expect(result).toEqual({ rows: [{ id: 1 }, { id: 2 }], totalRows: 10, nextCursor: 'c2' });
    expect(result).not.toHaveProperty('extra');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.rows)).toBe(true);
    expect(result.rows).not.toBe(rows);
  });

  it('accepts an empty page and an unknown total', () => {
    expect(validatePageResult({ rows: [] })).toEqual({ rows: [] });
    expect(validatePageResult({ rows: [], totalRows: 0 })).toEqual({ rows: [], totalRows: 0 });
  });

  it.each([
    [null, 'page result must be an object'],
    [[], 'page result must be an object'],
    ['{"rows":[]}', 'page result must be an object'],
    [{}, 'rows must be an array'],
    [{ rows: {} }, 'rows must be an array'],
    [{ rows: [1] }, 'rows[0] must be an object'],
    [{ rows: [{}, null] }, 'rows[1] must be an object'],
    [{ rows: [[]] }, 'rows[0] must be an object'],
    [{ rows: [], totalRows: -1 }, 'non-negative safe integer'],
    [{ rows: [], totalRows: 1.5 }, 'non-negative safe integer'],
    [{ rows: [], totalRows: '10' }, 'non-negative safe integer'],
    [{ rows: [{}, {}], totalRows: 1 }, 'smaller than the number of rows'],
    [{ rows: [], nextCursor: '' }, 'nextCursor must be a non-empty string'],
    [{ rows: [], nextCursor: 5 }, 'nextCursor must be a non-empty string'],
  ])('rejects malformed responses %#', (value, message) => {
    expect(() => validatePageResult(value)).toThrow(message);
  });

  it('rejects more rows than the requested page size', () => {
    expect(() => validatePageResult({ rows: [{}, {}, {}] }, { pageSize: 2 }))
      .toThrow('page result has 3 rows, more than the requested page size 2');
  });
});
