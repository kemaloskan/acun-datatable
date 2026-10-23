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
calls table actions. Pass the runner as `status` to show loading and errors:

```ts
import '@acunsoft/datatable-dom/styles.css'; // optional
renderTable(el, table, { status: runner, labels: labelsTr });
```

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
- **Focus and updates:** view changes (page, sorting, filters, data) re-render the
  table and move keyboard focus back to the same sort button or checkbox;
  selection changes only update the checkboxes and row classes in place.
- **Row names:** checkbox labels name the row (`Select Ayşe`), from the first
  column's text or `rowLabel(row)`, never the raw ID.
- **Server mode** (`status`, any object with `getState()` / `subscribe()` such as
  the HTTP runner): while loading the wrapper has `aria-busy="true"` and a polite
  status says `labels.loading`; after an error an alert shows `labels.error` and,
  if the source has `retry()`, a "Try again" button. The last rows stay visible.
- **Narrow screens:** every cell has `data-label` with its header, used by the
  optional stylesheet's card layout.

## Row and bulk actions

```ts
renderTable(el, table, {
  selectable: true,
  rowActions: [
    { id: 'edit', label: 'Düzenle', onSelect: (row) => openEditor(row.original) },
    { id: 'delete', label: 'Sil', onSelect: (row) => remove(row.id), disabled: (row) => row.original.locked },
  ],
});
renderBulkActions(document.querySelector('#bulk')!, table, {
  labels: labelsTr,
  actions: [{ id: 'archive', label: 'Arşivle', onSelect: ({ ids }) => archive(ids) }],
});
```

- **Row actions** add a last "Actions" column with one `<button>` per action.
  Each button's accessible name includes the row's name (`Edit: Ayşe`), so
  screen-reader users know which row it acts on. `hidden(row)` leaves a button
  out; `disabled(row)` keeps it focusable with `aria-disabled` and ignores
  clicks. Focus returns to the same button after a re-render.
- **`renderBulkActions`** shows a bar while rows are selected: a polite
  "3 selected" status, the action buttons and "Clear selection". `onSelect`
  receives `{ ids, rows }`: every selected ID (also on other pages in server
  mode) and the selected rows the table holds.
- Asking for confirmation, authorization and the actual change are up to your
  handler; the renderer never deletes anything itself.

## `renderColumnToggle(container, table, options?)`

A "Columns" menu built from a native `<details>` with one labelled checkbox per
column, inside a `<fieldset>`. Columns with `enableHiding: false` and the last
visible column cannot be unchecked. `renderTable` shows only
`table.getVisibleColumns()`.

```ts
renderColumnToggle(document.querySelector('#columns')!, table, { labels: labelsTr });
```

## `renderPagination(container, table, options?)`

A `<nav>` with Previous/Next buttons, a `aria-live="polite"` status
(`Page 2 of 7 · 160 rows`, or only `Page 2` when a server does not report a
total, instead of presenting a lower bound as the total) and a labelled
page-size `<select>`
(`pageSizes`, default `[10, 25, 50, 100]`; the current size is always listed).
Controls are built once and updated in place. At the first or last page the
buttons get `aria-disabled="true"` instead of `disabled`, so focus stays on them.

## `renderSearch(container, table, options?)`

A labelled `<input type="search">` bound to the global search. Typing is
debounced (`debounceMs`, default 250); Enter applies at once. The input follows
external state changes unless the user is typing in it.

## Labels and styling

`labelsEn` (default) and `labelsTr` cover every visible and screen-reader text;
pass `labels` to override any of them.

`@acunsoft/datatable-dom/styles.css` is optional: a neutral look built on
`--adt-*` custom properties, visible focus rings, loading and error states, a
horizontally scrolling table on medium screens and a card layout below 640px
(each cell shows its header). It is light by default; it turns dark under an
ancestor with `data-theme="dark"` or the class `dark`, and follows the system
setting under `data-theme="auto"` (it cannot see your page background, so it
never turns dark on its own). Or skip it and style the stable class names: `adt-table-wrap`, `adt-table`, `adt-th`, `adt-sort`, `adt-sort--asc`,
`adt-sort--desc`, `adt-sort-mark`, `adt-select`, `adt-row`, `adt-row--selected`,
`adt-empty`, `adt-pagination`, `adt-previous`, `adt-next`, `adt-status`,
`adt-page-size`, `adt-search`, `adt-scroll`, `adt-notice`, `adt-retry`,
`adt-loading`, `adt-actions`, `adt-action`, `adt-selection`,
`adt-selection-count`, `adt-bulk-action`, `adt-clear-selection`, `adt-columns`.

## Security and accessibility notes

- No HTML-parsing API is used anywhere in the package; a test fails the build if
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`
  or `createContextualFragment` appear in the source. An XSS fixture checks that
  hostile values in cells, headers, captions, row IDs and labels stay text.
- All controls are native elements, so they are reachable and operable with the
  keyboard (Tab, Enter, Space). Browser-level keyboard tests with Playwright are
  planned (SPEC M3).

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
