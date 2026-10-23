# @acunsoft/datatable-export

## 0.2.0

### Minor Changes

- 54866ed: New package `@acunsoft/datatable-export`: `tableToSheet`, `toCsv` (formula-injection guard), `toXlsx` (real Excel workbooks without dependencies), `parseCsv`, `readXlsx` (size-limited, zip-bomb safe) and `importRows` (typed, validated import with line-numbered errors). DOM: `downloadFile`.
- 45ac8e9: Built-in German, French and Spanish texts next to English and Turkish (`labelsDe`, `labelsFr`, `labelsEs`, `resolveLabels(locale)`), with singular/plural forms and locale digit grouping (fixes "1 rows"). Import problems carry a stable `code` and `type`, and `importRows` takes `locale` and `messages`.

### Patch Changes

- Updated dependencies [60e548c]
  - @acunsoft/datatable-core@0.2.0
