import { createEmitter } from './emitter';
import type { RowId } from './rows';

export type SelectionMode = 'single' | 'multiple';
export type SelectionAction = 'select' | 'deselect' | 'toggle' | 'set' | 'selectAll' | 'clear' | 'retain';
/** Tri-state of a group of rows, e.g. for a "select all on this page" checkbox. */
export type SelectionStatus = 'none' | 'some' | 'all';

/** Immutable selection snapshot. */
export interface SelectionState {
  readonly mode: SelectionMode;
  /** Selected row IDs, in the order they were first selected. */
  readonly selectedIds: readonly RowId[];
}

/** Describes what a successful, effective selection action changed. */
export interface SelectionChange {
  readonly action: SelectionAction;
  readonly added: readonly RowId[];
  readonly removed: readonly RowId[];
}

export type SelectionListener = (state: Readonly<SelectionState>, change: Readonly<SelectionChange>) => void;

export interface RowSelectionOptions {
  /** Default `'multiple'`. Fixed for the lifetime of the selection. */
  readonly mode?: SelectionMode;
  readonly selectedIds?: readonly RowId[];
}

export interface RowSelection {
  getState(): Readonly<SelectionState>;
  isSelected(id: RowId): boolean;
  /** `'none'` for an empty list, otherwise how many of `ids` are selected. */
  getStatus(ids: readonly RowId[]): SelectionStatus;
  /** Multiple mode adds the ID; single mode replaces the selection with it. */
  select(id: RowId): void;
  deselect(id: RowId): void;
  toggle(id: RowId): void;
  /** Replace the selection. Single mode accepts at most one ID. */
  setSelected(ids: readonly RowId[]): void;
  /** Add every ID (multiple mode only), e.g. all rows on the current page. */
  selectAll(ids: readonly RowId[]): void;
  clear(): void;
  /** Keep only selected IDs that are in `ids`, e.g. after reloading the data. */
  retain(ids: readonly RowId[]): void;
  subscribe(listener: SelectionListener): () => void;
  destroy(): void;
}

function validateId(id: unknown): asserts id is RowId {
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError('row ID must be a non-empty string (use Row.id)');
  }
}

function validateIds(ids: unknown, name: string): readonly RowId[] {
  if (!Array.isArray(ids)) throw new TypeError(`${name} must be an array of row IDs`);
  const seen = new Set<RowId>();
  for (const id of ids as unknown[]) {
    validateId(id);
    if (seen.has(id)) throw new Error(`duplicate row ID in ${name}: ${id}`);
    seen.add(id);
  }
  return ids as readonly RowId[];
}

function singleLimit(mode: SelectionMode, ids: readonly RowId[]): void {
  if (mode === 'single' && ids.length > 1) {
    throw new Error('single selection mode allows at most one selected row');
  }
}

/**
 * Create a headless row selection keyed by stable row IDs.
 *
 * Selection is a set: IDs are never duplicated and selecting an already
 * selected row is a no-op. It is independent of filtering, sorting and paging,
 * so a selected row stays selected while hidden. Listeners are only notified
 * for actions that change the selection. After `destroy`, actions are ignored,
 * `subscribe` returns a no-op and the final snapshot stays readable.
 */
export function createRowSelection(options: RowSelectionOptions = {}): RowSelection {
  const mode = options.mode ?? 'multiple';
  if (mode !== 'single' && mode !== 'multiple') throw new TypeError('mode must be "single" or "multiple"');
  const initial = validateIds(options.selectedIds ?? [], 'selectedIds');
  singleLimit(mode, initial);

  let state: Readonly<SelectionState> = Object.freeze({ mode, selectedIds: Object.freeze([...initial]) });
  let members = new Set(state.selectedIds);
  const emitter = createEmitter<[Readonly<SelectionState>, Readonly<SelectionChange>]>();
  let destroyed = false;

  const commit = (next: readonly RowId[], action: SelectionAction): void => {
    const nextSet = new Set(next);
    const added = next.filter(id => !members.has(id));
    const removed = state.selectedIds.filter(id => !nextSet.has(id));
    if (added.length === 0 && removed.length === 0) return;
    state = Object.freeze({ mode, selectedIds: Object.freeze([...next]) });
    members = nextSet;
    const change = Object.freeze({ action, added: Object.freeze(added), removed: Object.freeze(removed) });
    emitter.emit(state, change);
  };
  const withId = (id: RowId): readonly RowId[] =>
    mode === 'single' ? [id] : members.has(id) ? state.selectedIds : [...state.selectedIds, id];
  const withoutId = (id: RowId): readonly RowId[] => state.selectedIds.filter(selected => selected !== id);

  return {
    getState: () => state,
    isSelected: (id) => { validateId(id); return members.has(id); },
    getStatus: (ids) => {
      validateIds(ids, 'ids');
      const count = ids.filter(id => members.has(id)).length;
      return count === 0 ? 'none' : count === ids.length ? 'all' : 'some';
    },
    select: (id) => { if (destroyed) return; validateId(id); commit(withId(id), 'select'); },
    deselect: (id) => { if (destroyed) return; validateId(id); commit(withoutId(id), 'deselect'); },
    toggle: (id) => {
      if (destroyed) return;
      validateId(id);
      commit(members.has(id) ? withoutId(id) : withId(id), 'toggle');
    },
    setSelected: (ids) => {
      if (destroyed) return;
      validateIds(ids, 'ids');
      singleLimit(mode, ids);
      commit([...ids], 'set');
    },
    selectAll: (ids) => {
      if (destroyed) return;
      validateIds(ids, 'ids');
      if (mode === 'single') throw new Error('selectAll requires mode "multiple"');
      commit([...state.selectedIds, ...ids.filter(id => !members.has(id))], 'selectAll');
    },
    clear: () => { if (destroyed) return; commit([], 'clear'); },
    retain: (ids) => {
      if (destroyed) return;
      const keep = new Set(validateIds(ids, 'ids'));
      commit(state.selectedIds.filter(id => keep.has(id)), 'retain');
    },
    subscribe: (listener) => {
      if (destroyed) return () => undefined;
      return emitter.subscribe(listener);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      emitter.clear();
    },
  };
}
