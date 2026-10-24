---
"@acunsoft/datatable-dom": minor
"@acunsoft/datatable-vue": minor
"@acunsoft/datatable-react": minor
"@acunsoft/datatable": minor
---

Fixed columns (DataTables `fixedColumns`): `fixedColumns: { start, end }`
keeps the first data columns (with the checkbox and ⊕) and the last cells in
place while the table scrolls sideways, measured from the header and kept in
step with re-renders and resizes. Pinned cells never take more than 60% of
the visible width. `pinColumns()` is exported for other markup.
