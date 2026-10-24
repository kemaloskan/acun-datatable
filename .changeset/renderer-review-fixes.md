---
"@acunsoft/datatable-dom": minor
"@acunsoft/datatable-core": patch
---

Fixes from review. A click that closes an editor reaches the control it was
pressed on; a virtual table keeps an edit while its row is only scrolled out
of view; focus stays in the modal dialog when the table draws again.
`virtual` tables default to `responsive: 'scroll'`, and cards with `scrollY`
scroll in their box on phones. Delete or a double-click on a resize handle
goes back to the width the content takes; columns hidden by the responsive
layout no longer get a frozen 48px width, and saved widths no longer widen
the phone cards. Clearing a large selection is fast, footer totals are
computed once per set of matching rows, and `persistState` no longer keeps
the page of a cursor-paged table.
