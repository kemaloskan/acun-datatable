# @acunsoft/datatable-core

Headless, framework-independent data table engine in TypeScript: no DOM, no
framework, no runtime dependencies. Rendering comes from
[`@acunsoft/datatable-dom`](https://www.npmjs.com/package/@acunsoft/datatable-dom)
or your own components; server-side data from
[`@acunsoft/datatable-http`](https://www.npmjs.com/package/@acunsoft/datatable-http).

```bash
npm install @acunsoft/datatable-core
```

```ts
import { createDataTable } from '@acunsoft/datatable-core';

const table = createDataTable({
  data: orders,
  columns: [
    { id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
    { id: 'total', header: 'Total', accessorKey: 'total', type: 'decimal', enableSorting: true, enableFiltering: true },
  ],
  locale: 'tr',
  initialState: { pageSize: 25 },
});

table.subscribe((state, event) => render(table.getPage()));
table.setSorting([{ field: 'total', direction: 'desc' }]);
table.setGlobalSearch('ayse "istanbul"');
table.setFilters([{ field: 'total', operator: 'between', value: ['100', '500'] }]);
```

- **Typed columns:** `text`, `number`, `decimal` (exact), `date` (a calendar
  day), `datetime` (an instant), `boolean`.
- **Sorting:** stable, multi-column, natural text order ("Item 2" before
  "Item 10") with `Intl.Collator`.
- **Search and filters:** smart global search (every word must match, quoted
  phrases stay together), case-, accent- and Turkish-insensitive (`ayse` finds
  `Ayşe`, `istanbul` finds `İSTANBUL`); operators `contains`, `startsWith`, `eq`,
  `gt`, `gte`, `lt`, `lte`, `between`, `in`, `empty`, `notEmpty`.
- **Column visibility, order and widths:** `setColumnVisibility`,
  `moveColumn` / `setColumnOrder`, `setColumnWidth` / `setColumnWidths`
  (within `COLUMN_WIDTH_LIMITS`); `getVisibleColumns()` follows the order.
  Hidden columns still sort, filter and search; none of it changes the query.
- **Pagination and selection,** local or server mode (`mode: 'server'` with
  `setPageResult`); `paging: 'cursor'` sends the previous page's
  `nextCursor` (keyset) instead of a page offset. `getPageItems(page, pageCount, { siblings, boundaries })`
  gives the numbers of a pager (`1 … 4 5 6 … 20`) with a fixed length, so it
  never changes width.
- **Responsive priority:** `priority: 1 | 2 | 3` on a column tells renderers
  which columns stay on phones (1) and tablets (2) when rows collapse.
- **Remember the state:** `persistState(table, { key })` keeps page, page
  size, sorting, filters, search, hidden columns, column order and widths in
  `localStorage` (or any storage) across reloads, like DataTables `stateSave`.
- **Editable columns:** `editable: true` (or `{ options }`) marks cells a
  renderer may edit in place; saving is yours (`onEdit`).
- **Footer totals:** `aggregate: 'sum' | 'avg' | 'min' | 'max' | 'count'` on a
  column; `getAggregates()` gives them over every matching row (exact decimal
  sums), or from the server's `totals` in server mode. `aggregateRows(rows,
  columns)` is exported on its own.
- **Immutable:** frozen snapshots; your data is never mutated or cloned.
- **Events in order:** a throwing listener never stops the others
  (`onListenerError`).

Requires Node 22+ for tooling; runs in every current browser.

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
