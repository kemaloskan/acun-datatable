import {
  createEmitter, createTableQuery, validatePageResult,
  type DataSource, type PageResult, type TableQuery, type TableQueryInput,
} from '@acunsoft/datatable-core';

export type QueryStatus = 'idle' | 'loading' | 'success' | 'error';

/** Immutable runner snapshot. */
export interface QueryState<TData> {
  readonly status: QueryStatus;
  /** The most recently requested query. */
  readonly query: TableQuery | undefined;
  /** The last successful result; kept while the next page loads to avoid flicker. */
  readonly result: PageResult<TData> | undefined;
  /** Set only when `status` is `'error'`. */
  readonly error: unknown;
}

export type QueryListener<TData> = (state: Readonly<QueryState<TData>>) => void;

export interface QueryRunner<TData> {
  getState(): Readonly<QueryState<TData>>;
  /**
   * Request a page. Aborts the request in flight; only the latest request may
   * update the state. Resolves when this request settles or is superseded and
   * never rejects: failures are reported as `status: 'error'`.
   */
  run(query: TableQueryInput): Promise<void>;
  /** Re-run the last query. Explicit only: the runner never retries on its own. */
  retry(): Promise<void>;
  /** Abort the request in flight and return to the last settled state. */
  cancel(): void;
  subscribe(listener: QueryListener<TData>): () => void;
  destroy(): void;
}

/**
 * Run data source queries with latest-request-wins semantics.
 *
 * Every run gets a sequence number and an `AbortController`. A response or
 * error that arrives after a newer run started is dropped, even if the data
 * source ignores the abort signal, so stale data can never overwrite newer data.
 */
export function createQueryRunner<TData>(source: DataSource<TData>): QueryRunner<TData> {
  if (!source || typeof source.getPage !== 'function') throw new TypeError('source must be a DataSource with getPage');

  let state: Readonly<QueryState<TData>> = Object.freeze({ status: 'idle', query: undefined, result: undefined, error: undefined });
  let settled = state;
  let sequence = 0;
  let controller: AbortController | undefined;
  let destroyed = false;
  const emitter = createEmitter<[Readonly<QueryState<TData>>]>();

  const set = (next: QueryState<TData>): void => {
    state = Object.freeze({ ...next });
    if (state.status !== 'loading') settled = state;
    emitter.emit(state);
  };
  const abortCurrent = (): void => {
    controller?.abort();
    controller = undefined;
  };

  const run = async (input: TableQueryInput): Promise<void> => {
    if (destroyed) return;
    const query = createTableQuery(input);
    abortCurrent();
    const current = ++sequence;
    const own = new AbortController();
    controller = own;
    set({ status: 'loading', query, result: state.result, error: undefined });
    try {
      const raw = await source.getPage(query, { signal: own.signal });
      if (current !== sequence || destroyed) return; // superseded or cancelled
      const result = validatePageResult(raw, { pageSize: query.pageSize }) as PageResult<TData>;
      controller = undefined;
      set({ status: 'success', query, result, error: undefined });
    } catch (error) {
      if (current !== sequence || destroyed) return;
      controller = undefined;
      set({ status: 'error', query, result: state.result, error });
    }
  };

  return {
    getState: () => state,
    run,
    retry: () => {
      if (destroyed) return Promise.resolve();
      if (state.query === undefined) throw new Error('nothing to retry: no query has run yet');
      return run(state.query);
    },
    cancel: () => {
      if (destroyed || state.status !== 'loading') return;
      abortCurrent();
      sequence++;
      set({ ...settled, query: settled.query });
    },
    subscribe: (listener) => {
      if (destroyed) return () => undefined;
      return emitter.subscribe(listener);
    },
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      abortCurrent();
      sequence++;
      emitter.clear();
    },
  };
}
