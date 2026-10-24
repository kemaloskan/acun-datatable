# Upgrading

## npm packages: 0.2.x → 0.4.0

0.3.0 was prepared but not published, so 0.4.0 carries both releases. Most of
it is new; the changes below are the ones that can need a change in your code.

### Must change

1. **Pagination is three controls now.** `renderPagination` (Vue
   `AcunPagination`, React `Pagination`) renders numbered pages
   (`‹ 1 … 4 5 6 … 20 ›`). The page-size select moved to `renderPageSize` /
   `AcunPageSize` / `PageSize`, the row range to `renderPageInfo` /
   `AcunPageInfo` / `PageInfo`. Or use `renderDataTable` / `AcunDataTableLayout`
   / `DataTableLayout`, which places all of them.

   ```ts
   // 0.2
   renderPagination(el, table);
   // 0.4
   renderPageSize(sizeEl, table);
   renderPageInfo(infoEl, table);
   renderPagination(pagesEl, table, { firstLast: true });
   ```

2. **Labels.** `pageStatus` and `pageStatusOpen` are gone; use `pageInfo(from,
   to, total)`, `pageInfoOpen(from, to)` and `pageInfoEmpty`. New labels
   (`page`, `first`, `last`, filters, tools, editing, column tools …) have
   defaults in all five languages; only your own overrides need checking.

3. **Class names** (only if your CSS targets them): `adt-pagination` →
   `adt-paging`, `adt-status` → `adt-info`, `adt-page-size` → `adt-length`.
   `styles.css` was redesigned; custom styles on top of it may need a look.

4. **`AcunDataTable` `columns[].render`** (new package, TypeScript only) gets
   `row: Data | undefined`: a footer total has no row.

### Behaviour that changed

- **`@acunsoft/datatable-dom`:** `virtual` tables default to
  `responsive: 'scroll'`; Delete or a double-click on a resize handle sets
  the column to the width its content takes instead of clearing it.

- **`DataTableState`** has `columnOrder` and `columnWidths`. Code that compares
  a whole state object (`toEqual` in tests) needs the new fields.
- **`getVisibleColumns()`** follows `columnOrder` (the definition order until
  columns are moved).
- **`connectTable`** no longer asks the server again when only the column
  layout changes (visibility, order, widths): those are not part of the query.
- **Column formatters** (`format`) also format footer totals, called without a
  row; a formatter that needs the row falls back to the default text.
- **Outside clicks** use the event path, so a menu stays open when a control in
  it re-renders.

### New, nothing to change

`renderDataTable`, filters and chips, the tools menu (Excel, CSV, copy,
print), custom cells, footer totals, child rows, skeleton loading, fixed
columns, resizable and movable columns, editing in place, `responsive:
'auto'`, virtual scrolling, cursor paging, the DataTables protocol, the
`@acunsoft/datatable` one-call package with its `<acun-datatable>` element,
and `@acunsoft/datatable-server` for Node back ends.

## `acunsoft/datatable-laravel`: 0.4 → 0.5

- **Published views:** if you ran `vendor:publish --tag=acun-datatable-views`,
  publish them again (or merge): `table`, `feature`, `details` and
  `row-actions` changed, and there are new views (`edit-cell`,
  `detail-content`, `resize-handle`, `header-drag`, `pin`,
  `auto-responsive`, `placeholder`, `task`).
- **Sorting:** the user's sort now comes **before** an `orderBy()` written in
  `query()`, which only breaks ties. Before, a written order came first and
  sorting by a column had no effect on such tables.
- **Default layout:** the top bar's end is `['filters', 'columns', 'tools']`.
  Override `tableLayout()` to keep the old one.
- **`pageSize`** is in the URL only while it differs from `defaultPageSize()`
  (`queryStringWithDataTable()`), without a history entry.
- **New public properties** on components with `WithDataTable`:
  `openDetails`, `columnOrder`, `columnWidths`, `cursors`, `tableTask`.
  Rename your own properties if they use one of these names.
- **MariaDB through the `mysql` driver** now gets its count time limit
  (`max_statement_time`); before, it silently had none.
- **`TableExport`**: `saveCsv()` / `saveXlsx()` write files; `csv()` / `xlsx()`
  are unchanged.
- **DataTables protocol:** columns without data (`data: null`, e.g. actions)
  are ignored instead of refused, as is ordering by them.
- **`saveCell()`** refuses a column of another table (`customers.name` on an
  `Order` row) instead of writing the order's own attribute; override it to
  save such edits.

New, nothing to change: filters, footer totals, child rows
(`detailView()`), lazy placeholders, fixed, resizable and movable columns,
editing in place (`Column::editable()`), `responsive()` `auto`, cursor
paging, `searchEngine()` (Scout), queued exports and bulk actions, and the
DataTables protocol on `TableResponse`.
