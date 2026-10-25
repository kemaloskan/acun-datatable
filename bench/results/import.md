# Import measurements (2026-10-25)

Apple M2, 16 GB, macOS; Node 22.23.3; PHP 8.5.12; SQLite (in memory). One
run each (the JSON files next to this one). A file of e-mails or customer
names, Turkish names, decimal totals (every 1,000th row invalid, so 0.1 % of
the rows are refused) and dates; upsert by the key, chunks of 1,000.

| Back end | File | Rows | Upload (read, preview) | Import | Rows / s | Peak memory |
|---|---|---|---|---|---|---|
| Node `createImportHandler`, your `save()` with a prepared upsert | CSV 5.9 MB | 100,000 | 0.21 s | 0.70 s | 142,051 | 371 MB (process) |
| Node | CSV 60.6 MB | 1,000,000 | 3.06 s | 9.29 s | 107,655 | 1,266 MB (process) |
| Node | xlsx 25.5 MB (stored, not compressed) | 100,000 | 0.79 s | 1.01 s | 99,250 | 511 MB (process) |
| Laravel `TableImport`, the default `save()` (Eloquent, indexed key) | CSV | 100,000 | 0.15 s | 9.18 s | 10,889 | 116 MB (PHP) |
| Laravel | CSV | 1,000,000 | 1.00 s | 90.38 s | 11,064 | 746 MB (PHP) |

What the numbers say:

- **Saving is the back end's choice and dominates in Laravel:** the default
  `save()` keeps Eloquent's events, casts and timestamps by saving one model
  at a time; the existing records of a chunk are found with one query per
  1,000 keys (before this change: one query per row, 7,033 rows / s at
  100,000). A `save()` of your own with a bulk `upsert()` is faster.
- **Memory follows the file:** both back ends read the whole file before
  importing it in chunks, so memory grows with the rows (Node: the parsed
  rows as JavaScript strings; PHP: the rows as arrays). For files of a
  million rows give the worker room, or keep `maxRows()` / `limits.maxRows`
  lower. A streaming reader would keep memory flat; it is not built yet.
- These are SQLite numbers on one machine; PostgreSQL, MySQL and MariaDB
  write at their own speed. Measure with your own `save()` and database:
  `node bench/import-bench.mjs` and the Laravel `ImportBenchTest`.
