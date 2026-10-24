# Benchmarks

No speed is claimed without a measurement. `sql-bench.mjs` measures the SQL
that `@acunsoft/datatable-server` writes — the same shapes the Laravel
adapter uses (bounded keyset, `(column, key)` indexes, a day as a range) — on
a real database of the size you choose.

```bash
npm run build
node bench/sql-bench.mjs --db postgres://postgres@127.0.0.1:5432/adt_bench --rows 5000000
node bench/sql-bench.mjs --db mysql://root:secret@127.0.0.1:3306/adt_bench --rows 5000000   # MySQL or MariaDB
```

- The table `adt_perf` is generated **inside the database**, a million rows
  per statement: Turkish names with their folded copies, cities (every
  11th empty), four statuses, totals and six years of timestamps. It gets the
  indexes the docs recommend: `(ordered_at, id)`, `(total, id)`,
  `(status, total, id)`, `(customer_search)` and, on PostgreSQL with
  `pg_trgm`, a trigram index for search.
- Each request runs `--runs` times (default 7) and is reported as p50 / p95,
  with the scans of its plan: the first page, page 2, the middle page by
  `OFFSET`, a deep page by cursor, a filter with a sort on another column,
  a one-month range, a folded search and a rare word. Pages that need a
  count are timed with their `COUNT(*)`.
- `--timeout` (seconds, default 60) stops a statement that runs too long; it
  is reported as `> 60 s` rather than waited for.
- The table is dropped at the end; `--keep` keeps it (reused when the size is
  the same). `--json FILE` writes the results.
- Use a database of its own: only `adt_perf` is created and dropped.

## Sizes

| Rows | Space (PostgreSQL, with indexes; estimated) | Where |
|---|---|---|
| 5,000,000 | about 2.5 GB | a laptop (generated in 24 s on an Apple M2) |
| 100,000,000 | about 50 GB | a dedicated database server |
| 1,000,000,000 | about 500 GB | a dedicated server; generating it takes hours |

Results depend on the hardware, the server's settings and what else runs;
compare runs on the same machine. Measured results are in `results/`.

## Measured

Only what a run in `results/` shows. So far: **PostgreSQL 17, 5,000,000
rows, Apple M2** ([postgres-5m.md](results/postgres-5m.md)).

- A deep page by `OFFSET` (row 2,500,000) took 2.5 s; the same depth by
  cursor took 0.3 ms, about as long as page 2.
- An exact `COUNT(*)` of the whole table took 65 ms; counting a search that
  matches 250,000 rows took 740 ms.
- The limited count (up to 10,001 matches) took 1–35 ms for most requests,
  but 716 ms for a rare word no index serves: it read the whole table.
- A search over three columns, one with a trigram index, scanned the table
  (718 ms); the same word in the indexed column alone took 0.1 ms.

## Expected, not measured

How the database is expected to behave — check it with a run before relying
on it, above all at 100 million and 1 billion rows, where nothing has been
measured yet:

- `OFFSET` reads and throws away every row before the page, so deep pages
  get slower with the depth; this is why the Laravel adapter refuses pages
  past `maxResultWindow()` and why cursor paging exists.
- A cursor page uses the same index scan at any size, so it should not get
  slower with the depth; its cost still depends on the index and the data.
- `COUNT(*)` reads every matching row, so it grows with the matches. The
  limited count stops after 10,001 matches, but when few rows match and no
  index serves the condition it still reads the table: its cost depends on
  the query, the indexes and the database. The Laravel adapter gives the
  count past the limit a time limit (`countTimeout()`); the Node package
  counts only when you run `count`.
- A search for a word inside the text (`LIKE '%word%'`) needs a trigram index
  (PostgreSQL `pg_trgm`) or a full-text index; without one it scans the
  table. The search looks in every searchable column, so it is as fast as
  the slowest of them: index each one, or make only indexed columns
  searchable.
