# @acunsoft/datatable-dom

Accessible DOM renderer for `@acunsoft/datatable-core`: a semantic `<table>`,
pagination and search, with no framework, jQuery, Alpine or CSS framework.

```ts
import { createDataTable } from '@acunsoft/datatable-core';
import { labelsTr, renderPagination, renderSearch, renderTable } from '@acunsoft/datatable-dom';

const table = createDataTable({ data: orders, columns, locale: 'tr' });

renderSearch(document.querySelector('#search')!, table, { labels: labelsTr });
const view = renderTable(document.querySelector('#orders')!, table, {
  caption: 'Siparişler',
  selectable: true,
  locale: 'tr',
  labels: labelsTr,
  format: { total: (value) => `${Number(value).toFixed(2)} ₺` },
});
renderPagination(document.querySelector('#pages')!, table, { pageSizes: [10, 25, 50], labels: labelsTr });

// later
view.destroy();
```

Works the same with a server-mode table (`mode: 'server'` + `connectTable` from
`@acunsoft/datatable-http`): the renderer only reads `table.getPage()` and
calls table actions.

## `renderTable(container, table, options?)`

- `<table>` with an optional `<caption>`, `<th scope="col">` headers and one
  `<tr>` per row of the current page; an empty state row spans all columns.
- **Sorting:** sortable headers are `<button type="button">`. A click cycles
  ascending → descending → none; **Shift**+click adds or changes a secondary
  sort. The primary sorted header gets `aria-sort`; the ▲/▼ marks (with a
  priority number for multi-sort) are `aria-hidden`.
- **Selection** (`selectable: true`): a checkbox per row (`aria-label` from
  `labels.selectRow`) and, in multiple mode, a tri-state "select all on this
  page" checkbox (`indeterminate` when some are selected). Selected rows get
  `adt-row--selected`.
- **Text only:** cell text comes from `format[columnId](value, row)` or a
  locale-aware default (numbers with `Intl.NumberFormat`, dates with
  `Intl.DateTimeFormat`, `null`/`undefined`/`NaN`/invalid dates as empty). A
  formatter must return a string; everything is written with `textContent`, so
  values are never parsed as HTML.
- **Focus:** the table re-renders on every table event and moves keyboard focus
  back to the same sort button or checkbox.

## `renderPagination(container, table, options?)`

A `<nav>` with Previous/Next buttons, a `aria-live="polite"` status
(`Page 2 of 7 · 160 rows`) and a labelled page-size `<select>`
(`pageSizes`, default `[10, 25, 50, 100]`; the current size is always listed).
Controls are built once and updated in place. At the first or last page the
buttons get `aria-disabled="true"` instead of `disabled`, so focus stays on them.

## `renderSearch(container, table, options?)`

A labelled `<input type="search">` bound to the global search. Typing is
debounced (`debounceMs`, default 250); Enter applies at once. The input follows
external state changes unless the user is typing in it.

## Labels and styling

`labelsEn` (default) and `labelsTr` cover every visible and screen-reader text;
pass `labels` to override any of them. No CSS is shipped. Style the stable class
names: `adt-table-wrap`, `adt-table`, `adt-th`, `adt-sort`, `adt-sort--asc`,
`adt-sort--desc`, `adt-sort-mark`, `adt-select`, `adt-row`, `adt-row--selected`,
`adt-empty`, `adt-pagination`, `adt-previous`, `adt-next`, `adt-status`,
`adt-page-size`, `adt-search`.

## Security and accessibility notes

- No HTML-parsing API is used anywhere in the package; a test fails the build if
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`
  or `createContextualFragment` appear in the source. An XSS fixture checks that
  hostile values in cells, headers, captions, row IDs and labels stay text.
- All controls are native elements, so they are reachable and operable with the
  keyboard (Tab, Enter, Space). Browser-level keyboard tests with Playwright are
  planned (SPEC M3).
