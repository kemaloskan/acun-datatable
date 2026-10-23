# Changelog

All notable changes to this repository. Each npm package also has its own
`CHANGELOG.md`, written by Changesets.

## Unreleased

### Changed (large tables, `acunsoft/datatable-laravel` 0.3.0)

Measured on 5,000,000 rows in PostgreSQL 17; see the Laravel README's
"Large tables" guide.

- **Bounded counts:** at most 10,000 matches are counted (`countLimit`).
  Beyond that Livewire shows "10,000+" (en, tr, de, fr, es), the JSON
  endpoint sends `totalRowsAtLeast` instead of `totalRows`, and "next page"
  comes from one extra row. First page: 53 ms → 5.5 ms. `QueryApplier::paginate()`
  returns a `TablePage` (a `LengthAwarePaginator` with `totalIsExact()`).
- **Result window:** pages starting past 100,000 rows are refused (422) or
  clamped in Livewire (`maxResultWindow`); page 100,000 took 4.1 s.
- **Dates use the column's index:** a whole day is a range `[00:00, next
  day 00:00)` instead of `DATE(column)`; one month of orders: 373 ms → 1.9 ms.
  This also stops the database session timezone from moving day edges.
- **Sorting uses the index:** the primary-key tie-breaker follows the last
  sort direction (`total desc, id desc`), 27× faster deep pages.
- **Search only where a word can be:** words with letters skip number, date
  and yes/no columns; numbers and dates are compared without folding.
- **`FoldsSearchColumns`** model trait keeps `searchUsing()` copies up to date.
  With those copies and a trigram index, search on 5M rows takes 0.4–68 ms
  (was 2.4–3.7 s).

### Fixed

- **Laravel search was case-sensitive for Turkish letters** on columns without
  `Column::searchUsing()`: on SQLite `istanbul` did not find `İstanbul` and
  `igdir` did not find `Iğdır` (MySQL and PostgreSQL had similar gaps with
  I/ı/İ/i). Search, `contains` and `startsWith` now fold the column in SQL on
  every database (a PHP function on SQLite, `LOWER`/`REPLACE` elsewhere) and
  still match the text as typed. `searchUsing()` remains the faster option for
  large tables. (`acunsoft/datatable-laravel` 0.2.1)

## 0.2.1 (2026-10-23)

No code changes: the first release published from GitHub Actions through npm
trusted publishing (no npm token), with provenance attestations.

## 0.2.0 (2026-10-23)

First release published to npm: `@acunsoft/datatable-core`, `-http`, `-dom`,
`-export`, `-vue` and `-react`, all at 0.2.0. It includes everything listed
under 0.1.0 below, which was prepared but never published.

### Added

- **Languages:** built-in German, French and Spanish texts next to English and
  Turkish, without any i18n library: `labelsDe`, `labelsFr`, `labelsEs`,
  `resolveLabels('de-AT')` (falls back to English); import problems with a
  stable `code`, the column `type` and messages in all five languages
  (`importRows(…, { locale })`); Laravel `lang/{de,fr,es}`. Arabic and
  right-to-left layouts are not planned.
- **Fixed:** counts use singular and plural forms and the locale's digit
  grouping: "Page 1 of 1 · 1 row" instead of "1 rows", "16,000 rows",
  "1.600 kayıt" (browser packages and Livewire views).
- **React adapter** (new package `@acunsoft/datatable-react`, peer
  `react >=18.2`, marked `"use client"`): `useDataTable` (Strict-Mode safe;
  a new `data` array replaces the rows), `useTable` (`useSyncExternalStore`),
  and `DataTable` (custom `cells`), `Pagination`, `Search`, `ColumnToggle`,
  `BulkActions` with the DOM renderer's markup and accessibility.
- **Build order:** workspaces are listed in dependency order, so a clean
  `npm run build` builds `core` and `datatable-dom` before the adapters.
- **Vue 3 adapter** (new package `@acunsoft/datatable-vue`, peer `vue ^3.4`):
  `useDataTable` (data as array, ref or getter; destroyed with the
  component), `useTable`, and `AcunDataTable` (cell slots), `AcunPagination`,
  `AcunSearch`, `AcunColumnToggle`, `AcunBulkActions` with the DOM renderer's
  markup, classes and accessibility. The DOM package now exports the shared
  `createCellText`, `cellValue`, `nextSorting` and `rowName`.
- **Excel and CSV export and import** (new package
  `@acunsoft/datatable-export`, no dependencies): `tableToSheet`, `toXlsx`
  (real workbooks: typed numbers, decimals with scale, dates, booleans, bold
  frozen header; text never becomes a formula; verified in Microsoft Excel),
  `toCsv` (UTF-8 BOM, formula-injection guard), `parseCsv`, `readXlsx`
  (shared strings, rich text, date formats, 1904 dates; row, column and
  inflated-size limits) and `importRows` (header matching, Turkish number and
  date formats, line-numbered errors instead of guesses). DOM: `downloadFile`.
  Laravel: `TableExport` (chunked CSV/xlsx downloads of every matching row,
  422 beyond a limit), `SheetReader` and `RowImporter` (same rules, translated
  messages, Windows-1254 CSVs); Livewire export buttons (`exportFormats()`)
  and `WithTableImport` (upload, line-numbered problems, one transaction).
- **Fixed:** for qualified columns (`orders.total`) the Laravel JSON endpoint
  and views read the row attribute `total`, not a nested path.
  `InvalidTableQuery` renders as HTTP 422 wherever it is thrown.
- **Column visibility.** Core: `hiddenColumns` state, `setColumnVisibility`,
  `setHiddenColumns`, `getVisibleColumns`, a `columnVisibility` event and the
  column option `enableHiding`. Hidden columns still sort, filter and search;
  the query is unchanged. DOM: `renderColumnToggle` and `renderTable` shows
  only visible columns. Livewire: a "Columns" menu, `Column::hideable()` /
  `hidden()`, hidden IDs in the URL.
- **Row and bulk actions.** `renderTable(…, { rowActions })` adds an
  accessible "Actions" column (buttons named with the row, `hidden` and
  `disabled` per row); `renderBulkActions` shows a bar for the selected rows.
  Livewire: `rowActions()` / `bulkActions()` with `Action::make()->label()
  ->confirm()->visible()->handle()`; rows are looked up inside `query()` and
  visibility is checked again before running. New labels: `actions`,
  `rowAction`, `bulkActions`, `selectedCount`, `clearSelection`.

## 0.1.0 (never published)

Prepared on 2026-10-23 and superseded by 0.2.0. The first version of `@acunsoft/datatable-core`, `@acunsoft/datatable-http` and
`@acunsoft/datatable-dom`. The Laravel package (`acunsoft/datatable-laravel`)
is released separately through Packagist.

### Added (release preparation)

- The npm packages are publishable: `private` removed, `publishConfig.access`
  public, descriptions, keywords and a README for the core package.
- Changesets (dev dependency) for versioning: the three npm packages share one
  version; `npm run version-packages`, `npm run release`. A first changeset
  bumps them to `0.1.0`. A manual **Release** workflow publishes with npm
  provenance. See `RELEASING.md`.

### Added (Livewire)

- **`acunsoft/datatable-laravel` Livewire table:** `WithDataTable` trait with
  search, multi-column sorting, filters and page size kept in the URL (the HTTP
  wire-format names), row/page/"all matching" selection with `selectedQuery()`
  for bulk actions, and a neutral Blade view using the `adt-*` class names of
  `@acunsoft/datatable-dom`. TR/EN texts, `Column::format()` for cell text.
  Tampered URL state is dropped instead of failing; selection stays inside
  `query()`. Livewire is a suggestion, not a requirement.
- `styles.css` styles the selection bar (`adt-selection`).

### Fixed (review of October 2026)

- **Turkish search:** `contains` and global search fold text case-, accent- and
  Turkish-insensitively in every locale. `isparta` now finds `ISPARTA` with `tr`,
  `istanbul` finds `İSTANBUL` with the default locale, `ayse` finds `Ayşe` and
  `igdir` finds `Iğdır`. Sorting keeps the locale's alphabet.
- **Numbers sent as text:** new column `type` (`text`, `number`, `decimal`,
  `date`, `boolean`). Laravel decimals such as `"100.00"` now sort and filter as
  numbers (`decimal` compares exactly, without floating point).
- **Natural text order:** text sorts naturally by default ("Ürün 2" before
  "Ürün 10"); `numeric: false` restores character order.
- **Search formats:** numbers match as written in the locale (`1234,5`,
  `1.234`), dates and booleans are searchable.
- **Date shift:** dates in HTTP queries are sent in local time
  (`formatLocalDate`); 23 October in Turkey no longer arrives as 22 October.
- **Event order:** events raised inside a listener are queued and delivered in
  order; a throwing listener no longer stops the others (applies to
  `createTableState`, `createRowSelection`, `createDataTable` and the runner).
- **Query validation:** `createTableQuery` rejects unknown operators (e.g.
  `DROP`) and invalid values, and leaves out empty `contains` filters, which
  Laravel validation rejected with HTTP 422.

### Fixed (second review)

- **Server-mode page clamp:** `setPageResult` corrects the page before it emits,
  so listeners never see page 5 of 2, and the correction no longer depends on
  listeners succeeding.
- **Listener errors no longer leak into results:** setters do not throw when a
  listener throws, and the HTTP runner keeps a successful response successful.
  Errors go to `onListenerError` (default `reportListenerError`).

- **Days:** new column type `datetime` (an instant) next to `date` (a calendar
  day, time dropped). In a `datetime` column a date-only filter value covers
  the whole day, so `eq '2026-10-23'` on `created_at` finds every record of that
  day, not just midnight.
- **Small value fixes:** `text` writes dates in local time (23 October stays 23
  October in Turkey); `"1e400"` is no longer read as Infinity by `number`.
  `formatLocalDate` moved to the core (still exported by the HTTP package).

- **Search speed:** `createFilterCache` keeps each cell's typed value and folded
  search text per `Row` wrapper; `createDataTable` uses it. 100k rows: about
  330–400 ms → 40–50 ms per search once warm (Apple M2, Node 22).
- **DOM renderer (second review):** optional `styles.css` (light/dark tokens,
  focus rings, card layout on phones); `status` option for loading
  (`aria-busy`) and error/retry states in server mode; selection updates
  checkboxes in place instead of re-rendering the table; an unknown server total
  is shown as `Page N`, not as a total; row checkboxes are labelled with the
  row's name (`rowLabel`) instead of its raw ID. New labels: `pageStatusOpen`,
  `loading`, `error`, `retry`; `selectRow` now receives the row name.
- **Smaller fixes:** `fromLaravelPaginator` also reads `meta.total` (API resource
  collections); query parameters are inserted before a `#fragment` in the URL;
  the 1000 page-size limit is one exported constant (`MAX_PAGE_SIZE`) used by
  state, pagination and the HTTP client; state code moved to its own module, so
  the core has no circular imports.

### Changed behaviour

- A `date` column now ignores the time of day (use `datetime` for instants).
- A throwing listener is reported through `onListenerError` instead of being
  rethrown from the action (previously an error or `AggregateError`).
- Global search with several words now requires each word, in any column,
  instead of the whole text as one substring (`ali ankara`).
- Node 20 (end of life April 2026) is no longer supported; `engines >=22`.
- MIT license.
- Text sort order is natural by default (see above).
- `contains` and search no longer distinguish case, accents or Turkish dotted
  and dotless i; untyped booleans and dates are now searchable.
- A blank (spaces only) `contains` value constrains nothing.
- The DOM renderer shows booleans as `labels.yes` / `labels.no` and reads typed
  columns (decimals keep their scale, ISO dates are shown as dates).

### Added

- **acunsoft/datatable-laravel (query layer):** a Composer package for Laravel
  and Livewire. `Column` (allowlist with types and folded search columns),
  `TableQuery` (validated wire format), `QueryApplier` (all operators, smart
  search, whole-day dates, multi-column sorting with a key tie-breaker, bound
  values, `LIKE … ESCAPE '!'`), `TableResponse` (JSON `{ rows, totalRows }`,
  422 on invalid input, only declared fields) and `Text::fold` /
  `Text::searchTerms`, identical to the browser. 43 PHPUnit tests; CI job on
  PHP 8.2 and 8.5.
- **DataTables-style smart search:** global search splits the text into words
  (quoted phrases stay together); every word must match in some filterable
  column. `splitSearchTerms` exposes the splitting for servers.
- **New filter operators:** `startsWith`, `between` (`[min, max]`, inclusive),
  `in` (list, at most 1000), `empty`, `notEmpty`; supported by `filterRows`,
  `createTableQuery`, `createDataTable` and the HTTP serializer
  (`filters[i][value][n]` for lists, no value for `empty`/`notEmpty`). The
  Laravel and Node backend examples handle them.
- Column `type`, `normalizeValue`, `isDecimal`, `foldText`, `COLUMN_TYPES`,
  `FILTER_OPERATORS`, `createEmitter`; `LocalRowModelOptions.numeric`;
  `FilterOptions.booleanLabels`; `formatLocalDate` in `@acunsoft/datatable-http`.

## Earlier work (before this changelog)

M0 foundation, M1 headless core (state, columns, rows, sorting, filtering,
pagination, selection, `createDataTable`), M2 remote contract, HTTP data source,
query runner and server mode, M3 DOM renderer with Playwright tests. See the git
history for details.
