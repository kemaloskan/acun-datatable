---
"@acunsoft/datatable-core": minor
"@acunsoft/datatable-dom": minor
"@acunsoft/datatable-vue": minor
"@acunsoft/datatable-react": minor
"@acunsoft/datatable": minor
---

Footer totals: a column's `aggregate` (`sum`, `avg`, `min`, `max`, `count`)
adds a `<tfoot>` row over every matching row, with exact decimal sums
(`getAggregates()`, `aggregateRows()`); server results may carry `totals`.
`AcunDataTable` reads `columns[].aggregate` / `data-aggregate` and the
answer's `totals`. Also the `gte` and `lte` filter operators.
