# @acunsoft/datatable-core

## 0.4.0

### Minor Changes

- b758334: Resizing and moving columns. Core: `columnOrder` and `columnWidths` state
  with `moveColumn`, `setColumnOrder`, `setColumnWidth`, `setColumnWidths`
  (`COLUMN_WIDTH_LIMITS`), kept by `persistState`. Renderers:
  `resizableColumns` (drag handles, ←/→, Delete to reset) and
  `reorderableColumns` (drag headers; up/down buttons and "Reset columns" in the
  column menu), shared through `columnTools()`. `AcunDataTable`: `columnResize`,
  `columnReorder`. `connectTable` no longer re-queries the server when only the
  column layout changes (visibility, order, widths). Menus stay open when a
  control inside them re-renders.
- 5753f1f: Cursor (keyset) paging for server tables: `createDataTable({ mode: 'server',
  paging: 'cursor' })` keeps the cursor of every page seen and sends the
  previous page's `nextCursor` (`TableQuery.cursor`); the pager offers those
  pages and the next one. `createHttpDataSource({ paging: 'cursor' })` sends
  `paging=cursor&cursor=…`. `AcunDataTable`: `pagination: { cursor: true }`.
- 4eeae3d: Filter panel: `ColumnDef.filter` (`true` or `{ options }`) puts a column in a
  "Filters" menu with a control for its type (text, min–max, from–to, yes/no,
  ticks) and shows the active filters as removable chips (`renderFilters`,
  `renderFilterChips`, Vue `AcunFilters` / `AcunFilterChips`, React `Filters` /
  `FilterChips`; built into `renderDataTable` and `AcunDataTable`). New filter
  operators `gte` and `lte` ("at least", "at most"; whole days for dates).
- 71e021a: Footer totals: a column's `aggregate` (`sum`, `avg`, `min`, `max`, `count`)
  adds a `<tfoot>` row over every matching row, with exact decimal sums
  (`getAggregates()`, `aggregateRows()`); server results may carry `totals`.
  `AcunDataTable` reads `columns[].aggregate` / `data-aggregate` and the
  answer's `totals`. Also the `gte` and `lte` filter operators.
- b55e381: Editing in place: `ColumnDef.editable` (or `{ options }`) and the renderers'
  `onEdit`. An edit button or a double click opens an editor chosen by the
  column type (text, number, decimal with a decimal comma, date, date-time,
  yes/no, a list); Enter or leaving saves, Escape cancels, errors keep it open.
  The editor (`cellEditor`) is shared by the DOM, Vue and React tables.
  `AcunDataTable`: `columns[].editable` and `onEdit`, updating the row (or
  reloading a server page) once saved.
- f3b749f: Vue `AcunDataTableLayout` and React `DataTableLayout`: the whole table with
  its bars in one component, like `renderDataTable`. `persistState(table, {
  key })` in the core and `stateSave` in `AcunDataTable` remember page, page
  size, sorting, filters, search and hidden columns across reloads.

### Patch Changes

- ade0663: Fixes from review. A click that closes an editor reaches the control it was
  pressed on; a virtual table keeps an edit while its row is only scrolled out
  of view; focus stays in the modal dialog when the table draws again.
  `virtual` tables default to `responsive: 'scroll'`, and cards with `scrollY`
  scroll in their box on phones. Delete or a double-click on a resize handle
  goes back to the width the content takes; columns hidden by the responsive
  layout no longer get a frozen 48px width, and saved widths no longer widen
  the phone cards. Clearing a large selection is fast, footer totals are
  computed once per set of matching rows, and `persistState` no longer keeps
  the page of a cursor-paged table.

## 0.3.0

### Minor Changes

- f00047a: Professional, DataTables-like layout.
  
  - **Breaking:** `renderPagination` (and Vue `AcunPagination`, React `Pagination`)
    now renders numbered pages (`‹ 1 … 4 5 6 … 20 ›`) with icon arrows, optional
    first/last buttons (`firstLast`), `siblings`, `boundaries` and `locale`. The
    page-size select moved to the new `renderPageSize` / `AcunPageSize` /
    `PageSize`, the status text to `renderPageInfo` / `AcunPageInfo` / `PageInfo`
    (`Showing 1 to 25 of 5,000 rows`, Turkish `Toplam: 5.000 kaydın 1 ile 25
    arasını gösteriyor`). The labels `pageStatus` and `pageStatusOpen` are
    replaced by `pageInfo`, `pageInfoOpen`, `pageInfoEmpty`, `page`, `first` and
    `last`; the class names `adt-pagination`, `adt-status` and `adt-page-size`
    by `adt-paging`, `adt-info` and `adt-length`.
  - New `renderDataTable`: the table between a top bar (page size and search on
    the left, column menu on the right) and a bottom bar (row range on the left,
    pages on the right), arranged with a `layout` option that also takes your own
    controls; `locale` picks the built-in texts.
  - New `getPageItems` in the core: the pager algorithm, with a fixed number of
    buttons so the pager never changes width.
  - Search has a search icon, a visually hidden label and a default placeholder
    (`Search…`); the column menu has an icon and closes with Escape or a click
    outside.
  - `styles.css` redesigned: panels, uppercase headers with sort marks, square page
    buttons with an accent current page, consistent control heights, new tokens
    (`--adt-surface`, `--adt-control-radius`, `--adt-control-height`, `--adt-gap`,
    `--adt-head-transform`, …), native controls follow dark mode, a print style
    and a responsive layout (stacked bars, a compact pager and cards on phones).
  - Narrow screens: `responsive: 'cards' | 'scroll' | 'collapse' | 'modal'` on
    `renderTable` / `renderDataTable`, Vue `AcunDataTable` and React `DataTable`.
    `collapse` hides lower-priority columns (new `ColumnDef.priority`: 1 always,
    2 below 640px, 3 below 960px) behind a button that opens them below the row;
    `modal` shows every value of the row in an accessible `<dialog>`.
  - Sizes: `size: 'sm' | 'md' | 'lg'` (classes `adt-size--sm` / `adt-size--lg`).
  - `--adt-*` defaults are declared only on the outermost element, so values set
    on `.adt` now reach every part.
  - Number and decimal columns are right-aligned with tabular digits (`adt-num`).
  - New package `@acunsoft/datatable`: `new AcunDataTable('#table', { serverSide,
    ajax: { url, method }, pagination, sorting, searching, language, fixedHeader,
    … })` in the spirit of DataTables, on an existing `<table>`, rows, a JSON
    file or a server; also a single `<script>` build (`acun-datatable.min.js`).
  - `@acunsoft/datatable-http`: `method: 'POST'` sends the query as a form body.
  - Sticky header: `stickyHeader` (DataTables `fixedHeader`) and `scrollY` (a
    fixed height scrolling inside); `multiSort: false` sorts by one column only.

## 0.2.1

### Patch Changes

- Published from GitHub Actions through npm trusted publishing, with provenance attestations that link each package to its source commit. No code changes.

## 0.2.0

### Minor Changes

- 60e548c: Row and bulk actions (`rowActions` option of `renderTable`, `renderBulkActions`) and column visibility (core `setColumnVisibility`, `setHiddenColumns`, `getVisibleColumns`, `enableHiding`; DOM `renderColumnToggle`). Hidden columns still sort, filter and search.

## 0.1.0

### Minor Changes

- 7387b2b: First public release: headless core (typed columns, natural and multi-column sorting, Turkish-aware smart search and filter operators, pagination, selection, local and server mode), HTTP data source with latest-request-wins runner, and an accessible DOM renderer with an optional stylesheet.
