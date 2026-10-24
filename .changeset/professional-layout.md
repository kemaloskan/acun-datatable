---
"@acunsoft/datatable-core": minor
"@acunsoft/datatable-dom": minor
"@acunsoft/datatable-vue": minor
"@acunsoft/datatable-react": minor
"@acunsoft/datatable-http": minor
"@acunsoft/datatable": minor
---

Professional, DataTables-like layout.

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

