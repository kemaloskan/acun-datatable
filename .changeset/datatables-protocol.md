---
"@acunsoft/datatable-http": minor
"@acunsoft/datatable": minor
---

DataTables' server-side protocol: `serializeDataTablesQuery()` and
`fromDataTablesResponse()` talk to existing DataTables back ends (draw,
start, length, order, columns, search[value]); `AcunDataTable` sends it with
`ajax: { url, protocol: 'datatables' }`.
