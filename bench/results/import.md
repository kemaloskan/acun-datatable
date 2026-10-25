# Import measurements (2026-10-25)

Apple M2, 16 GB, macOS; Node 22.23.3; PHP 8.5.12; SQLite (in memory). A file
of e-mails or customer names, Turkish names, decimal totals (every 1,000th row
invalid, so 0.1 % of the rows are refused) and dates; upsert by the key,
chunks of 1,000.

**Before** is the code that read the whole file before saving it in chunks;
**after** reads it in chunks (`@acunsoft/datatable-export/stream` in Node,
`SheetReader::stream()` in Laravel). Both were measured with the same scripts.
Node: the median of three runs (all runs in the `.json` files next to this
one; `.before.json` for before). Laravel: one run each.

## Node `createImportHandler`, your `save()` with a prepared upsert

| File | Rows | | Upload (read, preview) | Import | Rows / s | Peak memory (process) | Peak JS heap |
|---|---|---|---|---|---|---|---|
| CSV 5.9 MB | 100,000 | before | 0.19 s | 0.54 s | 184,541 | 350 MB | 187 MB |
| | | after | 0.10 s | 0.36 s | 281,850 | 255 MB | 101 MB |
| CSV 60.6 MB | 1,000,000 | before | 2.35 s | 6.66 s | 150,272 | 1,612 MB | 2,123 MB |
| | | after | 0.77 s | 3.69 s | 270,730 | 798 MB | 121 MB |
| xlsx 25.5 MB (stored, not compressed) | 100,000 | before | 0.59 s | 0.90 s | 111,212 | 512 MB | 211 MB |
| | | after | 0.62 s | 0.88 s | 113,059 | 461 MB | 46 MB |

The JavaScript heap no longer grows with the rows (101 MB at 100,000 rows,
121 MB at 1,000,000). What the process holds besides it, in the
1,000,000-row run: the bench's own file (60.6 MB) and SQLite table (101 MB),
and the upload itself: a separate measurement of the web-standard multipart parsing
alone (`new Request(form).formData()`, then `arrayBuffer()`) on a 54 MB file
raised the process from 189 MB to 430 MB. That part follows the file's size
(limited by `limits.maxBytes`), not the rows. macOS compresses memory, so the
process figure can be lower than the heap (before, 1,000,000 rows).

## Laravel `TableImport`, the default `save()` (Eloquent, indexed key)

| File | Rows | | Upload (read, preview) | Import | Rows / s | Peak memory (PHP) | Above the baseline |
|---|---|---|---|---|---|---|---|
| CSV | 100,000 | before | 0.14 s | 8.14 s | 12,282 | 116 MB | 70 MB |
| | | after | 0.13 s | 8.22 s | 12,160 | 55 MB | 8 MB |
| CSV | 1,000,000 | before | 1.04 s | 97.94 s | 10,210 | 746 MB | 634 MB |
| | | after | 0.79 s | 84.94 s | 11,772 | 123 MB | 10 MB |

"Above the baseline" is the peak during upload and import minus the memory
before the upload; the baseline includes the test's own generated file.

What the numbers say:

- **Memory follows the chunk, not the file:** above its baseline PHP used
  8 MB for 100,000 rows and 10 MB for 1,000,000; Node's heap 101 MB and
  121 MB. Both back ends still read the file twice (upload: headers, preview,
  row count; import: the rows), and an xlsx file's shared strings are kept in
  memory because cells point into them.
- **The same rows:** the streaming readers give what the whole-file readers
  gave (checked against them on fixtures, random CSV files read in pieces as
  small as one byte, zip bombs and limits). One deliberate difference:
  Laravel's old xlsx reader matched the whole worksheet with one regular expression, which
  stops at PHP's `pcre.backtrack_limit` (1,000,000 here): a worksheet of
  986,720 bytes of XML (15,000 short rows) came back empty and was refused as
  having no header row (782,720 bytes still read). The streaming reader scans
  pieces of 64 KB and reads it.
- **Saving is the back end's choice and dominates in Laravel:** the default
  `save()` keeps Eloquent's events, casts and timestamps by saving one model
  at a time; the existing records of a chunk are found with one query per
  1,000 keys. A `save()` of your own with a bulk `upsert()` is faster.
- These are SQLite numbers on one machine; PostgreSQL, MySQL and MariaDB
  write at their own speed. Measure with your own `save()` and database:
  `node --expose-gc bench/import-bench.mjs` and the Laravel `ImportBenchTest`.
