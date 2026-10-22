import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import {
  createPagination,
  createTableState,
  type SortDirection,
  type SortRule,
  type TableState,
  type TableStateController,
} from '../src/index';

describe('createPagination', () => {
  it('sets documented defaults', () => {
    expect(createPagination()).toEqual({ page: 1, pageSize: 25 });
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid page %s',
    (page) => {
      expect(() => createPagination(page)).toThrow(
        new RangeError('page must be a positive safe integer'),
      );
    },
  );

  it.each([0, -1, 1.5, 1001, Number.NaN, Number.POSITIVE_INFINITY])(
    'rejects invalid pageSize %s',
    (pageSize) => {
      expect(() => createPagination(1, pageSize)).toThrow(
        new RangeError('pageSize must be an integer from 1 to 1000'),
      );
    },
  );

  it('accepts and freezes pageSize boundary values', () => {
    expect(createPagination(1, 1)).toEqual({ page: 1, pageSize: 1 });
    expect(createPagination(1, 1000)).toEqual({ page: 1, pageSize: 1000 });
    expect(Object.isFrozen(createPagination())).toBe(true);
  });
});

describe('createTableState', () => {
  it('exposes typed immutable defaults', () => {
    const table = createTableState();
    const state = table.getState();

    expect(state).toEqual({ page: 1, pageSize: 25, sorting: [] });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.sorting)).toBe(true);
    expectTypeOf(table).toEqualTypeOf<TableStateController>();
    expectTypeOf(state).toEqualTypeOf<Readonly<TableState>>();
  });

  it('uses initial state without retaining caller-owned sorting objects', () => {
    const rule: { field: string; direction: SortDirection } = {
      field: 'name',
      direction: 'asc',
    };
    const sorting: SortRule[] = [rule];
    const table = createTableState({ page: 3, pageSize: 1000, sorting });

    sorting.push({ field: 'createdAt', direction: 'desc' });
    rule.field = 'changed';

    expect(table.getState()).toEqual({
      page: 3,
      pageSize: 1000,
      sorting: [{ field: 'name', direction: 'asc' }],
    });
    expect(table.getState().sorting[0]).not.toBe(rule);
    expect(Object.isFrozen(table.getState().sorting[0])).toBe(true);
  });

  it('updates pagination independently with a new snapshot', () => {
    const table = createTableState({ page: 2, pageSize: 10 });
    const initial = table.getState();

    table.setPage(4);
    const afterPage = table.getState();
    table.setPageSize(50);

    expect(afterPage).toEqual({ page: 4, pageSize: 10, sorting: [] });
    expect(afterPage).not.toBe(initial);
    expect(table.getState()).toEqual({ page: 4, pageSize: 50, sorting: [] });
    expect(table.getState()).not.toBe(afterPage);
  });

  it('accepts page and pageSize boundaries', () => {
    const table = createTableState();

    table.setPage(Number.MAX_SAFE_INTEGER);
    table.setPageSize(1);
    expect(table.getState()).toMatchObject({
      page: Number.MAX_SAFE_INTEGER,
      pageSize: 1,
    });

    table.setPageSize(1000);
    expect(table.getState().pageSize).toBe(1000);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])(
    'rejects invalid page transitions: %s',
    (page) => {
      const table = createTableState();
      expect(() => table.setPage(page)).toThrow(RangeError);
      expect(table.getState().page).toBe(1);
    },
  );

  it.each([0, -1, 1.5, 1001, Number.MAX_SAFE_INTEGER, Number.NaN])(
    'rejects invalid pageSize transitions: %s',
    (pageSize) => {
      const table = createTableState();
      expect(() => table.setPageSize(pageSize)).toThrow(RangeError);
      expect(table.getState().pageSize).toBe(25);
    },
  );

  it('preserves sorting precedence and does not retain setter inputs', () => {
    const table = createTableState();
    const first: { field: string; direction: SortDirection } = { field: 'lastName', direction: 'asc' };
    const sorting: SortRule[] = [
      first,
      { field: 'createdAt', direction: 'desc' },
    ];

    table.setSorting(sorting);
    sorting.reverse();
    first.direction = 'desc';

    expect(table.getState().sorting).toEqual([
      { field: 'lastName', direction: 'asc' },
      { field: 'createdAt', direction: 'desc' },
    ]);
  });

  it('rejects duplicate sort fields without changing state', () => {
    const table = createTableState({
      sorting: [{ field: 'name', direction: 'asc' }],
    });
    const initial = table.getState();

    expect(() =>
      table.setSorting([
        { field: 'email', direction: 'asc' },
        { field: 'email', direction: 'desc' },
      ]),
    ).toThrow('duplicate sort field: email');
    expect(table.getState()).toBe(initial);
  });

  it('validates invalid initial pagination and sorting', () => {
    expect(() => createTableState({ page: 0 })).toThrow(
      'page must be a positive safe integer',
    );
    expect(() => createTableState({ pageSize: 1001 })).toThrow(
      'pageSize must be an integer from 1 to 1000',
    );
    expect(() =>
      createTableState({
        sorting: [
          { field: 'name', direction: 'asc' },
          { field: 'name', direction: 'desc' },
        ],
      }),
    ).toThrow('duplicate sort field: name');
    expect(() =>
      createTableState({
        sorting: [
          { field: 'name', direction: 'invalid' as SortRule['direction'] },
        ],
      }),
    ).toThrow('sorting[0].direction must be "asc" or "desc"');
  });

  it('rejects empty fields and invalid directions with explicit errors', () => {
    const table = createTableState();

    expect(() => table.setSorting([{ field: '', direction: 'asc' }])).toThrow(
      'sorting[0].field must be a non-empty string',
    );
    expect(() =>
      table.setSorting([
        { field: 'name', direction: 'sideways' as SortRule['direction'] },
      ]),
    ).toThrow('sorting[0].direction must be "asc" or "desc"');
  });

  it('notifies subscribers with frozen snapshots and supports unsubscribe', () => {
    const table = createTableState();
    const listener = vi.fn<(state: Readonly<TableState>) => void>();
    const unsubscribe = table.subscribe(listener);

    table.setPage(2);
    table.setSorting([{ field: 'name', direction: 'asc' }]);

    expect(listener).toHaveBeenCalledTimes(2);
    const firstSnapshot = listener.mock.calls[0]?.[0];
    expect(firstSnapshot).toEqual({ page: 2, pageSize: 25, sorting: [] });
    expect(Object.isFrozen(firstSnapshot)).toBe(true);
    expect(Object.isFrozen(listener.mock.calls[1]?.[0].sorting)).toBe(true);

    unsubscribe();
    unsubscribe();
    table.setPageSize(50);
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it('does not publish semantically unchanged state', () => {
    const table = createTableState({
      sorting: [{ field: 'name', direction: 'asc' }],
    });
    const listener = vi.fn();
    table.subscribe(listener);

    table.setPage(1);
    table.setPageSize(25);
    table.setSorting([{ field: 'name', direction: 'asc' }]);

    expect(listener).not.toHaveBeenCalled();
  });

  it('makes destroy idempotent and prevents later updates or subscriptions', () => {
    const table = createTableState();
    const beforeDestroy = table.getState();
    const listener = vi.fn();
    const lateListener = vi.fn();
    table.subscribe(listener);

    table.destroy();
    table.destroy();
    table.setPage(2);
    table.setPageSize(50);
    table.setSorting([{ field: 'name', direction: 'asc' }]);
    const unsubscribe = table.subscribe(lateListener);
    unsubscribe();

    expect(table.getState()).toBe(beforeDestroy);
    expect(listener).not.toHaveBeenCalled();
    expect(lateListener).not.toHaveBeenCalled();
  });
});
