---
"@acunsoft/datatable-core": minor
"@acunsoft/datatable-dom": minor
"@acunsoft/datatable-vue": minor
"@acunsoft/datatable-react": minor
"@acunsoft/datatable-http": patch
"@acunsoft/datatable": minor
---

Resizing and moving columns. Core: `columnOrder` and `columnWidths` state
with `moveColumn`, `setColumnOrder`, `setColumnWidth`, `setColumnWidths`
(`COLUMN_WIDTH_LIMITS`), kept by `persistState`. Renderers:
`resizableColumns` (drag handles, ←/→, Delete to reset) and
`reorderableColumns` (drag headers; up/down buttons and "Reset columns" in the
column menu), shared through `columnTools()`. `AcunDataTable`: `columnResize`,
`columnReorder`. `connectTable` no longer re-queries the server when only the
column layout changes (visibility, order, widths). Menus stay open when a
control inside them re-renders.
