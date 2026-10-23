# Changelog

All notable changes to this repository. Each npm package also has its own
`CHANGELOG.md`, written by Changesets.

## Unreleased

## 0.1.0 (2026-10-23)

First release of `@acunsoft/datatable-core`, `@acunsoft/datatable-http` and
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
