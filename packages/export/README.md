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

### Problem messages in your language

Every problem has a stable `code` (`invalid`, `required`, `missing-column`,
`duplicate-column`), the column `type` for `invalid`, and a ready `message` in
English, Turkish, German, French or Spanish:

```ts
importRows(sheet, columns, { locale: 'tr', messages: { required: 'Bu alan zorunlu' } });
// → { line: 3, column: 'total', code: 'invalid', type: 'decimal', message: 'geçerli bir ondalık sayı değeri değil' }
```

Use the `code` to write your own texts; `resolveImportMessages(locale)` gives
the built-in set.

### Limits and safety

Imports are meant for files users upload, so everything is bounded: at most
10,000 data rows and 1,000 columns (`maxRows`, `maxColumns`), 50 MB per
inflated archive entry (`maxEntryBytes`, counted while inflating, so a file
that lies about its size cannot exhaust memory), 2,000 archive entries;
ZIP64 and encrypted files are refused. XML is scanned without a DTD or entity
expansion. Errors are `ImportError`s with a readable message.

### Large files on a server: `@acunsoft/datatable-export/stream`

`parseCsv` and `readXlsx` return the whole sheet, which suits the browser. On a
server, `streamCsv` and `streamXlsx` read the same rows with the same limits
but give the headers at once and the rows in chunks, decoding, inflating and
scanning the file piece by piece, so memory follows the chunk instead of the
file (the file's bytes and, for xlsx, its shared strings are still held):

```ts
import { importRows } from '@acunsoft/datatable-export';
import { streamCsv, streamXlsx } from '@acunsoft/datatable-export/stream';

const sheet = await streamCsv(bytes, { maxRows: 1_000_000, chunkSize: 1_000, encoding: 'utf-8' });
let before = 0;
for await (const rows of sheet.chunks) {
  const result = importRows({ headers: sheet.headers, rows }, columns); // lines start at 2 in every chunk
  // add `before` to each line, then save result.rows
  before += rows.length;
}
```

`encoding` is any `TextDecoder` label (a UTF-8 byte order mark is removed).
The rows can be read once; stopping early (`break`) releases the file.
`@acunsoft/datatable-server/import` reads uploads this way.

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
