# @acunsoft/datatable-dom

Accessible DOM renderer for `@acunsoft/datatable-core`: a semantic `<table>`,
numbered pagination, page size, search and a column menu, arranged like
DataTables, with no framework, jQuery, Alpine or CSS framework.

```ts
import { createDataTable } from '@acunsoft/datatable-core';
import { renderDataTable } from '@acunsoft/datatable-dom';
import '@acunsoft/datatable-dom/styles.css'; // optional

const table = createDataTable({ data: orders, columns, locale: 'tr' });

const view = renderDataTable(document.querySelector('#orders')!, table, {
  caption: 'Siparişler',
  selectable: true,
  locale: 'tr', // Turkish texts, numbers and dates
  pageSizes: [10, 25, 50],
  format: { total: (value) => `${Number(value).toFixed(2)} ₺` },
});

// later
view.destroy();
```

```
┌───────────────────────────────────────────────────────────┐
│ [25 v] [ Ara...              ]               [Kolonlar v] │  top bar
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────┐
│ [ ]  MÜŞTERİ        TUTAR        DURUM                    │  table
└───────────────────────────────────────────────────────────┘
┌───────────────────────────────────────────────────────────┐
│ Toplam: 5.000 kaydın 1 ile 25 ...  < 1 … 4 [5] 6 … 200 >  │  bottom bar
└───────────────────────────────────────────────────────────┘
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
- **Narrow screens** (`responsive`, with the optional stylesheet):

  | Mode | Below 640px |
  |---|---|
  | `'cards'` (default) | every row becomes a card, each cell with its header (`data-label`) |
  | `'scroll'` | the table keeps its columns and scrolls sideways inside its box |
  | `'collapse'` | lower-priority columns hide; a ⊕ button (`aria-expanded`) opens their values below the row |
  | `'modal'` | the same button opens every value of the row in a `<dialog>` (Escape, ✕ or a click outside closes it; focus returns to the button) |

  For `collapse` and `modal`, `ColumnDef.priority` decides what stays: `1`
  always, `2` hides below 640px, `3` already below 960px (tablets). By default
  the first column is `1` and the others `2`; row actions move into the
  details. While every column fits, the button is not shown.

  ```ts
  columns: [
    { id: 'customer', header: 'Müşteri', accessorKey: 'customer' },          // 1: first column
    { id: 'total', header: 'Tutar', accessorKey: 'total', priority: 1 },     // stays on phones
    { id: 'email', header: 'E-posta', accessorKey: 'email', priority: 3 },   // hides on tablets too
  ],
  renderDataTable(el, table, { responsive: 'collapse' });
  ```
- **Numbers** (`type: 'number'` or `'decimal'`) are right-aligned with
  tabular digits (`adt-num`), like every serious table.
- **Sizes:** `size: 'sm' | 'md' | 'lg'` (default `md`) sets row height, text
  and control size together (class `adt-size--sm` / `adt-size--lg`).

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
- **Icons, danger and confirm:** `icon: 'view' | 'edit' | 'delete' | 'copy' |
  'check' | 'download'` or `{ path }` (your own 24×24 SVG path), `iconOnly`
  (the label becomes the accessible name and tooltip), `danger` (red) and
  `confirm: 'Delete?'` or `row => …` (asked with the browser's confirm).
- **`maxInlineActions: 2`** keeps the first actions as buttons and moves the
  rest into a "⋮" menu (Escape or a click outside closes it).
- **Selection:** Shift+click on a row checkbox selects or clears the range
  from the last clicked row. Once the whole page is selected and more rows
  match, the bar offers "Select all N matching": locally it selects them; in
  server mode `onSelect` then gets `{ allMatching: true, query }` so you can
  apply the action on the server with the same filters.
- Authorization and the actual change are up to your handler; the renderer
  never deletes anything itself.

## `renderColumnToggle(container, table, options?)`

A "Columns" menu built from a native `<details>` with one labelled checkbox per
column, inside a `<fieldset>`. Columns with `enableHiding: false` and the last
visible column cannot be unchecked. `renderTable` shows only
`table.getVisibleColumns()`.

```ts
renderColumnToggle(document.querySelector('#columns')!, table, { labels: labelsTr });
```

## `renderDataTable(container, table, options?)`

The table and its controls in a bar above and a bar below it. Every slot can
hold one feature, several, your own function, or nothing:

| Slot | Default |
|---|---|
| `topStart` | `['pageSize', 'search']` |
| `topEnd` | `'columns'` |
| `bottomStart` | `'info'` |
| `bottomEnd` | `'paging'` |

```ts
renderDataTable(el, table, {
  layout: {
    topEnd: [slot => { slot.append(myFilterButton); }, 'columns'], // your own control
    bottomStart: null,                                             // empty
    bottomEnd: ['info', 'paging'],
  },
  paging: { siblings: 2, firstLast: true },
  search: { placeholder: 'Müşteri ara…', debounceMs: 300 },
  bulkActions: [{ id: 'archive', label: 'Arşivle', onSelect: ({ ids }) => archive(ids) }],
});
```

It accepts every `renderTable` option too. `locale` also picks the built-in
texts (`'tr'` → Turkish); `labels` overrides single texts. Features are
`pageSize`, `search`, `columns`, `info` and `paging`; a function receives an
empty element to fill and may return `{ destroy }`. A bar with no features is
left out. Each part is also available on its own (below), for your own markup.

## Tools menu and custom cells

`renderMenu(container, { items })` renders a dropdown of actions (`{ id,
label, onSelect, group? }`); a string returned by `onSelect` is announced
(e.g. "25 rows copied"), a thrown error shown. `renderDataTable(…, { tools })`
puts it in the top bar (layout feature `tools`); `printTable()` prints the
table without the controls.

`cells: { status: ({ value, text, row, column }) => el('span', { class: 'badge' }, text) }`
draws cells yourself: return a DOM node (`el()` builds one without parsing
HTML) or a string (shown as text). Sorting, search and exports keep the value.

## Child rows

```ts
renderDataTable(el, table, {
  detail: row => fetch(`/orders/${row.id}/lines`).then(r => r.json())
    .then(lines => el('ul', {}, ...lines.map(line => el('li', {}, `${line.product} × ${line.quantity}`)))),
});
```

`detail` adds a ⊕ button to every row that opens a child row under it
(DataTables child rows): return a DOM node, text, or a promise of either
("Loading…" until it settles, an error message if it fails). It is called
when a row opens, and the result is kept while the row stays open and its
data is the same. With `responsive: 'collapse'` the hidden columns come
first; with `'modal'` the detail opens in the dialog.

## Footer totals

A column with `aggregate: 'sum' | 'avg' | 'min' | 'max' | 'count'` gets a
`<tfoot>` row of totals over every row matching the search and filters, not
just the page. Decimal sums are exact (`0.10 + 0.20` is `0.30`, no float
rounding). With a server data source the answer's `totals` (per column ID)
gives them; `table.getAggregates()` returns the same values for your own
footer.

## `renderFilters(container, table, options?)` · `renderFilterChips(…)`

A "Filters" menu with one control per column that has `filter`, chosen from
its `type`: a search box (`contains`), min–max for numbers, from–to for dates
(`between`, `gte`, `lte`; whole days), any/yes/no for booleans, or ticks for
`filter: { options: [{ value, label }] }` (`in`). Changes apply at once;
the button shows how many filters are active. `renderFilterChips` lists the
active filters as removable chips with "Clear filters". `renderDataTable`
adds both by itself (layout feature `filters`). The pure helpers
`filterControls`, `readFilter`, `filterRules` and `describeFilter` are
exported for your own controls.

## `renderPagination(container, table, options?)`

Numbered pages in a `<nav>`: `‹ 1 … 4 5 6 … 20 ›`. While there are more pages
than fit, the number of buttons stays the same (`2·boundaries + 2·siblings + 3`),
so the pager never jumps in width; a gap always hides at least two pages. The
current page has `aria-current="page"`, every number an accessible name
(`Page 5`), the arrows are icon buttons named `Previous` and `Next`. At either
end the arrows get `aria-disabled="true"` instead of `disabled`, so focus stays
on them; focus also stays on a clicked number.

Options: `siblings` (default 1), `boundaries` (default 1), `firstLast` (also
show « and », default `false`) and `locale` for digit grouping (`1.200`). With
an unknown server total it numbers the pages seen so far and keeps "next" while
the page is full. The same algorithm is exported by the core as
`getPageItems(page, pageCount, { siblings, boundaries })`.

## `renderPageSize(container, table, options?)`

A rows-per-page `<select>` (`pageSizes`, default `[10, 25, 50, 100]`; the
current size is always listed) with a visually hidden label.

## `renderPageInfo(container, table, options?)`

The visible range as one polite live region: `Showing 1 to 25 of 5,000 rows`
(`Toplam: 5.000 kaydın 1 ile 25 arasını gösteriyor`), only the range when a
server does not report a total (a lower bound is never shown as the total),
`No rows to show` when empty. Name your rows with a label override:

```ts
const n = new Intl.NumberFormat('tr');
renderDataTable(el, table, {
  locale: 'tr',
  labels: { pageInfo: (from, to, total) => `Toplam: ${n.format(total)} personel üyesinin ${n.format(from)} ile ${n.format(to)} arasını gösteriyor` },
});
```

## `renderSearch(container, table, options?)`

An `<input type="search">` with a search icon and a visually hidden label,
bound to the global search. The placeholder defaults to the label with an
ellipsis (`Search…`). Typing is debounced (`debounceMs`, default 250); Enter
applies at once. The input follows external state changes unless the user is
typing in it.

## `downloadFile(data, filename, type?)`

Offers a string or bytes as a download (type from the extension: `.csv`,
`.xlsx`, `.json`, `.txt`), e.g. with `@acunsoft/datatable-export`:
`downloadFile(toXlsx(tableToSheet(table)), 'orders.xlsx')`.

## Labels and styling

Built-in texts, no i18n library needed: `labelsEn` (default), `labelsTr`,
`labelsDe`, `labelsFr`, `labelsEs` cover every visible and screen-reader text.
Counts use the language's singular and plural forms and digit grouping
(`Showing 1 to 1 of 1 row`, `Showing 1 to 25 of 16,000 rows`,
`Toplam: 1.600 kaydın 1 ile 25 arasını gösteriyor`, `Affichage de 1 à 25 sur 1 600 lignes`).

```ts
renderTable(el, table, { locale: 'de', labels: resolveLabels('de-AT') }); // de-AT → German, unknown → English
renderSearch(el, table, { labels: resolveLabels(navigator.language, { search: 'Filtern' }) });
```

Pass `labels` to override single texts, or build them from your own i18n
library (`{ ...labelsEn, search: t('search') }`). The German, French and
Spanish texts are new; corrections from native speakers are welcome.

`@acunsoft/datatable-dom/styles.css` is optional: a clean panel look, visible
focus rings, loading and error states, a print style (only the table, without
the controls) and a responsive layout: below 860px the bottom bar centres and
stacks, below 640px the controls go full width, the pager shows only the ends
and the current page (`‹ 1 … 7 … 48 ›`) and every row becomes a card (each cell
shows its header). It is light by default; it turns dark under an ancestor with
`data-theme="dark"` or the class `dark`, and follows the system setting under
`data-theme="auto"` (it cannot see your page background, so it never turns dark
on its own).

Customise it with custom properties on `.adt` (the outermost `adt-*` element;
the defaults are declared only there, so your values reach every part):

```css
.adt {
  --adt-accent: #0f766e;        /* active page, focus, sort marks */
  --adt-radius: 12px;           /* panels */
  --adt-control-radius: 8px;    /* inputs, buttons, page numbers */
  --adt-control-height: 2.25rem;
  --adt-gap: 0.75rem;           /* space between bars and table */
  --adt-cell-padding: 0.6rem 0.75rem; /* denser rows */
  --adt-head-transform: none;   /* normal-case headers */
  --adt-surface: transparent;   /* no panel background */
}
```

The other tokens are `--adt-bg`, `--adt-fg`, `--adt-muted`, `--adt-line`,
`--adt-head-bg`, `--adt-head-fg`, `--adt-hover`, `--adt-selected`,
`--adt-accent-fg`, `--adt-focus`, `--adt-danger`, `--adt-shadow`, `--adt-font`
and `--adt-font-size`. Or skip the file and style the stable class names:
`adt`, `adt-bar`, `adt-top`, `adt-bottom`, `adt-bar-start`, `adt-bar-end`,
`adt-feature`, `adt-feature--{name}`, `adt-table-wrap`, `adt-table`, `adt-th`,
`adt-sort`, `adt-sort--asc`, `adt-sort--desc`, `adt-sort-mark`, `adt-select`,
`adt-row`, `adt-row--selected`, `adt-empty`, `adt-paging`, `adt-page`,
`adt-page-arrow`, `adt-page-numbers`, `adt-page-gap`, `adt-previous`, `adt-next`,
`adt-first`, `adt-last`, `adt-info`, `adt-length`, `adt-search`, `adt-control`,
`adt-icon`, `adt-sr-only`, `adt-scroll`, `adt-notice`, `adt-retry`,
`adt-loading`, `adt-actions`, `adt-action`, `adt-selection`,
`adt-selection-count`, `adt-bulk-action`, `adt-clear-selection`, `adt-columns`,
`adt-menu`, `adt-menu-list`, `adt-menu-item`, `adt-button`.

## Security and accessibility notes

- No HTML-parsing API is used anywhere in the package; a test fails the build if
  `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write`, `DOMParser`
  or `createContextualFragment` appear in the source. An XSS fixture checks that
  hostile values in cells, headers, captions, row IDs and labels stay text.
- All controls are native elements, so they are reachable and operable with the
  keyboard (Tab, Enter, Space); the column menu also closes with Escape.
  Playwright tests check keyboard use, the layout and the narrow-screen view in
  Chromium, Firefox and WebKit.

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
