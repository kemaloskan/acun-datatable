---
"@acunsoft/datatable-core": minor
"@acunsoft/datatable-dom": minor
"@acunsoft/datatable-vue": minor
"@acunsoft/datatable-react": minor
"@acunsoft/datatable": minor
---

Filter panel: `ColumnDef.filter` (`true` or `{ options }`) puts a column in a
"Filters" menu with a control for its type (text, min–max, from–to, yes/no,
ticks) and shows the active filters as removable chips (`renderFilters`,
`renderFilterChips`, Vue `AcunFilters` / `AcunFilterChips`, React `Filters` /
`FilterChips`; built into `renderDataTable` and `AcunDataTable`). New filter
operators `gte` and `lte` ("at least", "at most"; whole days for dates).
