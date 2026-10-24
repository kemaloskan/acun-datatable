# MySQL, 5 million rows

Measured 2026-10-25 on Apple M2, 16 GB, MySQL 8.0.33 (DBngin build) with default settings (InnoDB buffer pool 128 MB), through `mysql2` from Node 22 (`node bench/sql-bench.mjs --rows 5000000`).

p50 / p95 of 7 runs. "Count" is the exact `COUNT(*)` of the same filters; "Count up to 10,001" is the limited count of the Laravel adapter (`countLimit()`).
| Request | Page | Count | Count up to 10,001 | Plan |
|---|---|---|---|---|
| first page (newest first) | 0.4 ms / 2.6 ms | 508.3 ms / 596.5 ms | 1.2 ms / 4.6 ms | index adt_perf_ordered_at_id |
| page 2 | 0.3 ms / 0.6 ms | – | – | index adt_perf_ordered_at_id |
| page 100,000 by OFFSET | 11.49 s / 24.25 s | – | – | ALL |
| deep page by cursor | 0.4 ms / 6.9 ms | – | – | range adt_perf_ordered_at_id |
| filter status, sort by total | 0.5 ms / 1.0 ms | 132.0 ms / 141.7 ms | 1.6 ms / 1.9 ms | ref adt_perf_status_total_id |
| one month, newest first | 0.4 ms / 4.7 ms | 9.3 ms / 9.8 ms | 1.8 ms / 1.9 ms | range adt_perf_ordered_at_id |
| search "ayse" (folded column) | 2.9 ms / 3.0 ms | 1.82 s / 1.84 s | 67.8 ms / 68.1 ms | index adt_perf_ordered_at_id |
| search a rare word (3 columns, 1 indexed) | 2.11 s / 2.12 s | 1.72 s / 1.72 s | 1.72 s / 1.72 s | index PRIMARY |
| two filters no index serves, many matches | 0.5 ms / 2.7 ms | 6.25 s / 6.26 s | 110.8 ms / 112.4 ms | index PRIMARY |
| a rare word in the indexed column | 1.63 s / 1.63 s | 657.3 ms / 660.2 ms | 657.5 ms / 658.8 ms | index PRIMARY |

- Pages through an index took about a millisecond, as on PostgreSQL; the
  deep `OFFSET` page took 11.5 s (the plan reads the whole table), the same
  depth by cursor 0.4 ms.
- An exact `COUNT(*)` of the whole table took 508 ms (PostgreSQL: 65 ms);
  counting the two filters no index serves took 6.3 s, the limited count of
  the same filters 111 ms.
- MySQL has no trigram index: `LIKE '%word%'` scans, so even the word in the
  indexed column took 1.6 s. Use a `FULLTEXT` index or a search engine
  (`searchEngine()`) for text search on tables of this size.
- These numbers come from the default 128 MB buffer pool, much smaller than
  the table; a server with a larger pool will differ — measure it.
