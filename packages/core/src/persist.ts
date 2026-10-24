import type { DataTable } from './data-table';

/** The parts of the state `persistState` keeps. */
export type PersistedPart = 'page' | 'pageSize' | 'sorting' | 'filters' | 'globalSearch' | 'hiddenColumns';

/** Where the state is stored: `localStorage`, `sessionStorage` or anything with the same two methods. */
export interface StateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface PersistStateOptions {
  /** A key unique to this table, e.g. `'orders'`. */
  readonly key: string;
  /** Default `globalThis.localStorage`; nothing is stored when it is not available. */
  readonly storage?: StateStorage;
  /** Default: every part except the selection. */
  readonly include?: readonly PersistedPart[];
}

const ALL: readonly PersistedPart[] = ['page', 'pageSize', 'sorting', 'filters', 'globalSearch', 'hiddenColumns'];
const VERSION = 1;

/**
 * Remember a table's page, page size, sorting, filters, search and hidden
 * columns across reloads (DataTables `stateSave`). The saved state is applied
 * at once (each part on its own, so a part that no longer fits the columns is
 * skipped) and saved after every change. The page is applied again when the
 * first rows arrive, so it survives data that loads later. Returns `stop`.
 */
export function persistState<TData>(table: DataTable<TData>, options: PersistStateOptions): () => void {
  if (!options || typeof options.key !== 'string' || options.key.trim() === '') throw new TypeError('persistState needs a key');
  const include = new Set(options.include ?? ALL);
  for (const part of include) {
    if (!ALL.includes(part)) throw new TypeError(`persistState cannot keep "${String(part)}"`);
  }
  const storage = options.storage ?? storageOrUndefined();
  if (!storage) return () => undefined;
  const key = `acun-datatable:${options.key}`;

  let saved: Partial<Record<PersistedPart, unknown>> = {};
  try {
    const raw = JSON.parse(storage.getItem(key) ?? 'null') as { v?: number; state?: Partial<Record<PersistedPart, unknown>> } | null;
    if (raw && raw.v === VERSION && raw.state && typeof raw.state === 'object') saved = raw.state;
  } catch {
    saved = {}; // unreadable: start fresh
  }
  const apply = (part: PersistedPart, run: () => void): void => {
    if (!include.has(part) || saved[part] === undefined) return;
    try { run(); } catch { /* a part that no longer fits is skipped */ }
  };
  apply('pageSize', () => table.setPageSize(saved.pageSize as number));
  apply('hiddenColumns', () => table.setHiddenColumns(saved.hiddenColumns as string[]));
  apply('sorting', () => table.setSorting(saved.sorting as never));
  apply('filters', () => table.setFilters(saved.filters as never));
  apply('globalSearch', () => table.setGlobalSearch(saved.globalSearch as string));
  apply('page', () => table.setPage(saved.page as number));

  // Rows that load later (ajax, server) may arrive after the page was clamped: apply it once more.
  let pagePending = include.has('page') && typeof saved.page === 'number' && table.getState().page !== saved.page;
  const save = (): void => {
    const state = table.getState();
    const out: Partial<Record<PersistedPart, unknown>> = {};
    for (const part of include) out[part] = state[part];
    try { storage.setItem(key, JSON.stringify({ v: VERSION, state: out })); } catch { /* full or blocked: keep working */ }
  };
  const unsubscribe = table.subscribe((_, event) => {
    if (pagePending && (event.type === 'data' || event.type === 'result')) {
      pagePending = false;
      try { table.setPage(saved.page as number); } catch { /* past the end */ }
      return;
    }
    if (event.type !== 'selection') save();
  });
  return unsubscribe;
}

function storageOrUndefined(): StateStorage | undefined {
  try {
    const storage = (globalThis as { localStorage?: StateStorage }).localStorage;
    return storage && typeof storage.getItem === 'function' ? storage : undefined;
  } catch {
    return undefined; // blocked (private mode, sandboxed frame)
  }
}
