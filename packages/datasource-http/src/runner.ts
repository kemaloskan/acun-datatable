import {
  createEmitter, createTableQuery, validatePageResult,
  type DataSource, type ListenerErrorHandler, type PageResult, type TableQuery, type TableQueryInput,
} from '@acunsoft/datatable-core';

export interface QueryRunnerOptions {
  /** Receives errors thrown by listeners; they never change the query state. */
  readonly onListenerError?: ListenerErrorHandler;
}

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
   * update the state. Rejects only when `query` itself is invalid (nothing is
   * sent then). Otherwise it resolves when the request settles or is
   * superseded, and request or response failures are reported as
   * `status: 'error'`.
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
export function createQueryRunner<TData>(source: DataSource<TData>, options: QueryRunnerOptions = {}): QueryRunner<TData> {
  if (!source || typeof source.getPage !== 'function') throw new TypeError('source must be a DataSource with getPage');

  let state: Readonly<QueryState<TData>> = Object.freeze({ status: 'idle', query: undefined, result: undefined, error: undefined });
  let settled = state;
  let sequence = 0;
  let controller: AbortController | undefined;
  let destroyed = false;
  const emitter = createEmitter<[Readonly<QueryState<TData>>]>(options.onListenerError);

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
    let result: PageResult<TData>;
    try {
      const raw = await source.getPage(query, { signal: own.signal });
      if (current !== sequence || destroyed) return; // superseded or cancelled
      result = validatePageResult(raw, { pageSize: query.pageSize }) as PageResult<TData>;
    } catch (error) {
      if (current !== sequence || destroyed) return;
      controller = undefined;
      set({ status: 'error', query, result: state.result, error });
      return;
    }
    // Outside the try: a listener error must never turn a good response into 'error'.
    controller = undefined;
    set({ status: 'success', query, result, error: undefined });
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
