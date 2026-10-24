# MariaDB, 5 million rows

Measured 2026-10-25 on Apple M2, 16 GB, MariaDB 10.11.6 (DBngin build) with default settings (InnoDB buffer pool 128 MB), through `mysql2` from Node 22 (`node bench/sql-bench.mjs --rows 5000000`).

p50 / p95 of 7 runs. "Count" is the exact `COUNT(*)` of the same filters; "Count up to 10,001" is the limited count of the Laravel adapter (`countLimit()`).
| Request | Page | Count | Count up to 10,001 | Plan |
|---|---|---|---|---|
| first page (newest first) | 1.4 ms / 2.9 ms | 515.4 ms / 525.0 ms | 1.8 ms / 1.9 ms | index adt_perf_ordered_at_id |
| page 2 | 0.3 ms / 2.3 ms | – | – | index adt_perf_ordered_at_id |
| page 100,000 by OFFSET | 3.50 s / 5.07 s | – | – | ALL |
| deep page by cursor | 0.3 ms / 2.0 ms | – | – | range adt_perf_ordered_at_id |
| filter status, sort by total | 0.3 ms / 1.0 ms | 151.6 ms / 435.4 ms | 1.8 ms / 1.9 ms | range adt_perf_status_total_id |
| one month, newest first | 0.2 ms / 1.5 ms | 8.6 ms / 12.4 ms | 1.7 ms / 1.8 ms | range adt_perf_ordered_at_id |
| search "ayse" (folded column) | 7.6 ms / 10.7 ms | 2.03 s / 2.04 s | 68.0 ms / 68.5 ms | index adt_perf_ordered_at_id |
| search a rare word (3 columns, 1 indexed) | 2.17 s / 2.17 s | 1.86 s / 1.86 s | 1.85 s / 1.86 s | index PRIMARY |
| two filters no index serves, many matches | 0.7 ms / 1.9 ms | 1.06 s / 1.07 s | 343.0 ms / 344.8 ms | index PRIMARY |
| a rare word in the indexed column | 1.66 s / 1.67 s | 810.7 ms / 842.6 ms | 808.2 ms / 813.0 ms | index PRIMARY |

- Pages through an index took about a millisecond; the deep `OFFSET` page
  took 3.5 s (the plan reads the whole table), the same depth by cursor
  0.3 ms.
- An exact `COUNT(*)` of the whole table took 515 ms.
- As on MySQL, `LIKE '%word%'` scans (no trigram index): 1.7–2.2 s.
- These numbers come from the default 128 MB buffer pool, much smaller than
  the table; a server with a larger pool will differ — measure it.
