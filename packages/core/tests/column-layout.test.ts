import { describe, expect, it, vi } from 'vitest';
import { COLUMN_WIDTH_LIMITS, createDataTable, persistState, type ColumnDef, type StateStorage } from '../src/index';

type R = { id: number; a: string; b: string; c: string };
const columns: readonly ColumnDef<R>[] = [
  { id: 'a', header: 'A', accessorKey: 'a', enableSorting: true },
  { id: 'b', header: 'B', accessorKey: 'b' },
  { id: 'c', header: 'C', accessorKey: 'c' },
];
const make = (initialState = {}) => createDataTable<R>({ data: [{ id: 1, a: 'x', b: 'y', c: 'z' }], columns, initialState });
const visible = (t: ReturnType<typeof make>) => t.getVisibleColumns().map(column => column.id);

describe('column order', () => {
  it('orders the visible columns and keeps the rest in definition order', () => {
    const t = make({ columnOrder: ['c'] });
    expect(t.getState().columnOrder).toEqual(['c', 'a', 'b']);
    expect(visible(t)).toEqual(['c', 'a', 'b']);
    expect(t.getColumns().map(column => column.id)).toEqual(['a', 'b', 'c']); // definitions stay
    const listener = vi.fn();
    t.subscribe(listener);
    t.moveColumn('a', 2);
    expect(visible(t)).toEqual(['c', 'b', 'a']);
    expect(listener).toHaveBeenLastCalledWith(expect.anything(), { type: 'columnOrder', columnOrder: ['c', 'b', 'a'] });
    t.setColumnVisibility('b', false);
    expect(visible(t)).toEqual(['c', 'a']);
    expect(t.getState().hiddenColumns).toEqual(['b']);
    t.moveColumn('a', 99); // clamped: already last
    expect(listener).toHaveBeenCalledTimes(2);
    t.setColumnOrder([]);
    expect(t.getState().columnOrder).toEqual(['a', 'b', 'c']);
    expect(t.getState().page).toBe(1);
  });

  it('rejects unknown and duplicate IDs', () => {
    const t = make();
    expect(() => t.setColumnOrder(['x'])).toThrow('unknown column ID: x');
    expect(() => t.setColumnOrder(['a', 'a'])).toThrow('duplicate column ID');
    expect(() => t.moveColumn('a', 1.5)).toThrow('whole number');
  });
});

describe('column widths', () => {
  it('sets, clamps, clears and replaces widths', () => {
    const t = make({ columnWidths: { b: 120.4 } });
    expect(t.getState().columnWidths).toEqual({ b: 120 });
    const listener = vi.fn();
    t.subscribe(listener);
    t.setColumnWidth('a', 10);
    expect(t.getState().columnWidths).toEqual({ a: COLUMN_WIDTH_LIMITS.min, b: 120 });
    expect(listener).toHaveBeenLastCalledWith(expect.anything(), { type: 'columnWidths', columnWidths: { a: 48, b: 120 } });
    t.setColumnWidth('a', 99_999);
    expect(t.getState().columnWidths.a).toBe(COLUMN_WIDTH_LIMITS.max);
    t.setColumnWidth('a', undefined);
    expect(t.getState().columnWidths).toEqual({ b: 120 });
    t.setColumnWidths({ b: 120 }); // unchanged: no event
    expect(listener).toHaveBeenCalledTimes(3);
    t.setColumnWidths({});
    expect(t.getState().columnWidths).toEqual({});
    expect(Object.isFrozen(t.getState().columnWidths)).toBe(true);
    expect(() => t.setColumnWidth('x', 100)).toThrow('unknown column ID');
    expect(() => t.setColumnWidth('a', Number.NaN)).toThrow('finite number');
    expect(() => t.setColumnWidths([] as never)).toThrow('columnWidths must be');
  });

  it('is not part of the query', () => {
    const t = make();
    const before = t.getQuery();
    t.setColumnWidth('a', 200);
    t.moveColumn('c', 0);
    expect(t.getQuery()).toEqual(before);
  });
});

describe('persistState with column layout', () => {
  it('keeps order and widths, skipping columns that no longer exist', () => {
    const data = new Map<string, string>();
    const storage: StateStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); } };
    const first = make();
    persistState(first, { key: 't', storage });
    first.moveColumn('c', 0);
    first.setColumnWidth('a', 220);
    const saved = JSON.parse(data.get('acun-datatable:t')!);
    saved.state.columnOrder.push('gone');
    saved.state.columnWidths.gone = 90;
    data.set('acun-datatable:t', JSON.stringify(saved));
    const second = make();
    persistState(second, { key: 't', storage });
    expect(second.getState().columnOrder).toEqual(['c', 'a', 'b']);
    expect(second.getState().columnWidths).toEqual({ a: 220 });
  });
});
