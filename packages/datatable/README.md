# @acunsoft/datatable

A complete data table in one call, in the spirit of DataTables, with no jQuery
and no other runtime dependency. It bundles the Acun DataTable core, the
accessible DOM renderer and the HTTP data source.

```bash
npm install @acunsoft/datatable
```

```js
import { AcunDataTable } from '@acunsoft/datatable';
import '@acunsoft/datatable/styles.css';

const table = new AcunDataTable('#myTable', {
  fixedHeader: true,
  processing: true,
  serverSide: true,
  ajax: { url: '/api/products', method: 'POST' },
  pagination: { enabled: true, pageSize: 25, pageSizes: [10, 25, 50, 100] },
  sorting: { enabled: true, multiSort: true },
  searching: { enabled: true, debounce: 300 },
  language: 'tr',
});
```

Or with a `<script>` tag, without a build step (`window.AcunDataTable`):

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@acunsoft/datatable@0.3.0/dist/styles.css">
<script src="https://cdn.jsdelivr.net/npm/@acunsoft/datatable@0.3.0/dist/acun-datatable.min.js"></script>
<script>
  new AcunDataTable('#myTable', { serverSide: true, ajax: '/api/products' });
</script>
```

## Where the rows come from

| You give | What happens |
|---|---|
| an existing `<table>` | its `<thead>` gives the columns (`<th data-column="price">` names the field) and its `<tbody>` the rows; sorting, search and pages run in the browser |
| `data: [...]` | the rows, in the browser |
| `ajax: '/orders.json'` | every row is loaded once, then everything runs in the browser |
| `ajax` + `serverSide: true` | the server sorts, searches and pages; only one page is ever loaded |

Without `columns`, they come from the table's `<thead>` or, failing that, from
the fields of the first row. Name them yourself for titles and types:

```js
columns: [
  { data: 'name', title: 'Ürün' },
  { data: 'price', title: 'Fiyat', type: 'decimal', priority: 1 },
  { data: 'stock', title: 'Stok', type: 'number', searchable: false },
  { data: 'created_at', title: 'Eklenme', type: 'datetime', visible: false },
  { data: 'status', title: 'Durum', render: value => (value === 'active' ? 'Satışta' : 'Pasif') },
],
```

`render` returns text; cells are always written as text, never as HTML.
`cell: (value, row, text) => el('span', { class: 'badge' }, text)` draws a
cell as a DOM node (`el` is exported, and `AcunDataTable.el` in the
`<script>` build); it is never parsed as HTML.
`buttons: ['excel', 'csv', 'copy', 'print', { id, label, onSelect }]` adds the
tools menu; exports take the selected rows, else every matching row (server
side: fetched page by page up to `exportLimit`, default 10,000).
`filter: true` (or a list of `{ value, label }`) puts a column in the
"Filters" menu; active filters show as removable chips.
`detail: row => …` opens a child row under each row (DataTables child rows):
a DOM node, text or a promise of either, e.g. order lines fetched for that
row.
`aggregate: 'sum'` (`'avg'`, `'min'`, `'max'`, `'count'`; `data-aggregate`
on a `<th>`) adds a footer total over every matching row; server side it is
read from the answer's `totals`.

## Server side

Requests use the `@acunsoft/datatable-http` wire format: `page`, `pageSize`,
`sort=price:desc,name:asc`, `filters[i][field|op|value]` and `search`, in the
URL (`GET`) or as a form body (`method: 'POST'`). A POST sends Laravel's
`<meta name="csrf-token">` as `X-CSRF-TOKEN` by itself. The answer may be
`{ rows, totalRows }`, Laravel's paginator (`{ data, total }`) or DataTables'
`{ data, recordsFiltered }`; anything else is read with `ajax.dataSrc`.

With Laravel, the endpoint is one line (package `acunsoft/datatable-laravel`):

```php
Route::match(['get', 'post'], '/api/products', fn () => TableResponse::for(Product::query())
    ->columns([
        Column::make('name')->sortable()->filterable(),
        Column::make('price')->type('decimal')->sortable()->filterable(),
    ]));
```

## Options

| Option | Default | DataTables |
|---|---|---|
| `columns` | from `<thead>` or the first row | `columns` |
| `data` | | `data` |
| `ajax` | | `ajax` (`url`, `method`, `headers`, `dataSrc`) |
| `serverSide` | `false` | `serverSide` |
| `processing` | `true` | `processing` |
| `skeleton` | `true`: shimmering placeholder rows until the first rows arrive | |
| `pagination` | `{ enabled: true, pageSize: 25, pageSizes: [10, 25, 50, 100] }`, also `firstLast`, `siblings` | `paging`, `pageLength`, `lengthMenu` |
| `sorting` | `{ enabled: true, multiSort: true, initial: [] }` | `ordering`, `order` |
| `searching` | `{ enabled: true, debounce: 250, placeholder, initial }` | `searching`, `searchDelay` |
| `language` | `'en'`; also `'tr'`, `'de'`, `'fr'`, `'es'` | `language` |
| `labels` | | `language` texts |
| `fixedHeader` | `false` | `fixedHeader` |
| `fixedColumns` | `{ start: 0, end: 0 }`: columns that stay while the table scrolls sideways | `fixedColumns` |
| `scrollY` | | `scrollY` |
| `responsive` | `'cards'`; also `'scroll'`, `'collapse'`, `'modal'` | `responsive` |
| `size` | `'md'`; also `'sm'`, `'lg'` | |
| `selectable`, `rowActions`, `bulkActions` | | `select`, buttons |
| `detail` | | child rows (`row().child()`) |
| `columnToggle` | `true` | `colvis` |
| `layout` | page size and search above, info and pages below | `layout` |
| `stateSave` | `false`; `true` or `{ key, storage: 'session' }` | `stateSave` |
| `buttons` | | `buttons` |
| `rowId` | `'id'` when rows have one | `rowId` |

`pagination: false` shows every row on one page (up to 1,000; not with
`serverSide`). `searching: false` and `sorting: false` remove the search box
and the sort buttons.

## Methods

`ready` (a promise for the first rows), `reload()`, `search(text)`,
`page(n)`, `pageSize(n)`, `order([{ field, direction }])`, `selectedRows()`,
`on(listener)` and `destroy()` (an original `<table>` is put back). `table` is
the headless `@acunsoft/datatable-core` table for everything else.

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
