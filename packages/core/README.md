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
  `gt`, `lt`, `between`, `in`, `empty`, `notEmpty`.
- **Column visibility:** `setColumnVisibility`, `getVisibleColumns`; hidden
  columns still sort, filter and search.
- **Pagination and selection,** local or server mode (`mode: 'server'` with
  `setPageResult`).
- **Immutable:** frozen snapshots; your data is never mutated or cloned.
- **Events in order:** a throwing listener never stops the others
  (`onListenerError`).

Requires Node 22+ for tooling; runs in every current browser.

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
