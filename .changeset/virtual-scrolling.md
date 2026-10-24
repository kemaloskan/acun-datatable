---
"@acunsoft/datatable-dom": minor
"@acunsoft/datatable-vue": minor
"@acunsoft/datatable-react": minor
"@acunsoft/datatable": minor
---

Virtual scrolling (DataTables Scroller): `virtual: true` (or `{ rowHeight,
overscan }`) shows every matching row of a local table in one scrolling list,
drawing only the rows in view between spacer rows; the pager goes away,
"Select all" takes every matching row and `aria-rowcount` / `aria-rowindex`
keep the count. `virtualWindow()` is exported.
