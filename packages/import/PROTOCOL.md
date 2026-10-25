# The import protocol — `acun-import/1`

How the ACUN DataTable import UI talks to a back end about one Excel or CSV
import. It is plain JSON over HTTP, so any back end can speak it: Laravel,
Node, .NET, Go, Python… The Laravel and Node helpers of this project
implement it, but they are a convenience, not a requirement.

**Who does what.** The UI picks the file, sends it, shows the mapping screen
and the preview it is given, shows progress and the result, and refreshes the
table. The back end does everything else: it decides and enforces the file
size, row and format limits; reads and validates the file; inserts, updates or
upserts; checks duplicates; decides whether to work at once or in the
background (queue, worker, chunks — any or none); keeps and deletes temporary
files; authorizes every request and keeps tenants apart; writes error reports.
Nothing in this protocol needs Redis, a queue or any other service.

The key words MUST, SHOULD and MAY are used as in RFC 2119.

## Overview

| # | Request | Purpose |
|---|---|---|
| 0 | `GET {url}` | Capabilities: what the UI may show beforehand (optional) |
| 1 | `POST {url}` | Upload a file; the back end answers with the import |
| 2 | `POST {url}/{id}/start` | Send the column mapping and start the import |
| 3 | `GET {url}/{id}` | The import's current state (progress, result) |
| 4 | `DELETE {url}/{id}` | Cancel a running import, or discard one not started |

`{url}` is the address the developer gives the UI (for example
`/api/orders/import`). `{id}` is the import's identifier from step 1.
A back end MAY offer only some steps: without 0 the UI shows no limits;
without 4 it shows no cancel button (`cancellable: false`).

Every request carries what the developer configured in the UI (headers such as
a CSRF token or `Authorization`, cookies via `credentials`). Answers are JSON
(`Content-Type: application/json`), UTF-8.

## Flow

```
UI                                  Back end
│ GET {url} (optional) ───────────► limits and formats, as hints
│ POST {url} file ────────────────► check limits, store, read the header and first rows
│ ◄──────────────── import: status "mapping", headers, columns, suggested mapping, preview
│ (the user checks the mapping)
│ POST {url}/{id}/start mapping ──► validate the mapping again, then decide:
│ ◄──────────────── at once:          status "done" (or "failed") with the result
│ ◄──────────────── in the background: status "queued" / "running"
│ GET {url}/{id} … until final ───► progress, then "done" / "failed" / "cancelled"
│ (refresh the table)
```

A back end MAY skip the mapping step: its upload answer can already be
`queued`, `running`, `done` or `failed` (for example when it maps the columns
itself). The UI then goes straight to progress or the result.

## 0. Capabilities — `GET {url}`

Optional. Every field except `protocol` is optional.

```json
{
  "protocol": "acun-import/1",
  "accept": [".xlsx", ".csv"],
  "maxBytes": 10485760,
  "maxRows": 100000,
  "modes": ["insert", "upsert"],
  "templateUrl": "/api/orders/import/template.xlsx"
}
```

| Field | Type | Meaning |
|---|---|---|
| `protocol` | `"acun-import/1"` | Required. |
| `accept` | string[] | File extensions (`.xlsx`) or media types the back end takes. |
| `maxBytes` | integer ≥ 1 | Largest file it takes. |
| `maxRows` | integer ≥ 1 | Most data rows it takes. |
| `modes` | `("insert"\|"update"\|"upsert")[]` | Modes it offers. |
| `templateUrl` | URL | An empty file with the right headers, to download. |

These are **hints**. The UI shows them and warns before uploading a file that
is too large or of another type, but the back end MUST check its own limits
on every upload whatever the UI did. A `404` or `405` answer means "no
capabilities": the UI shows nothing and uploads anyway.

## 1. Upload — `POST {url}`

`multipart/form-data` with the file in the field `file` (the developer MAY
add fields of their own). Header `Idempotency-Key`: an opaque string (1–200
characters) the UI makes once per chosen file.

The back end MUST check its limits (size, type, rows, archive size for xlsx)
before or while reading, and MUST answer a refused file with a problem (see
Problems): `413` when it is too large, `415` for a type it does not take,
`422` for anything else in the file (no header row, too many rows…).

The same `Idempotency-Key` from the same user within the back end's window
MUST give the same import (status `200`), not a second one, so a retried
upload never imports twice. A new import answers `201` (or `200`).

The answer is an **import** (below), usually with status `mapping`:

```json
{
  "protocol": "acun-import/1",
  "id": "imp_8f2c41",
  "status": "mapping",
  "file": { "name": "orders.xlsx", "rows": 18250 },
  "headers": ["E-posta", "Ad", "Tutar", ""],
  "columns": [
    { "id": "email", "title": "E-mail", "type": "text", "required": true },
    { "id": "name", "title": "Name" },
    { "id": "total", "title": "Total", "type": "decimal" }
  ],
  "mapping": ["email", "name", "total", null],
  "preview": [
    { "line": 2, "cells": ["ayse@example.com", "Ayşe", "1.250,50", null] },
    { "line": 3, "cells": ["ali@example.com", "Ali", "90", null] }
  ],
  "modes": ["insert", "upsert"],
  "mode": "upsert",
  "expiresAt": "2026-10-26T10:00:00Z"
}
```

## 2. Start — `POST {url}/{id}/start`

```json
{ "mapping": ["email", "name", "total", null], "mode": "upsert" }
```

`mapping` has one entry per file column, **by position** (headers may repeat
or be empty): a column ID, or `null` to leave that file column out. `mode` is
one of the import's `modes` (MAY be left out when there is only one).

The back end MUST validate the mapping again, never trusting the UI, and MUST
answer `422` with `errors` when: its length differs from `headers`, it names a
column the back end does not know, it names a column twice, a `required`
column is missing, or `mode` is not offered. Starting an import that is not in
status `mapping` MUST answer `409`.

It then decides how to work: **at once** (answer the import with status
`done` or `failed` and its result) or **in the background** (answer status
`queued` or `running`, and do the work in a queue, a worker or any way it
likes). The UI follows whatever it is told.

## 3. State — `GET {url}/{id}`

Answers the import as it is now. The UI asks again while the status is
`queued` or `running`, after `retryAfter` milliseconds when the answer gives
one (clamped to 250 ms – 60 s), else after 1 s, slowing down to 5 s after a
minute. An unknown, expired or someone else's `{id}` MUST answer `404`.

```json
{
  "protocol": "acun-import/1",
  "id": "imp_8f2c41",
  "status": "running",
  "processed": 9000,
  "total": 18250,
  "inserted": 8700,
  "updated": 250,
  "skipped": 0,
  "failed": 50,
  "errors": [
    { "line": 14, "column": "email", "value": "x@", "code": "invalid", "message": "Not a valid e-mail address." }
  ],
  "errorsTruncated": true,
  "errorReport": null,
  "cancellable": true,
  "retryAfter": 1000
}
```

## 4. Cancel — `DELETE {url}/{id}`

Cancels a `queued` or `running` import, or discards one still in `mapping`
(and its stored file). Answers the import with status `cancelled`, or `409`
with a problem when the back end will not stop it now (the UI keeps showing
its progress). What has already been saved stays saved unless the back end
undoes it; the result's counts say what happened.

## The import object

| Field | Type | When | Meaning |
|---|---|---|---|
| `protocol` | `"acun-import/1"` | upload answer: required; else optional | |
| `id` | string | always | Opaque, 1–200 of `A–Z a–z 0–9 . _ ~ -`. |
| `status` | see below | always | |
| `file` | `{ name?, rows? }` | optional | The file as the back end read it; `rows` = data rows. |
| `headers` | string[] | `mapping` | The file's header row, in order (empty headers are `""`). |
| `columns` | `{ id, title?, type?, required? }[]` | `mapping` | What the file can be mapped to. `type` is a column type (`text`, `number`, `decimal`, `date`, `datetime`, `boolean`) or any string the back end uses. |
| `mapping` | `(string \| null)[]` | `mapping` | The back end's suggestion, one per header. |
| `preview` | `{ line, cells: (string \| null)[] }[]` | optional | First data rows as text, one cell per header; `line` is the line in the file (the header is line 1). |
| `modes` | `("insert"\|"update"\|"upsert")[]` | optional | Offered modes. |
| `mode` | one of `modes` | optional | The suggested (or chosen) mode. |
| `processed` | integer ≥ 0 | optional | Data rows handled so far. |
| `total` | integer ≥ 0 or `null` | optional | Data rows in all; `null` when not known yet. |
| `inserted`, `updated`, `skipped`, `failed` | integer ≥ 0 | optional (0) | Counts so far. |
| `errors` | `{ line, column?, value?, code?, message }[]` | optional | Problems with single rows (the back end chooses how many; the first ones are best). |
| `errorsTruncated` | boolean | optional | More problems exist than `errors` lists. |
| `errorReport` | URL or `null` | optional | A CSV of every rejected row and its reason. |
| `message` | string | optional | A text for the whole import, e.g. why it `failed`. |
| `cancellable` | boolean | optional (true) | Whether `DELETE` may stop it now. |
| `retryAfter` | integer (ms) | optional | When to ask again. |
| `expiresAt` | ISO 8601 date-time | optional | When the stored file is deleted. |

Statuses: `mapping` (waiting for step 2), `queued`, `running`, and the final
`done`, `failed`, `cancelled`, `expired`. `done` means the import finished,
with or without rejected rows (see `failed` and `errors`); `failed` means it
stopped as a whole (see `message`).

Back ends MAY add fields; the UI ignores what it does not know. URLs
(`errorReport`, `templateUrl`) are absolute `http(s)` URLs or paths relative
to `{url}`; the UI refuses any other scheme. Every text is shown as text, never
as HTML.

## Problems

A refused request answers a 4xx or 5xx status with:

```json
{ "message": "The file is larger than 10 MB.", "errors": { "file": "The file is larger than 10 MB." } }
```

`message` is required (a text the UI shows as is); `errors` is optional, by
field (`file`, `mapping`, `mode`, …), each a text or a list of texts — the
same shape as the query protocol's errors and as Laravel's validation errors.

| Status | When |
|---|---|
| `401`, `403` | Not signed in, or not allowed to import here. |
| `404` | Unknown, expired, or another user's or tenant's import. |
| `409` | Start on an import not in `mapping`; a cancel the back end refuses now. |
| `413` | The file is larger than the back end takes. |
| `415` | A file type the back end does not take. |
| `422` | Anything else wrong with the file or the mapping. |
| `429` | Too many requests (`Retry-After` is honoured). |
| `5xx` | The back end failed; the UI offers to try again. |

## What a back end MUST do

1. Enforce its own limits on every upload (size, type, rows, xlsx archive
   size) before trusting the file; the capabilities are only hints.
2. Read xlsx as data: never evaluate formulas, macros or external links.
3. Authorize every request, and bind an import to the user (and tenant) that
   uploaded it; anyone else gets `404`.
4. Validate the mapping and the mode again on start (see step 2).
5. Honour `Idempotency-Key` on upload, and refuse a second start (`409`).
6. Keep uploads private and delete them when the import ends or expires.
7. Guard the cells of a CSV error report against formulas (a leading `=`, `+`,
   `-`, `@`, tab or carriage return is prefixed with `'`).

## Versioning

`acun-import/1` grows only by optional fields and new problem texts. A change
that would break a UI or a back end gets a new name (`acun-import/2`); the UI
refuses an upload answer with another `protocol`.

## Testing a back end

`@acunsoft/datatable-import/testing` runs this protocol against any back end
(`runImportConformance`) and contains a small in-memory reference back end
(`createMemoryImportBackend`) for trying the UI without one.
