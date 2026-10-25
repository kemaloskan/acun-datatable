# @acunsoft/datatable-vue

## 0.4.0

### Minor Changes

- `responsive="auto"` keeps every column once the user sized one.
- Virtual scrolling keeps the column widths while rows scroll by.
- `AcunPageInfo` and `AcunPagination` show a server's lower bound ("10,000+") and
  number the pages known to exist.
- 8d10fdf: Row actions with `icon`, `iconOnly`, `danger` and `confirm`, and a "⋮" menu
  for the actions past `maxInlineActions`. Shift+click selects a range of rows.
  The bulk bar offers "Select all N matching" (server mode: `allMatching` and
  the `query` reach the action). Vue `AcunBulkActions` and React `BulkActions`
  now use the DOM bar, so they behave the same.
- 30c5883: Child rows (DataTables `row().child()`): DOM `detail` (a node, text or a
  promise, with loading and error states), Vue `#detail="{ row }"` slot, React
  `detail` prop and `AcunDataTable` `detail`. Every row gets a ⊕ button; with
  `responsive: 'collapse'` the hidden columns come first, with `'modal'` the
  detail opens in the dialog.
- b758334: Resizing and moving columns. Core: `columnOrder` and `columnWidths` state
  with `moveColumn`, `setColumnOrder`, `setColumnWidth`, `setColumnWidths`
  (`COLUMN_WIDTH_LIMITS`), kept by `persistState`. Renderers:
  `resizableColumns` (drag handles, ←/→, Delete to reset) and
  `reorderableColumns` (drag headers; up/down buttons and "Reset columns" in the
  column menu), shared through `columnTools()`. `AcunDataTable`: `columnResize`,
  `columnReorder`. `connectTable` no longer re-queries the server when only the
  column layout changes (visibility, order, widths). Menus stay open when a
  control inside them re-renders.
- 4eeae3d: Filter panel: `ColumnDef.filter` (`true` or `{ options }`) puts a column in a
  "Filters" menu with a control for its type (text, min–max, from–to, yes/no,
  ticks) and shows the active filters as removable chips (`renderFilters`,
  `renderFilterChips`, Vue `AcunFilters` / `AcunFilterChips`, React `Filters` /
  `FilterChips`; built into `renderDataTable` and `AcunDataTable`). New filter
  operators `gte` and `lte` ("at least", "at most"; whole days for dates).
- 8644d50: Fixed columns (DataTables `fixedColumns`): `fixedColumns: { start, end }`
  keeps the first data columns (with the checkbox and ⊕) and the last cells in
  place while the table scrolls sideways, measured from the header and kept in
  step with re-renders and resizes. Pinned cells never take more than 60% of
  the visible width. `pinColumns()` is exported for other markup.
- 71e021a: Footer totals: a column's `aggregate` (`sum`, `avg`, `min`, `max`, `count`)
  adds a `<tfoot>` row over every matching row, with exact decimal sums
  (`getAggregates()`, `aggregateRows()`); server results may carry `totals`.
  `AcunDataTable` reads `columns[].aggregate` / `data-aggregate` and the
  answer's `totals`. Also the `gte` and `lte` filter operators.
- e013f67: Fixes from review. Virtual tables can edit any row (not only the first
  page), keep an editor while its row is scrolled out and get it back when a
  cell is drawn again; the viewport is measured once mounted and on resize;
  `virtual` defaults to `responsive: 'scroll'`. Bulk actions and tools stay
  mounted across parent re-renders (focus and an open menu survive), and a
  click that closes an editor reaches the control it was pressed on (the
  shared `afterPointerRelease` of `@acunsoft/datatable-dom`). Vue:
  components follow a new `table` prop (`useTable` takes a ref or getter),
  filters follow new labels and locale, the dialog stays open while its row
  matches, the row height is measured on mount, and element ids come from
  `useId` (3.5+) so server-rendered markup hydrates.
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
- f87a635: `responsive: 'auto'`: columns hide only while the table does not fit,
  measured at any width instead of fixed breakpoints (lowest priority first,
  then from the right; never priority 1), open below the row like `collapse`
  and come back when there is room (DataTables Responsive). `autoResponsive()`
  is exported for other markup.
- 28e378a: Skeleton loading: while a `status` source loads the first rows, the table
  shows shimmering placeholder rows (a page, at most ten) instead of the empty
  text, so the layout does not jump (`skeleton: false` turns it off; no
  animation with `prefers-reduced-motion`). Later loads keep the rows, dimmed.
- 158c180: Tools menu and custom cells: `renderMenu` / `printTable` and the `tools`
  layout feature (Vue `AcunTools`, React `Tools`); `AcunDataTable` `buttons:
  ['excel', 'csv', 'copy', 'print']` exports the selection or every matching
  row (server side page by page, `exportLimit`). Custom cells in the DOM
  renderer (`cells`, with the safe `el()` builder) and `AcunDataTable`
  `columns[].cell`. `@acunsoft/datatable` now includes the export package.
- ae943e8: Virtual scrolling (DataTables Scroller): `virtual: true` (or `{ rowHeight,
  overscan }`) shows every matching row of a local table in one scrolling list,
  drawing only the rows in view between spacer rows; the pager goes away,
  "Select all" takes every matching row and `aria-rowcount` / `aria-rowindex`
  keep the count. `virtualWindow()` is exported.

### Patch Changes

- Updated dependencies [8d10fdf]
- Updated dependencies [30c5883]
- Updated dependencies [b758334]
- Updated dependencies [5753f1f]
- Updated dependencies [4eeae3d]
- Updated dependencies [8644d50]
- Updated dependencies [71e021a]
- Updated dependencies [b55e381]
- Updated dependencies [f3b749f]
- Updated dependencies [ade0663]
- Updated dependencies [f87a635]
- Updated dependencies [28e378a]
- Updated dependencies [158c180]
- Updated dependencies [ae943e8]
  - @acunsoft/datatable-dom@0.4.0
  - @acunsoft/datatable-core@0.4.0

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

### Patch Changes

- Updated dependencies [f00047a]
  - @acunsoft/datatable-core@0.3.0
  - @acunsoft/datatable-dom@0.3.0

## 0.2.1

### Patch Changes

- Published from GitHub Actions through npm trusted publishing, with provenance attestations that link each package to its source commit. No code changes.
- Updated dependencies
  - @acunsoft/datatable-core@0.2.1
  - @acunsoft/datatable-dom@0.2.1

## 0.2.0

### Minor Changes

- 3508f4c: New package `@acunsoft/datatable-vue`: `useDataTable`, `useTable` and the components `AcunDataTable` (slots for custom cells), `AcunPagination`, `AcunSearch`, `AcunColumnToggle`, `AcunBulkActions`, with the DOM renderer's markup and accessibility. DOM: the shared helpers `createCellText`, `cellValue`, `nextSorting` and `rowName` are exported.

### Patch Changes

- Updated dependencies [60e548c]
- Updated dependencies [54866ed]
- Updated dependencies [45ac8e9]
- Updated dependencies [3508f4c]
  - @acunsoft/datatable-core@0.2.0
  - @acunsoft/datatable-dom@0.2.0
