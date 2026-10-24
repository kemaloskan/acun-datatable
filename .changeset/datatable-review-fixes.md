---
"@acunsoft/datatable": minor
---

`setData(rows)` replaces the rows of a table in the browser and keeps its
state; `<acun-datatable>` uses it for a new `data` and keeps its table when
it is moved. Exports of cursor-paged tables follow `nextCursor` and contain
every row. A DataTables back end's `error` is shown as an error; cursor
paging with that protocol is refused. `onEdit` may return `fetch(…)`: a
response that is not `ok` keeps the editor open. `state-save` keys include
the page path.
