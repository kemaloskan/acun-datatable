import { describe, expect, it, vi } from 'vitest';
import {
  createRowSelection, createRows, filterRows, paginateRows,
  type ColumnDef, type SelectionChange, type SelectionState,
} from '../src/index';

type Listener = (state: Readonly<SelectionState>, change: Readonly<SelectionChange>) => void;
const changes = (listener: ReturnType<typeof vi.fn<Listener>>) =>
  listener.mock.calls.map(([, change]) => ({ ...change }));

describe('createRowSelection — multiple mode', () => {
  it('starts empty, frozen and in multiple mode by default', () => {
    const selection = createRowSelection();
    const state = selection.getState();
    expect(state).toEqual({ mode: 'multiple', selectedIds: [] });
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(state.selectedIds)).toBe(true);
  });

  it('selects, deselects and toggles in selection order without duplicates', () => {
    const selection = createRowSelection();
    selection.select('3');
    selection.select('1');
    selection.select('3'); // already selected
    expect(selection.getState().selectedIds).toEqual(['3', '1']);
    selection.toggle('2');
    selection.toggle('3');
    expect(selection.getState().selectedIds).toEqual(['1', '2']);
    selection.deselect('1');
    selection.deselect('missing'); // not selected
    expect(selection.getState().selectedIds).toEqual(['2']);
    expect(selection.isSelected('2')).toBe(true);
    expect(selection.isSelected('1')).toBe(false);
  });

  it('produces a new snapshot per effective change and keeps old ones intact', () => {
    const selection = createRowSelection({ selectedIds: ['a'] });
    const before = selection.getState();
    selection.select('b');
    expect(before.selectedIds).toEqual(['a']);
    expect(selection.getState()).not.toBe(before);
    selection.select('b');
    selection.deselect('x');
    expect(selection.getState().selectedIds).toEqual(['a', 'b']);
  });

  it('selectAll adds missing IDs, setSelected replaces, clear empties', () => {
    const selection = createRowSelection({ selectedIds: ['2'] });
    selection.selectAll(['1', '2', '3']);
    expect(selection.getState().selectedIds).toEqual(['2', '1', '3']);
    selection.setSelected(['9', '8']);
    expect(selection.getState().selectedIds).toEqual(['9', '8']);
    selection.clear();
    expect(selection.getState().selectedIds).toEqual([]);
  });

  it('treats setSelected with the same members as no change, keeping the order', () => {
    const selection = createRowSelection({ selectedIds: ['1', '2'] });
    const listener = vi.fn<Listener>();
    selection.subscribe(listener);
    selection.setSelected(['2', '1']);
    expect(listener).not.toHaveBeenCalled();
    expect(selection.getState().selectedIds).toEqual(['1', '2']);
  });

  it('retain drops IDs that are no longer present', () => {
    const selection = createRowSelection({ selectedIds: ['1', '2', '3'] });
    selection.retain(['3', '1', '7']);
    expect(selection.getState().selectedIds).toEqual(['1', '3']);
  });

  it('reports none / some / all for a group of IDs', () => {
    const selection = createRowSelection({ selectedIds: ['1', '2'] });
    expect(selection.getStatus(['1', '2'])).toBe('all');
    expect(selection.getStatus(['2', '3'])).toBe('some');
    expect(selection.getStatus(['3', '4'])).toBe('none');
    expect(selection.getStatus([])).toBe('none');
  });

  it('does not keep caller arrays', () => {
    const ids = ['1', '2'];
    const selection = createRowSelection({ selectedIds: ids });
    ids.push('3');
    const next = ['4'];
    selection.setSelected(next);
    next.push('5');
    expect(selection.getState().selectedIds).toEqual(['4']);
  });
});

describe('createRowSelection — single mode', () => {
  it('select replaces the current row', () => {
    const selection = createRowSelection({ mode: 'single' });
    selection.select('1');
    selection.select('2');
    expect(selection.getState()).toEqual({ mode: 'single', selectedIds: ['2'] });
    selection.toggle('2');
    expect(selection.getState().selectedIds).toEqual([]);
    selection.toggle('3');
    expect(selection.getState().selectedIds).toEqual(['3']);
  });

  it('allows at most one ID and rejects selectAll', () => {
    expect(() => createRowSelection({ mode: 'single', selectedIds: ['1', '2'] })).toThrow('at most one');
    const selection = createRowSelection({ mode: 'single', selectedIds: ['1'] });
    expect(() => selection.setSelected(['1', '2'])).toThrow('at most one');
    expect(() => selection.selectAll(['1'])).toThrow('requires mode "multiple"');
    expect(selection.getState().selectedIds).toEqual(['1']);
    selection.setSelected(['5']);
    expect(selection.getState().selectedIds).toEqual(['5']);
  });
});

describe('selection events', () => {
  it('passes a frozen snapshot and a documented change for each effective action', () => {
    const selection = createRowSelection();
    const listener = vi.fn<Listener>();
    selection.subscribe(listener);
    selection.select('1');
    selection.selectAll(['1', '2', '3']);
    selection.toggle('2');
    selection.deselect('1');
    selection.setSelected(['9']);
    selection.retain(['9']); // no change
    selection.clear();
    expect(changes(listener)).toEqual([
      { action: 'select', added: ['1'], removed: [] },
      { action: 'selectAll', added: ['2', '3'], removed: [] },
      { action: 'toggle', added: [], removed: ['2'] },
      { action: 'deselect', added: [], removed: ['1'] },
      { action: 'set', added: ['9'], removed: ['3'] },
      { action: 'clear', added: [], removed: ['9'] },
    ]);
    const [state, change] = listener.mock.calls[0]!;
    expect(Object.isFrozen(state)).toBe(true);
    expect(Object.isFrozen(change)).toBe(true);
    expect(Object.isFrozen(change.added)).toBe(true);
  });

  it('reports the replaced row in single mode', () => {
    const selection = createRowSelection({ mode: 'single', selectedIds: ['1'] });
    const listener = vi.fn<Listener>();
    selection.subscribe(listener);
    selection.select('2');
    expect(changes(listener)).toEqual([{ action: 'select', added: ['2'], removed: ['1'] }]);
  });

  it('supports unsubscribe and destroy', () => {
    const selection = createRowSelection();
    const listener = vi.fn<Listener>();
    const unsubscribe = selection.subscribe(listener);
    selection.select('1');
    unsubscribe();
    unsubscribe();
    selection.select('2');
    expect(listener).toHaveBeenCalledTimes(1);

    const other = vi.fn<Listener>();
    selection.subscribe(other);
    const final = selection.getState();
    selection.destroy();
    selection.destroy();
    selection.select('3');
    selection.clear();
    selection.setSelected(['bad', 'bad']); // ignored after destroy, not validated
    const late = vi.fn<Listener>();
    selection.subscribe(late)();
    expect(selection.getState()).toBe(final);
    expect(other).not.toHaveBeenCalled();
    expect(late).not.toHaveBeenCalled();
  });
});

describe('selection validation', () => {
  it.each([1, '', '  ', null, undefined, {}])('rejects invalid row ID %s', (id) => {
    const selection = createRowSelection();
    expect(() => selection.select(id as never)).toThrow('row ID must be a non-empty string');
    expect(() => selection.isSelected(id as never)).toThrow('row ID must be a non-empty string');
    expect(() => selection.setSelected([id as never])).toThrow('row ID must be a non-empty string');
  });

  it('rejects duplicates, non-arrays, bad modes and bad listeners without changing state', () => {
    const selection = createRowSelection({ selectedIds: ['1'] });
    expect(() => selection.setSelected(['2', '2'])).toThrow('duplicate row ID in ids: 2');
    expect(() => selection.selectAll('1' as never)).toThrow('ids must be an array');
    expect(() => selection.getStatus(null as never)).toThrow('ids must be an array');
    expect(() => createRowSelection({ selectedIds: ['a', 'a'] })).toThrow('duplicate row ID in selectedIds: a');
    expect(() => createRowSelection({ mode: 'many' as never })).toThrow('mode must be');
    expect(() => selection.subscribe(null as never)).toThrow('listener must be a function');
    expect(selection.getState().selectedIds).toEqual(['1']);
  });
});

describe('selection with the row pipeline', () => {
  it('keeps hidden rows selected across filtering and paging', () => {
    type Item = { id: number; name: string };
    const columns: ColumnDef<Item>[] = [{ id: 'name', header: '', accessorKey: 'name', enableFiltering: true }];
    const rows = createRows<Item>([{ id: 1, name: 'Ali' }, { id: 2, name: 'Ayşe' }, { id: 3, name: 'Can' }]);
    const selection = createRowSelection();

    const page = paginateRows(rows, { page: 1, pageSize: 2 });
    selection.selectAll(page.rows.map(row => row.id));
    expect(selection.getStatus(page.rows.map(row => row.id))).toBe('all');

    const visible = filterRows(rows, columns, { globalSearch: 'can' });
    expect(selection.getStatus(visible.map(row => row.id))).toBe('none');
    expect(selection.getState().selectedIds).toEqual(['1', '2']); // still selected while hidden

    // After a reload where row 2 disappeared, drop it explicitly.
    const reloaded = createRows<Item>([{ id: 1, name: 'Ali' }, { id: 3, name: 'Can' }]);
    selection.retain(reloaded.map(row => row.id));
    expect(selection.getState().selectedIds).toEqual(['1']);
    expect(reloaded.filter(row => selection.isSelected(row.id)).map(row => row.original.name)).toEqual(['Ali']);
  });
});
