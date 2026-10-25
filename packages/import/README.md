# @acunsoft/datatable-import

> **Not released yet.** The import protocol and its test kit are done; the
> import UI, the Laravel and the Node helpers follow (see `IMPORT-PLAN.md` in
> the repository). This package is private until then.

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
