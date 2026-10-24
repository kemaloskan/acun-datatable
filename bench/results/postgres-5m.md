# PostgreSQL, 5 million rows

Measured 2026-10-25 on Apple M2, 16 GB, PostgreSQL from DBngin with default settings, through `pg` from Node 22 (`node bench/sql-bench.mjs --rows 5000000`).

p50 / p95 of 7 runs; the count is the `COUNT(*)` of the same filters.

| Request | Page | Count | Plan |
|---|---|---|---|
| first page (newest first) | 0.8 ms / 3.7 ms | 64.5 ms / 65.1 ms | Index Scan adt_perf_ordered_at_id |
| page 2 | 0.3 ms / 0.4 ms | – | Index Scan adt_perf_ordered_at_id |
| page 100,000 by OFFSET | 2.47 s / 3.35 s | – | Index Scan adt_perf_ordered_at_id |
| deep page by cursor | 0.3 ms / 2.0 ms | – | Index Scan adt_perf_ordered_at_id |
| filter status, sort by total | 0.5 ms / 0.9 ms | 118.6 ms / 121.1 ms | Index Scan adt_perf_status_total_id |
| one month, newest first | 0.6 ms / 1.3 ms | 69.2 ms / 71.0 ms | Index Scan adt_perf_ordered_at_id |
| search "ayse" (folded column) | 1.1 ms / 4.3 ms | 730.1 ms / 764.4 ms | Index Scan adt_perf_ordered_at_id |
| search a rare word (3 columns, 1 indexed) | 717.8 ms / 723.9 ms | 719.4 ms / 728.6 ms | Seq Scan |
| a rare word in the indexed column | 0.1 ms / 0.5 ms | 0.1 ms / 0.3 ms | Bitmap Heap Scan, Bitmap Index Scan adt_perf_customer_trgm |

- The deep `OFFSET` page is the only slow page: 2.5 s at row 2,500,000. The
  same depth by cursor takes 0.3 ms.
- An exact `COUNT(*)` of 5 million rows takes about 65 ms here; a search
  that matches 250,000 rows needs 730 ms to count.
- A search is as fast as its slowest column: across three columns where only
  one has a trigram index, PostgreSQL scans the table (720 ms); in the
  indexed column alone it takes 0.1 ms.
