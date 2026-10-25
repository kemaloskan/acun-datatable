# @acunsoft/datatable-import

> **Not released yet.** The protocol, its test kit and the import dialog are
> done; the Laravel and the Node helpers follow (see `IMPORT-PLAN.md` in the
> repository). This package is private until then.

Excel and CSV import for ACUN DataTable, as an optional module. The DataTable
manages the interface; **your back end** reads the file and owns the limits,
the queues, the storage and the processing. Nothing here needs Redis, a queue
or any other service, and nothing is added to the other ACUN DataTable
packages.

- [`PROTOCOL.md`](PROTOCOL.md) — `acun-import/1`: the JSON-over-HTTP contract
  between the import UI and any back end.
- `createImportClient({ url, headers?, credentials?, fetch? })` — capabilities,
  upload (with an `Idempotency-Key`), start, state, cancel and `wait` (polls as
  the back end asks), every answer checked before it is used.
- `readImportState`, `readImportCapabilities`, `readImportProblem` — the
  checks themselves; `checkImportStart` — the mapping check a back end must run
  on start; `safeImportUrl` — only `http(s)` URLs from a back end.

## The import dialog

```js
import { importButton, openImport } from '@acunsoft/datatable-import';
import '@acunsoft/datatable-dom/styles.css';
import '@acunsoft/datatable-import/styles.css';

const dt = new AcunDataTable('#orders', {
  ajax: '/api/orders',
  language: 'tr',
  // An item of the tools menu; the table is refreshed when rows changed.
  buttons: ['excel', importButton({ url: '/api/orders/import', language: 'tr', table: { reload: () => dt.reload() },
    headers: { 'X-CSRF-Token': csrf } })],
});

// Or from a button of your own:
myButton.onclick = () => openImport({ url: '/api/orders/import', language: 'tr', table: dt });
```

Without a bundler: `acun-datatable-import.min.js` (`window.AcunImport`)
next to `acun-datatable.min.js`, and `styles.css` of both packages.

One dialog, four steps: **file** (drop zone and picker; the formats, size,
rows and template the back end announces, if it does), **mapping** (each file
column with the column it becomes, required ones marked, the back end's
suggestion chosen, a sample and the first rows, the mode when there are
several), **progress** (upload, then the back end's progress; cancel when it
allows), **result** (added, updated, skipped, refused; the first problems and
the error report). Every limit is the back end's: the dialog only warns about
a file over its announced size or type, and shows the back end's refusal.
`onDone(state)` gets every final state; a `table` is reloaded when rows
changed — also when the dialog was closed while the back end went on.

Texts in English, Turkish, German, French and Spanish (`language`), each
replaceable (`labels`); dark mode and phones (full screen) through the table's
`styles.css`; keyboard and screen reader friendly (focus moves to each step,
progress is announced, back-end texts are text, never HTML).

Size (gzip, minified): the `<script>` build 10.2 KB with every language,
`styles.css` 1.5 KB. Nothing is added to the other packages.

## Test your back end

```js
import { runImportConformance } from '@acunsoft/datatable-import/testing';

const result = await runImportConformance({
  url: 'http://localhost:8000/api/orders/import',
  headers: { Cookie: session },
  file: new File([csv], 'orders.csv', { type: 'text/csv' }),
});
for (const check of result.checks) console.log(check.ok ? '✓' : '✗', check.name, check.detail ?? '');
```

It uploads, retries with the same key, sends wrong mappings, follows the
import to its end, starts it again, asks for an unknown id, checks the error
report and the advertised size limit, and cancels. `createMemoryImportBackend`
is a small in-memory back end that passes it — for tests and for trying the UI,
not for production.

## License

MIT
