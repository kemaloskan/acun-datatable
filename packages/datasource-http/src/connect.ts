import type { DataTable, TableQuery } from '@acunsoft/datatable-core';
import type { QueryRunner } from './runner';

const sameQuery = (left: TableQuery | undefined, right: TableQuery): boolean =>
  left !== undefined && JSON.stringify(left) === JSON.stringify(right);

/**
 * Keep a server-mode table and a query runner in sync, and load the first page.
 *
 * Every table change that affects the query (page, page size, sorting, filters,
 * search) runs the table's current query; selection changes do not. A
 * successful result is applied only if it answers the table's current query, so
 * neither a stale response nor one for an outdated state reaches the table.
 * Loading and error states stay on the runner. Returns a function that
 * disconnects both sides; it does not destroy either of them.
 */
const PRESENTATION = new Set(['selection', 'result', 'columnVisibility', 'columnOrder', 'columnWidths']);

export function connectTable<TData>(table: DataTable<TData>, runner: QueryRunner<TData>): () => void {
  if (table.getMode() !== 'server') throw new Error('connectTable requires a table created with mode: "server"');
  const offTable = table.subscribe((_, event) => {
    // Selection, results and the column layout (visibility, order, widths) do not change the query.
    if (PRESENTATION.has(event.type)) return;
    void runner.run(table.getQuery());
  });
  const offRunner = runner.subscribe((state) => {
    if (state.status !== 'success' || state.result === undefined) return;
    if (!sameQuery(state.query, table.getQuery())) return;
    table.setPageResult(state.result);
  });
  void runner.run(table.getQuery());
  return () => {
    offTable();
    offRunner();
  };
}
