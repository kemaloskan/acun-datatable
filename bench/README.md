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

| Rows | Space (PostgreSQL, with indexes) | Where |
|---|---|---|
| 5,000,000 | about 2.5 GB | a laptop |
| 100,000,000 | about 50 GB | a dedicated database server |
| 1,000,000,000 | about 500 GB | a dedicated server; expect hours to generate |

Results depend on the hardware, the server's settings and what else runs;
compare runs on the same machine. Measured results are in `results/`.

## What to expect, and what the numbers say

- A deep page by `OFFSET` gets slower with the depth: the database reads and
  throws away every row before it. This is why the Laravel adapter refuses
  pages past `maxResultWindow()` and why cursor paging exists.
- A page by cursor costs what page 2 costs, at any depth.
- `COUNT(*)` reads every matching row. The Laravel adapter counts up to
  `countLimit()` exactly and gives the count past it a time limit
  (`countTimeout()`); the Node package counts only when you run `count`.
  On the largest tables, page without a total, or count less often.
- A search for a word inside the text (`LIKE '%word%'`) needs a trigram index
  (PostgreSQL `pg_trgm`) or a full-text index; without one it scans the
  table. The search looks in every searchable column, so it is as fast as
  the slowest of them: index each one, or make only indexed columns
  searchable.
