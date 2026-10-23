# @acunsoft/datatable-export

CSV and Excel (`.xlsx`) export and import for
[`@acunsoft/datatable-core`](https://www.npmjs.com/package/@acunsoft/datatable-core).
No dependencies, no DOM: it runs in browsers, workers and Node.

```bash
npm install @acunsoft/datatable-core @acunsoft/datatable-export
```

## Export

```ts
import { tableToSheet, toCsv, toXlsx } from '@acunsoft/datatable-export';
import { downloadFile } from '@acunsoft/datatable-dom'; // or any way to save bytes

const sheet = tableToSheet(table);                 // what the user sees, every page
downloadFile(toXlsx(sheet, { sheetName: 'Siparişler' }), 'siparisler.xlsx');
downloadFile(toCsv(sheet, { delimiter: ';' }), 'siparisler.csv');
```

- **`tableToSheet(table, options?)`**: the headers and rows of the table.
  `rows: 'all'` (default: every row matching the current filters and search, in
  the current order), `'page'` or `'selected'`; `columns: 'visible'` (default)
  or `'all'`; `value: { columnId: (value, row) => cell }` to change a column.
  Typed columns give real numbers, exact decimals, dates and booleans, not
  display text. In server mode only the loaded page is in the browser: export
  everything on the server (see `acunsoft/datatable-laravel`).
- **`toXlsx(sheet, { sheetName })`**: a real Excel workbook (Office Open XML):
  numbers and decimals keep their scale (`#,##0.00`), dates and date-times are
  spreadsheet dates, booleans are booleans; the header row is bold and frozen;
  column widths follow the content. **Text is always text, never a formula**,
  so `=HYPERLINK(...)` in your data cannot run. Tested by opening the files in
  Microsoft Excel and openpyxl.
- **`toCsv(sheet, options)`**: RFC 4180 with a UTF-8 byte order mark (so Excel
  shows ş, ğ, İ), `.` decimals and local `YYYY-MM-DD` / `YYYY-MM-DD HH:mm:ss`
  dates. **Formula injection guard on by default:** text starting with `=`,
  `+`, `-`, `@`, tab or carriage return is prefixed with `'`. Turkish Excel
  opens `delimiter: ';'` files directly; or prefer `.xlsx`.

## Import

```ts
import { importRows, parseCsv, readXlsx } from '@acunsoft/datatable-export';

const file = input.files[0];
const sheet = file.name.endsWith('.xlsx')
  ? await readXlsx(await file.arrayBuffer())
  : parseCsv(await file.text());

const result = importRows(sheet, columns, {
  required: ['customer', 'total'],
  headers: { customer: ['Müşteri', 'Customer'] }, // extra header names
  decimalSeparator: ',',                           // 1.234,50
  dateOrder: 'dmy',                                // 23.10.2026 (default)
});
result.rows;    // [{ line: 2, values: { customer: 'Ayşe', total: '1234.50', … } }]
result.errors;  // [{ line: 4, column: 'total', value: '1,5', message: 'not a valid decimal value' }]
```

- **`parseCsv(text)`** detects `,`, `;` or tab, handles quotes, line breaks in
  fields, every line ending and a byte order mark. **`readXlsx(bytes)`** reads
  one worksheet (first, or `{ sheet: 'Name' | index }`): shared and inline
  strings, rich text, number and date formats (1900 and 1904 date systems),
  cached formula results (formulas are never evaluated), error cells as empty.
- **`importRows(sheet, columns, options)`** matches headers to columns by
  header text or ID, ignoring case, accents and Turkish ı/İ, and converts each
  value to the column's type: numbers, exact decimal text, dates (local
  midnight for `date`), booleans (`true/false/1/0/evet/hayır/yes/no`). Values
  that do not fit are **reported with their line, never guessed**: `1,5` with
  `decimalSeparator: '.'` is an error, not 15; `31.02.2026` is an error.
  Only valid rows are returned; nothing is saved: validate further and store
  them yourself.

### Limits and safety

Imports are meant for files users upload, so everything is bounded: at most
10,000 data rows and 1,000 columns (`maxRows`, `maxColumns`), 50 MB per
inflated archive entry (`maxEntryBytes`, counted while inflating, so a file
that lies about its size cannot exhaust memory), 2,000 archive entries;
ZIP64 and encrypted files are refused. XML is scanned without a DTD or entity
expansion. Errors are `ImportError`s with a readable message.

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
