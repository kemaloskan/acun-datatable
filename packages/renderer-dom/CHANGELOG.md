# @acunsoft/datatable-dom

## 0.2.1

### Patch Changes

- Published from GitHub Actions through npm trusted publishing, with provenance attestations that link each package to its source commit. No code changes.
- Updated dependencies
  - @acunsoft/datatable-core@0.2.1

## 0.2.0

### Minor Changes

- 60e548c: Row and bulk actions (`rowActions` option of `renderTable`, `renderBulkActions`) and column visibility (core `setColumnVisibility`, `setHiddenColumns`, `getVisibleColumns`, `enableHiding`; DOM `renderColumnToggle`). Hidden columns still sort, filter and search.
- 54866ed: New package `@acunsoft/datatable-export`: `tableToSheet`, `toCsv` (formula-injection guard), `toXlsx` (real Excel workbooks without dependencies), `parseCsv`, `readXlsx` (size-limited, zip-bomb safe) and `importRows` (typed, validated import with line-numbered errors). DOM: `downloadFile`.
- 45ac8e9: Built-in German, French and Spanish texts next to English and Turkish (`labelsDe`, `labelsFr`, `labelsEs`, `resolveLabels(locale)`), with singular/plural forms and locale digit grouping (fixes "1 rows"). Import problems carry a stable `code` and `type`, and `importRows` takes `locale` and `messages`.
- 3508f4c: New package `@acunsoft/datatable-vue`: `useDataTable`, `useTable` and the components `AcunDataTable` (slots for custom cells), `AcunPagination`, `AcunSearch`, `AcunColumnToggle`, `AcunBulkActions`, with the DOM renderer's markup and accessibility. DOM: the shared helpers `createCellText`, `cellValue`, `nextSorting` and `rowName` are exported.

### Patch Changes

- Updated dependencies [60e548c]
  - @acunsoft/datatable-core@0.2.0

## 0.1.0

### Minor Changes

- 7387b2b: First public release: headless core (typed columns, natural and multi-column sorting, Turkish-aware smart search and filter operators, pagination, selection, local and server mode), HTTP data source with latest-request-wins runner, and an accessible DOM renderer with an optional stylesheet.

### Patch Changes

- Updated dependencies [7387b2b]
  - @acunsoft/datatable-core@0.1.0
