# PostgreSQL, 5 million rows

Measured 2026-10-25 on Apple M2, 16 GB, PostgreSQL 17 from DBngin with default settings, through `pg` from Node 22 (`node bench/sql-bench.mjs --rows 5000000`).

p50 / p95 of 7 runs. "Count" is the exact `COUNT(*)` of the same filters; "Count up to 10,001" is the limited count of the Laravel adapter (`countLimit()`).
| Request | Page | Count | Count up to 10,001 | Plan |
|---|---|---|---|---|
| first page (newest first) | 0.4 ms / 6.4 ms | 66.0 ms / 74.0 ms | 0.8 ms / 2.2 ms | Index Scan adt_perf_ordered_at_id |
| page 2 | 0.3 ms / 0.4 ms | – | – | Index Scan adt_perf_ordered_at_id |
| page 100,000 by OFFSET | 2.45 s / 3.14 s | – | – | Index Scan adt_perf_ordered_at_id |
| deep page by cursor | 0.3 ms / 2.7 ms | – | – | Index Scan adt_perf_ordered_at_id |
| filter status, sort by total | 0.5 ms / 3.7 ms | 114.9 ms / 123.8 ms | 3.1 ms / 3.2 ms | Index Scan adt_perf_status_total_id |
| one month, newest first | 0.6 ms / 1.8 ms | 62.0 ms / 88.9 ms | 16.4 ms / 47.3 ms | Index Scan adt_perf_ordered_at_id |
| search "ayse" (folded column) | 1.0 ms / 5.0 ms | 740.6 ms / 821.0 ms | 34.4 ms / 35.2 ms | Index Scan adt_perf_ordered_at_id |
| search a rare word (3 columns, 1 indexed) | 717.6 ms / 752.3 ms | 719.5 ms / 783.4 ms | 715.7 ms / 770.0 ms | Seq Scan |
| two filters no index serves, many matches | 0.5 ms / 1.1 ms | 115.7 ms / 117.9 ms | 5.2 ms / 5.4 ms | Index Scan adt_perf_pkey |
| a rare word in the indexed column | 0.1 ms / 0.4 ms | 0.1 ms / 0.2 ms | 0.1 ms / 0.2 ms | Bitmap Heap Scan, Bitmap Index Scan adt_perf_customer_trgm |

- The deep `OFFSET` page is the only slow page: 2.5 s at row 2,500,000. The
  same depth by cursor takes 0.3 ms.
- An exact `COUNT(*)` of 5 million rows takes about 65 ms here; a search
  that matches 250,000 rows needs 740 ms to count.
- **The limited count took 1–35 ms for most requests here, but not all:** when few
  rows match and no index serves the condition, finding even 10,001 matches
  means reading the whole table (716 ms for the rare word). Measure your own
  slow filters.
- A search is as fast as its slowest column: across three columns where only
  one has a trigram index, PostgreSQL scans the table (718 ms); in the
  indexed column alone it takes 0.1 ms.
