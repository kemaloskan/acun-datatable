---
"@acunsoft/datatable-vue": minor
"@acunsoft/datatable-react": minor
---

Fixes from review. Virtual tables can edit any row (not only the first
page), keep an editor while its row is scrolled out and get it back when a
cell is drawn again; the viewport is measured once mounted and on resize;
`virtual` defaults to `responsive: 'scroll'`. Bulk actions and tools stay
mounted across parent re-renders (focus and an open menu survive), and a
click that closes an editor reaches the control it was pressed on (the
shared `afterPointerRelease` of `@acunsoft/datatable-dom`). Vue:
components follow a new `table` prop (`useTable` takes a ref or getter),
filters follow new labels and locale, the dialog stays open while its row
matches, the row height is measured on mount, and element ids come from
`useId` (3.5+) so server-rendered markup hydrates.
