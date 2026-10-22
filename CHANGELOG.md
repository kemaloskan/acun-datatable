# Changelog

All notable changes to this repository. Packages are not published yet; versions
will start at `0.1.0` (see SPEC "Planned release approach").

## Unreleased

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

### Changed behaviour

- Text sort order is natural by default (see above).
- `contains` and search no longer distinguish case, accents or Turkish dotted
  and dotless i; untyped booleans and dates are now searchable.
- A blank (spaces only) `contains` value constrains nothing.
- The DOM renderer shows booleans as `labels.yes` / `labels.no` and reads typed
  columns (decimals keep their scale, ISO dates are shown as dates).

### Added

- Column `type`, `normalizeValue`, `isDecimal`, `foldText`, `COLUMN_TYPES`,
  `FILTER_OPERATORS`, `createEmitter`; `LocalRowModelOptions.numeric`;
  `FilterOptions.booleanLabels`; `formatLocalDate` in `@acunsoft/datatable-http`.

## Earlier work (before this changelog)

M0 foundation, M1 headless core (state, columns, rows, sorting, filtering,
pagination, selection, `createDataTable`), M2 remote contract, HTTP data source,
query runner and server mode, M3 DOM renderer with Playwright tests. See the git
history for details.
