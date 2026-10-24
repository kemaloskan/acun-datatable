---
"@acunsoft/datatable-core": minor
"@acunsoft/datatable-http": minor
"@acunsoft/datatable": minor
---

Cursor (keyset) paging for server tables: `createDataTable({ mode: 'server',
paging: 'cursor' })` keeps the cursor of every page seen and sends the
previous page's `nextCursor` (`TableQuery.cursor`); the pager offers those
pages and the next one. `createHttpDataSource({ paging: 'cursor' })` sends
`paging=cursor&cursor=…`. `AcunDataTable`: `pagination: { cursor: true }`.
