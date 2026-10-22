export { createColumns, type ColumnDef } from './columns';
export {
  createDataTable, type DataTable, type DataTableEvent, type DataTableInitialState,
  type DataTableListener, type DataTableOptions, type DataTableState,
} from './data-table';
export { filterRows, type FilterOperator, type FilterRule, type FilterQuery, type FilterOptions } from './filtering';
export { createLocalRowModel, type LocalRowModel, type LocalRowModelOptions, type SortComparator, type NullPlacement } from './local-row-model';
export { paginateRows, type PageView } from './pagination';
export {
  createTableQuery, validatePageResult, type AbortSignalLike, type DataSource, type DataSourceRequestOptions,
  type PageResult, type PageResultValidation, type TableQuery, type TableQueryInput,
} from './remote';
export { createRows, type Row, type RowId, type RowIdValue, type GetRowId, type RowOptions } from './rows';
export {
  createRowSelection, type RowSelection, type RowSelectionOptions, type SelectionAction,
  type SelectionChange, type SelectionListener, type SelectionMode, type SelectionState, type SelectionStatus,
} from './selection';

/** One-based page numbering. */
export interface Pagination {
  readonly page: number;
  readonly pageSize: number;
}

/** Supported sort directions. */
export type SortDirection = 'asc' | 'desc';

/** A single sort criterion. Array order determines criterion precedence. */
export interface SortRule {
  readonly field: string;
  readonly direction: SortDirection;
}

/** Immutable state exposed by a table state instance. */
export interface TableState extends Pagination {
  readonly sorting: readonly Readonly<SortRule>[];
}

/** Optional values used to construct the initial state. */
export interface TableStateOptions {
  readonly page?: number;
  readonly pageSize?: number;
  readonly sorting?: readonly SortRule[];
}

/** Receives a new snapshot after a successful, distinct state transition. */
export type TableStateListener = (state: Readonly<TableState>) => void;

/** Public controls for the headless table state lifecycle. */
export interface TableStateController {
  getState(): Readonly<TableState>;
  setPage(page: number): void;
  setPageSize(pageSize: number): void;
  setSorting(sorting: readonly SortRule[]): void;
  subscribe(listener: TableStateListener): () => void;
  destroy(): void;
}

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 25;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 1000;

function validatePage(page: number): void {
  if (!Number.isSafeInteger(page) || page < 1) {
    throw new RangeError('page must be a positive safe integer');
  }
}

function validatePageSize(pageSize: number): void {
  if (
    !Number.isSafeInteger(pageSize) ||
    pageSize < MIN_PAGE_SIZE ||
    pageSize > MAX_PAGE_SIZE
  ) {
    throw new RangeError('pageSize must be an integer from 1 to 1000');
  }
}

function copyAndFreezeSorting(
  sorting: readonly SortRule[],
): readonly Readonly<SortRule>[] {
  const fields = new Set<string>();
  const result = sorting.map((rule, index) => {
    if (typeof rule.field !== 'string' || rule.field.length === 0) {
      throw new TypeError(`sorting[${index}].field must be a non-empty string`);
    }
    if (fields.has(rule.field)) {
      throw new Error(`duplicate sort field: ${rule.field}`);
    }
    if (rule.direction !== 'asc' && rule.direction !== 'desc') {
      throw new TypeError(
        `sorting[${index}].direction must be "asc" or "desc"`,
      );
    }

    fields.add(rule.field);
    return Object.freeze({ field: rule.field, direction: rule.direction });
  });

  return Object.freeze(result);
}

function createSnapshot(
  page: number,
  pageSize: number,
  sorting: readonly Readonly<SortRule>[],
): Readonly<TableState> {
  return Object.freeze({ page, pageSize, sorting });
}

function sortingIsEqual(
  left: readonly Readonly<SortRule>[],
  right: readonly Readonly<SortRule>[],
): boolean {
  return (
    left.length === right.length &&
    left.every(
      (rule, index) =>
        rule.field === right[index]?.field &&
        rule.direction === right[index]?.direction,
    )
  );
}

/** Return a fresh immutable pagination value, rejecting unsupported inputs. */
export function createPagination(
  page = DEFAULT_PAGE,
  pageSize = DEFAULT_PAGE_SIZE,
): Readonly<Pagination> {
  validatePage(page);
  validatePageSize(pageSize);
  return Object.freeze({ page, pageSize });
}

/**
 * Create a headless table state controller.
 *
 * Setter calls after `destroy` are ignored, subscribing returns a no-op
 * unsubscribe function, and the final snapshot remains readable.
 */
export function createTableState(
  options: TableStateOptions = {},
): TableStateController {
  const page = options.page ?? DEFAULT_PAGE;
  const pageSize = options.pageSize ?? DEFAULT_PAGE_SIZE;
  validatePage(page);
  validatePageSize(pageSize);

  let state = createSnapshot(
    page,
    pageSize,
    copyAndFreezeSorting(options.sorting ?? []),
  );
  const listeners = new Set<TableStateListener>();
  let destroyed = false;

  const publish = (nextState: Readonly<TableState>): void => {
    state = nextState;
    for (const listener of [...listeners]) {
      listener(state);
    }
  };

  return {
    getState: () => state,

    setPage: (nextPage) => {
      if (destroyed) return;
      validatePage(nextPage);
      if (nextPage === state.page) return;
      publish(createSnapshot(nextPage, state.pageSize, state.sorting));
    },

    setPageSize: (nextPageSize) => {
      if (destroyed) return;
      validatePageSize(nextPageSize);
      if (nextPageSize === state.pageSize) return;
      publish(createSnapshot(state.page, nextPageSize, state.sorting));
    },

    setSorting: (nextSorting) => {
      if (destroyed) return;
      const sorting = copyAndFreezeSorting(nextSorting);
      if (sortingIsEqual(sorting, state.sorting)) return;
      publish(createSnapshot(state.page, state.pageSize, sorting));
    },

    subscribe: (listener) => {
      if (destroyed) return () => undefined;
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
    },
  };
}
