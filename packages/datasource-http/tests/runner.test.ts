import { describe, expect, it, vi } from 'vitest';
import type { DataSource, PageResult, TableQuery } from '@acunsoft/datatable-core';
import { createQueryRunner, type QueryState } from '../src/index';

type Item = { id: number };
type Call = { query: TableQuery; signal: AbortSignal; resolve: (value: unknown) => void; reject: (error: unknown) => void };

/** A data source whose responses the test resolves by hand, in any order. */
function manualSource(options: { ignoreAbort?: boolean } = {}) {
  const calls: Call[] = [];
  const source: DataSource<Item> = {
    getPage: (query, requestOptions) => new Promise((resolve, reject) => {
      const signal = requestOptions!.signal as AbortSignal;
      calls.push({ query, signal, resolve: resolve as Call['resolve'], reject });
      if (!options.ignoreAbort) signal.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    }),
  };
  return { source, calls };
}
const page = (...ids: number[]): PageResult<Item> => ({ rows: ids.map(id => ({ id })), totalRows: 100 });
const q = (n: number) => ({ page: n, pageSize: 10 });

describe('createQueryRunner — latest request wins', () => {
  it('ignores a stale response that arrives after a newer one', async () => {
    const { source, calls } = manualSource({ ignoreAbort: true }); // worst case: server ignores abort
    const runner = createQueryRunner(source);
    const first = runner.run(q(1));
    const second = runner.run(q(2));
    calls[1]!.resolve(page(21, 22)); // newer answers first
    await second;
    calls[0]!.resolve(page(11, 12)); // stale answer arrives late
    await first;
    expect(runner.getState()).toMatchObject({ status: 'success', query: { page: 2 } });
    expect(runner.getState().result!.rows).toEqual([{ id: 21 }, { id: 22 }]);
  });

  it('ignores a stale error as well', async () => {
    const { source, calls } = manualSource({ ignoreAbort: true });
    const runner = createQueryRunner(source);
    const first = runner.run(q(1));
    const second = runner.run(q(2));
    calls[1]!.resolve(page(2));
    calls[0]!.reject(new Error('late failure'));
    await Promise.all([first, second]);
    expect(runner.getState().status).toBe('success');
  });

  it('aborts the request in flight when a new one starts', async () => {
    const { source, calls } = manualSource();
    const runner = createQueryRunner(source);
    const first = runner.run(q(1));
    void runner.run(q(2));
    expect(calls[0]!.signal.aborted).toBe(true);
    expect(calls[1]!.signal.aborted).toBe(false);
    await first; // never rejects
    expect(runner.getState().status).toBe('loading');
  });
});

describe('createQueryRunner — states', () => {
  it('goes idle → loading → success and keeps the previous result while loading', async () => {
    const { source, calls } = manualSource();
    const runner = createQueryRunner(source);
    const seen: QueryState<Item>['status'][] = [];
    runner.subscribe(state => seen.push(state.status));
    expect(runner.getState()).toEqual({ status: 'idle', query: undefined, result: undefined, error: undefined });

    const first = runner.run(q(1));
    calls[0]!.resolve(page(1));
    await first;
    const loaded = runner.getState().result;

    void runner.run(q(2));
    expect(runner.getState()).toMatchObject({ status: 'loading', result: loaded });
    expect(seen).toEqual(['loading', 'success', 'loading']);
    expect(Object.isFrozen(runner.getState())).toBe(true);
  });

  it('reports errors, keeps the last result, and an empty page is a success', async () => {
    const { source, calls } = manualSource();
    const runner = createQueryRunner(source);
    const ok = runner.run(q(1));
    calls[0]!.resolve({ rows: [], totalRows: 0 });
    await ok;
    expect(runner.getState()).toMatchObject({ status: 'success', result: { rows: [], totalRows: 0 } });

    const failure = new Error('HTTP 500');
    const bad = runner.run(q(2));
    calls[1]!.reject(failure);
    await bad;
    expect(runner.getState()).toMatchObject({ status: 'error', error: failure, result: { rows: [] } });
  });

  it('turns a malformed response into an error state', async () => {
    const { source, calls } = manualSource();
    const runner = createQueryRunner(source);
    const run = runner.run(q(1));
    calls[0]!.resolve({ rows: 'nope' });
    await run;
    expect(runner.getState().status).toBe('error');
    expect(String(runner.getState().error)).toContain('rows must be an array');
  });

  it('rejects an oversized page from a misbehaving source', async () => {
    const { source, calls } = manualSource();
    const runner = createQueryRunner(source);
    const run = runner.run({ page: 1, pageSize: 2 });
    calls[0]!.resolve(page(1, 2, 3));
    await run;
    expect(String(runner.getState().error)).toContain('more than the requested page size');
  });
});

describe('createQueryRunner — retry, cancel, lifecycle', () => {
  it('retries only when asked, with the same query', async () => {
    const { source, calls } = manualSource();
    const runner = createQueryRunner(source);
    const run = runner.run(q(3));
    calls[0]!.reject(new Error('timeout'));
    await run;
    expect(calls).toHaveLength(1); // no automatic retry
    const retry = runner.retry();
    expect(calls[1]!.query).toEqual(calls[0]!.query);
    calls[1]!.resolve(page(30));
    await retry;
    expect(runner.getState().status).toBe('success');
    expect(calls).toHaveLength(2);
  });

  it('cannot retry before anything ran', () => {
    const { source } = manualSource();
    expect(() => createQueryRunner(source).retry()).toThrow('nothing to retry');
  });

  it('cancel aborts and returns to the last settled state', async () => {
    const { source, calls } = manualSource({ ignoreAbort: true });
    const runner = createQueryRunner(source);
    const first = runner.run(q(1));
    calls[0]!.resolve(page(1));
    await first;
    const settled = runner.getState();
    const second = runner.run(q(2));
    runner.cancel();
    expect(calls[1]!.signal.aborted).toBe(true);
    expect(runner.getState()).toEqual(settled);
    calls[1]!.resolve(page(2)); // arrives anyway: ignored
    await second;
    expect(runner.getState()).toEqual(settled);
    runner.cancel(); // nothing loading: no-op
  });

  it('validates queries before sending', async () => {
    const { source, calls } = manualSource();
    const runner = createQueryRunner(source);
    await expect(runner.run({ page: 0, pageSize: 10 })).rejects.toThrow('page must be a positive safe integer');
    expect(calls).toHaveLength(0);
    expect(runner.getState().status).toBe('idle');
  });

  it('supports unsubscribe and destroy', async () => {
    const { source, calls } = manualSource({ ignoreAbort: true });
    const runner = createQueryRunner(source);
    const listener = vi.fn();
    const unsubscribe = runner.subscribe(listener);
    const run = runner.run(q(1));
    unsubscribe();
    runner.destroy();
    expect(calls[0]!.signal.aborted).toBe(true);
    calls[0]!.resolve(page(1));
    await run;
    expect(listener).toHaveBeenCalledTimes(1); // only the loading state
    expect(runner.getState().status).toBe('loading'); // final snapshot stays readable
    await runner.run(q(2));
    expect(calls).toHaveLength(1);
    expect(() => createQueryRunner({} as never)).toThrow('source must be a DataSource');
  });
});

describe('createQueryRunner — listener errors (second review)', () => {
  it('keeps a successful response successful when a listener throws', async () => {
    const errors: unknown[] = [];
    const runner = createQueryRunner<Item>({ getPage: async () => ({ rows: [{ id: 1 }], totalRows: 1 }) }, { onListenerError: e => errors.push(e) });
    runner.subscribe(state => { if (state.status === 'success') throw new Error('ui bug'); });
    await runner.run(q(1));
    expect(runner.getState()).toMatchObject({ status: 'success', result: { rows: [{ id: 1 }] } });
    expect(errors).toEqual([new Error('ui bug')]);
  });

  it('rejects run() only for an invalid query', async () => {
    const runner = createQueryRunner<Item>({ getPage: async () => { throw new Error('network'); } });
    await expect(runner.run(q(1))).resolves.toBeUndefined();
    expect(runner.getState().status).toBe('error');
    await expect(runner.run({ page: 0, pageSize: 1 })).rejects.toThrow('page must be');
  });
});
