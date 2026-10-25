# Excel / CSV import — technical plan (proposal)

Status: **proposal, waiting for approval.** Nothing below is built yet. Decided
on 2026-10-25: import comes after npm 0.4.0 / Laravel 0.5.0, as a separate,
optional module in four layers (JavaScript UI, Laravel, Livewire, Node). The
DataTable stays light: no package a user already has gets heavier, and nobody
has to use the import module or its back-end helpers.

## 1. What each side does

| | Import UI (browser) | Back end |
|---|---|---|
| Choose a file, drag and drop | ✓ | |
| Upload request (with upload progress) | ✓ | |
| Read the xlsx / CSV | | ✓ |
| Column mapping screen | ✓ (suggested by the back end) | checks it again |
| Preview (first rows, as the back end read them) | ✓ shows | ✓ |
| Validation (types, required columns) | shows the result | ✓ |
| Duplicates, insert or update (`importKey`) | | ✓ |
| Large files: chunks, queue | | ✓ |
| Progress | ✓ shows | ✓ reports |
| Error report (CSV of the rejected rows) | ✓ offers the download | ✓ writes it |
| Refresh the table afterwards | ✓ (`reload()`) | |
| File safety, authorization, tenant, resubmits | | ✓ |

The browser never parses the workbook: one code path (the back end's) reads,
previews and imports, so the preview shows exactly what will be imported, and
a 50 MB file is not read twice.

## 2. Packages and their size

| Piece | Where | Effect on existing packages |
|---|---|---|
| Import UI | new npm package `@acunsoft/datatable-import` (peer: `@acunsoft/datatable-dom`) | none |
| Import UI for `<script>` users | separate file `acun-datatable-import.min.js` next to `acun-datatable.min.js` | none: the main file is unchanged |
| React / Vue | `<ImportDialog>` / `<AcunImport>` in a subpath of the import package (`/react`, `/vue`) | none |
| Node helpers | `@acunsoft/datatable-server/import` subpath; `@acunsoft/datatable-export` (its existing `readXlsx`, `parseCsv`, `importRows`) as an **optional** peer dependency | none for users who do not import that subpath |
| Laravel endpoint | inside `acunsoft/datatable-laravel` (`Import\…`), reusing `SheetReader` and `RowImporter` | no new Composer dependency; nothing runs unless a route is registered |
| Livewire | the existing `WithTableImport`, extended backwards-compatibly | Blade views only, no JavaScript bundle |

**Measured today** (esbuild, minified, gzip level 9, `@acunsoft/datatable-core`
external):

| Bundle | min | gzip |
|---|---|---|
| `renderFilters` (dropdown / drawer / modal) — the closest existing UI | 20.7 KB | 7.3 KB |
| `renderFilters` + `renderFilterChips` + `renderMenu` | 23.9 KB | 8.2 KB |
| Reading in the browser (`readXlsx` + `parseCsv` + `importRows`) | 14.1 KB | 5.9 KB |
| Writing (`toXlsx` + `toCsv` + `tableToSheet`, already in `@acunsoft/datatable`) | 10.9 KB | 4.3 KB |

**Estimate for the import UI**: 5–7 KB gzip on top of `@acunsoft/datatable-dom`
(dialog, drop zone, mapping table, preview, progress, report, texts in five
languages). This is an estimate from the filter UI's size; the package gets a
budget in `size-budget.json` (start: 8 KB gzip) and the real figure is reported
when it is built. Reading in the browser is **not** planned; if it is ever
wanted, it adds the measured 5.9 KB gzip, loaded only on demand.

## 3. The import protocol (`acun-import/1`)

JSON over HTTP, like the query protocol: any back end can implement it; ours
are helpers, not requirements. All URLs are relative to the `url` the UI is
given (e.g. `/api/orders/import`).

1. **Upload** — `POST {url}` (multipart: `file`; header `Idempotency-Key`).
   The back end checks size and type, stores the file privately, reads the
   header row and the first rows, and answers:

   ```json
   {
     "protocol": "acun-import/1",
     "id": "imp_8f2c…",
     "status": "mapping",
     "columns": [{ "id": "email", "title": "E-mail", "type": "text", "required": true }],
     "headers": ["E-posta", "Ad", "Tutar"],
     "mapping": { "E-posta": "email", "Ad": "name", "Tutar": null },
     "preview": [{ "line": 2, "values": { "E-posta": "ayse@…", "Ad": "Ayşe", "Tutar": "1.250,50" } }],
     "rows": 18250,
     "modes": ["insert", "upsert"],
     "expiresAt": "2026-10-26T10:00:00Z"
   }
   ```

2. **Start** — `POST {url}/{id}/start` with `{ "mapping": { … }, "mode":
   "upsert" }`. The back end validates the mapping again (unknown columns,
   required columns, a column mapped twice → `422` with `errors`), then runs
   small files at once and queues large ones:
   `{ "status": "queued" | "running" | "done", … }`.

3. **Progress** — `GET {url}/{id}`:

   ```json
   {
     "status": "running",
     "processed": 9000, "total": 18250,
     "inserted": 8700, "updated": 250, "skipped": 0, "failed": 50,
     "errors": [{ "line": 14, "column": "email", "value": "x@", "code": "invalid", "message": "…" }],
     "errorReport": null
   }
   ```

   `errors` holds the first 100; once done, `errorReport` is a URL to the CSV
   of every rejected row with its reason. Statuses: `mapping`, `queued`,
   `running`, `done`, `failed`, `cancelled`, `expired`.

4. **Error report** — `GET {url}/{id}/errors.csv` (formula-guarded cells).
5. **Cancel / discard** — `DELETE {url}/{id}`.

Errors use the query protocol's shape (`422 { message, errors: { field: message } }`).
A back end of your own can implement only 1–3 and answer `start` with
`status: "done"` and the report.

## 4. Import UI (`@acunsoft/datatable-import`)

```js
import { importButton } from '@acunsoft/datatable-import';

new AcunDataTable('#orders', {
  serverSide: true, ajax: '/api/orders',
  buttons: ['excel', importButton({ url: '/api/orders/import', headers: { 'X-CSRF-Token': token } })],
});
```

- `importButton(options)` returns a tools-menu item (works with `buttons`,
  `tools` and `renderMenu`); `openImport(options)` opens the dialog from your
  own button; `onDone(report)` defaults to `table.reload()`.
- Steps in one `<dialog>`: **File** (drop zone, picker, accepted types and size
  shown, a template link if `templateUrl` is given) → **Mapping** (each file
  column with a select of the table's columns; required ones marked; the
  back end's suggestion preselected; preview of the first rows) → **Import**
  (upload progress, then processing progress by polling `GET {url}/{id}`) →
  **Result** (inserted / updated / skipped / failed, the first errors, a link
  to the error CSV, "Close" refreshes the table).
- `upload: async (file) => …` and `start`, `status` functions can replace the
  URLs entirely, for a back end that speaks something else.
- Accessible (focus moves per step, live region for progress, keyboard drop
  zone), five languages, dark mode, phones (full-screen dialog).
- React `<ImportDialog>`, Vue `<AcunImport>`: thin wrappers.

## 5. Laravel

```php
// routes/api.php
Route::acunImport('orders/import', OrdersImport::class)->middleware(['auth', 'throttle:10,1']);

final class OrdersImport extends TableImport
{
    protected function columns(): array { /* Column::make(...)->required() … */ }
    protected function importKey(): ?string { return 'email'; }          // insert or update by e-mail
    protected function query(): Builder { return Order::query()->whereBelongsTo(auth()->user()->team); }
    protected function saveChunk(Collection $rows, ImportContext $context): void { /* upsert … */ }
    public function authorize(Request $request): bool { return $request->user()->can('import', Order::class); }
}
```

- Upload stored on a private disk (`importDisk()`), deleted after
  `importTtl()` (default 24 h) or once done.
- `SheetReader` limits (file size, rows, columns, archive entries, inflated
  size) stay; MIME and the
  file's own signature are both checked.
- Rows are validated by `RowImporter` (types, required), then `saveChunk` gets
  chunks of 1,000 (`importChunk()`), each in a transaction; files above
  `importQueueAbove()` rows (default 2,000) run as a queued job on the existing
  task infrastructure (owner and guard checks; progress counts are new),
  smaller ones at once.
- Default save without `saveChunk`: `upsert()` on `importKey()` within
  `query()` (the tenant scope), or `insert()` without a key.
- The import id belongs to the user, guard and tenant that started it; another
  user gets `404`. `Idempotency-Key` makes a resubmit return the same import.
- Livewire: `WithTableImport` keeps working as today; new opt-in
  `importMapping(): bool` adds the mapping step, drag and drop and progress to
  the same panel, reusing `TableImport` for large files.

## 6. Node (`@acunsoft/datatable-server/import`)

```js
import { createImportHandler } from '@acunsoft/datatable-server/import';

const orders = createImportHandler({
  columns,                                  // the same defineColumns() list
  importKey: 'email',
  store: diskStore('/var/app/imports'),      // or your own (S3, Redis…)
  authorize: (req) => req.user?.can('import'),
  scope: (req) => ({ tenantId: req.user.tenantId }),
  save: async (rows, { mode, scope }) => {   // your database code
    return { inserted, updated };
  },
});
app.all('/api/orders/import/*', (req, res) => orders.handle(req, res)); // Express, Fastify, Hono, Request/Response
```

- Reading with `@acunsoft/datatable-export` (`readXlsx`, `parseCsv`,
  `importRows`), the same validation as the browser package and Laravel.
- Chunks run one after another in the process by default; `schedule(job)`
  hands them to your queue (BullMQ, a worker…). Progress lives in `store`.
- No database driver and no framework dependency.

## 7. Security

- Size, row and zip limits before reading; signature + extension check; no
  macros or external links are ever evaluated (xlsx is read as data).
- Every request authorized; an import id is bound to its user and tenant.
- Mapping, required columns and types are checked on the back end, never
  trusted from the browser.
- Idempotency key per upload; `start` twice on one id is refused.
- Error CSV cells guarded against formulas (`=`, `+`, `-`, `@`).
- Temporary files private and deleted on expiry; rate limiting documented.

## 8. Tests

- Unit: protocol shapes, mapping validation, chunking, idempotency, tenant
  isolation, error CSV (PHPUnit, Vitest).
- End to end (Chromium, Firefox, WebKit): the UI against the real Node handler
  and against a Laravel app; keyboard-only run; axe checks on every step.
- Large files: generated 100,000 and 1,000,000-row xlsx/CSV on PostgreSQL,
  MySQL and MariaDB; time and memory are measured and published, not promised.
- Security: zip bomb, wrong type with a right extension, formula cells, a
  replayed upload, another user's and another tenant's import id.

## 9. Order of work

1. Protocol document + JSON schema + conformance tests (shared by every layer).
2. `@acunsoft/datatable-import` UI (+ React, Vue, script build).
3. Laravel `TableImport` + route macro; Livewire mapping/progress.
4. Node `createImportHandler`.
5. Integration, security and large-file tests; docs site guide and demo.

Each step ships with its tests and docs; nothing in the existing packages
changes behaviour.

## 10. Decisions needed

1. **Package names**: `@acunsoft/datatable-import` (UI) and
   `@acunsoft/datatable-server/import` (Node subpath) — or a separate
   `@acunsoft/datatable-import-server`?
2. **Browser-side reading**: not planned (the back end previews). Keep it out?
3. **Default mode**: `insert` without `importKey()`, `upsert` with it; offer
   `update only` too?
4. **Defaults**: 10 MB, 100,000 rows per file, queue above 2,000 rows, keep
   uploads 24 h — acceptable?
