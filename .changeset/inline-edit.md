---
"@acunsoft/datatable-core": minor
"@acunsoft/datatable-dom": minor
"@acunsoft/datatable-vue": minor
"@acunsoft/datatable-react": minor
"@acunsoft/datatable": minor
---

Editing in place: `ColumnDef.editable` (or `{ options }`) and the renderers'
`onEdit`. An edit button or a double click opens an editor chosen by the
column type (text, number, decimal with a decimal comma, date, date-time,
yes/no, a list); Enter or leaving saves, Escape cancels, errors keep it open.
The editor (`cellEditor`) is shared by the DOM, Vue and React tables.
`AcunDataTable`: `columns[].editable` and `onEdit`, updating the row (or
reloading a server page) once saved.
