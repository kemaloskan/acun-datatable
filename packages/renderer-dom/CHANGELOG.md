# @acunsoft/datatable-dom

## 0.4.0

### Minor Changes

- `printRows(document, { title, subtitle, headers, rows, numeric })` prints only a
  table — the rows given, not the page — through a hidden frame with the page's
  stylesheets.
- On phones (≤ 640px) the column, filter and tools menu buttons show their icon only
  (the name stays for screen readers), on a row of their own under the search. An open
  menu stays inside the window (`placeMenu()`, `--adt-menu-shift`); before, it could
  open past the left edge.
- Cards (`responsive: 'cards'`, phones) no longer repeat the column names above the
  cards: every card names its values.
- Pinned columns stay in place when columns can also be resized (or edited): the header
  cells were shifted instead of sticking, covering their neighbours.
- `responsive: 'auto'` keeps every column once the user sized one; the table scrolls
  sideways (Reset columns brings the measuring back).
- Virtual scrolling keeps the column widths while rows scroll by (measured once the first
  rows are drawn; again when the columns or the width change).
- The selection bar's "select all N matching" uses the table's `selectAllMatching()`.
- The page info shows the server's count as it was sent: exact ("of 35 rows"),
  a lower bound ("of 10,000+ rows", new label `pageInfoMore`) or none; the
  pager numbers the pages known to exist (`knownPageCount`).
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
- b55e381: Editing in place: `ColumnDef.editable` (or `{ options }`) and the renderers'
  `onEdit`. An edit button or a double click opens an editor chosen by the
  column type (text, number, decimal with a decimal comma, date, date-time,
  yes/no, a list); Enter or leaving saves, Escape cancels, errors keep it open.
  The editor (`cellEditor`) is shared by the DOM, Vue and React tables.
  `AcunDataTable`: `columns[].editable` and `onEdit`, updating the row (or
  reloading a server page) once saved.
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

- Updated dependencies [b758334]
- Updated dependencies [5753f1f]
- Updated dependencies [4eeae3d]
- Updated dependencies [71e021a]
- Updated dependencies [b55e381]
- Updated dependencies [f3b749f]
- Updated dependencies [ade0663]
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

## 0.2.1

### Patch Changes

- Published from GitHub Actions through npm trusted publishing, with provenance attestations that link each package to its source commit. No code changes.
- Updated dependencies
  - @acunsoft/datatable-core@0.2.1

## 0.2.0

### Minor Changes

- 60e548c: Row and bulk actions (`rowActions` option of `renderTable`, `renderBulkActions`) and column visibility (core `setColumnVisibility`, `setHiddenColumns`, `getVisibleColumns`, `enableHiding`; DOM `renderColumnToggle`). Hidden columns still sort, filter and search.
- 54866ed: New package `@acunsoft/datatable-export`: `tableToSheet`, `toCsv` (formula-injection guard), `toXlsx` (real Excel workbooks without dependencies), `parseCsv`, `readXlsx` (size-limited, zip-bomb safe) and `importRows` (typed, validated import with line-numbered errors). DOM: `downloadFile`.
- 45ac8e9: Built-in German, French and Spanish texts next to English and Turkish (`labelsDe`, `labelsFr`, `labelsEs`, `resolveLabels(locale)`), with singular/plural forms and locale digit grouping (fixes "1 rows"). Import problems carry a stable `code` and `type`, and `importRows` takes `locale` and `messages`.
- 3508f4c: New package `@acunsoft/datatable-vue`: `useDataTable`, `useTable` and the components `AcunDataTable` (slots for custom cells), `AcunPagination`, `AcunSearch`, `AcunColumnToggle`, `AcunBulkActions`, with the DOM renderer's markup and accessibility. DOM: the shared helpers `createCellText`, `cellValue`, `nextSorting` and `rowName` are exported.

### Patch Changes

- Updated dependencies [60e548c]
  - @acunsoft/datatable-core@0.2.0

## 0.1.0

### Minor Changes

- 7387b2b: First public release: headless core (typed columns, natural and multi-column sorting, Turkish-aware smart search and filter operators, pagination, selection, local and server mode), HTTP data source with latest-request-wins runner, and an accessible DOM renderer with an optional stylesheet.

### Patch Changes

- Updated dependencies [7387b2b]
  - @acunsoft/datatable-core@0.1.0
