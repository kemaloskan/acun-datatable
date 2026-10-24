# @acunsoft/datatable-react

React hooks and components for
[`@acunsoft/datatable-core`](https://www.npmjs.com/package/@acunsoft/datatable-core):
an accessible table, pagination, search, a column menu and bulk actions, with
custom cell renderers. React 18.2+ (19 tested), marked `"use client"` for the
Next.js App Router.

```bash
npm install react @acunsoft/datatable-core @acunsoft/datatable-react
```

```tsx
import {
  BulkActions, ColumnToggle, DataTable, PageInfo, PageSize, Pagination, Search, labelsTr, useDataTable,
} from '@acunsoft/datatable-react';
import '@acunsoft/datatable-dom/styles.css'; // optional neutral styles

export function Orders({ orders }: { orders: Order[] }) {
  const { table } = useDataTable<Order>({
    data: orders, // a new array replaces the rows
    columns: [
      { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
      { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', enableSorting: true },
      { id: 'status', header: 'Durum', accessorKey: 'status' },
    ],
    locale: 'tr',
  });
  // The same layout as renderDataTable: a bar above and a bar below the table.
  return (
    <div className="adt">
      <div className="adt-bar adt-top">
        <div className="adt-bar-start">
          <PageSize table={table} labels={labelsTr} pageSizes={[10, 25, 50]} />
          <div className="adt-feature--search"><Search table={table} labels={labelsTr} /></div>
        </div>
        <div className="adt-bar-end"><ColumnToggle table={table} labels={labelsTr} /></div>
      </div>
      <BulkActions table={table} labels={labelsTr}
        actions={[{ id: 'archive', label: 'Arşivle', onSelect: ({ ids }) => archive(ids) }]} />
      <DataTable table={table} caption="Siparişler" locale="tr" selectable labels={labelsTr}
        cells={{ status: ({ value }) => <Badge value={String(value)} /> }}
        rowActions={[{ id: 'edit', label: 'Düzenle', onSelect: row => edit(row.original) }]} />
      <div className="adt-bar adt-bottom">
        <div className="adt-bar-start"><PageInfo table={table} labels={labelsTr} /></div>
        <div className="adt-bar-end"><Pagination table={table} labels={labelsTr} locale="tr" /></div>
      </div>
    </div>
  );
}
```

## Hooks

- **`useDataTable(options)`** creates the table once per component. Options are
  read once, except `data`: a new array (local mode) replaces the rows. The
  table only holds listeners, which React removes on unmount, so Strict Mode's
  double mount is safe.
- **`useTable(table)`** follows a table you created yourself (for example a
  server-mode table connected with `@acunsoft/datatable-http`).

Both return `{ table, state, page, visibleColumns, totalRows }` and re-render
on every table event through `useSyncExternalStore`.

## Components

| Component | Props |
|---|---|
| `DataTableLayout` | every `DataTable` prop plus `pageSizes`, `search`, `searchPlaceholder`, `debounceMs`, `filters`, `columnToggle`, `tools`, `bulkActions`, `paging`, `topStart`, `topEnd`, `bottomStart`, `bottomEnd` |
| `Filters` · `FilterChips` · `Tools` | `table`, `labels`, `locale` · `items` |
| `DataTable` | `table`, `caption`, `selectable`, `locale`, `labels`, `format`, `cells`, `detail`, `empty`, `rowLabel`, `rowActions`, `maxInlineActions`, `status`, `skeleton`, `onEdit`, `fixedColumns`, `resizableColumns`, `reorderableColumns`, `responsive`, `size`, `stickyHeader`, `scrollY`, `multiSort` |
| `Pagination` | `table`, `siblings`, `boundaries`, `firstLast`, `locale`, `labels` |
| `PageSize` | `table`, `pageSizes`, `labels` |
| `PageInfo` | `table`, `labels` |
| `Search` | `table`, `placeholder`, `debounceMs`, `labels` |
| `ColumnToggle` | `table`, `labels` |
| `BulkActions` | `table`, `actions`, `labels` |

The markup, `adt-*` class names, keyboard behaviour and accessibility match
[`@acunsoft/datatable-dom`](https://www.npmjs.com/package/@acunsoft/datatable-dom),
so `@acunsoft/datatable-dom/styles.css` styles both. `cells` renders React
elements per column (`{ column, row, value, text }`); values are escaped by
React; the package never injects HTML. `detail={row => <OrderLines orderId={row.id} />}`
opens a child row under each row with a ⊕ button (in the dialog with
`responsive="modal"`); it renders only while the row is open, so the
component can load its own data on mount. In server mode pass the HTTP runner as
`status` for loading and error states.

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
