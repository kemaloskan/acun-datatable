---
"@acunsoft/datatable-dom": minor
"@acunsoft/datatable-vue": minor
"@acunsoft/datatable-react": minor
"@acunsoft/datatable": minor
---

Skeleton loading: while a `status` source loads the first rows, the table
shows shimmering placeholder rows (a page, at most ten) instead of the empty
text, so the layout does not jump (`skeleton: false` turns it off; no
animation with `prefers-reduced-motion`). Later loads keep the rows, dimmed.
