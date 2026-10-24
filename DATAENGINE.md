# Acun DataEngine — architecture contracts (draft 2)

Status: **contracts only, no code yet.** Agreed on 2026-10-24: the light
packages are finished and published first; DataEngine is built after that,
against the contracts below. MIT licensed and free, like the rest.

## 0. Founding decisions

**Principle: Acun DataTable manages data, not the database.** It describes
what the user asks for (page, sort, filters, search) and shows the answer.
The backend and its database adapter run the queries.

| Area | Decision |
|---|---|
| Frontend | TypeScript, React, Vue, Livewire, vanilla JS (and the `<acun-datatable>` element) |
| Backend | Laravel, Node.js, and an open adapter system: anything that speaks wire protocol v1 (§2) is a backend |
| Databases | MySQL, MariaDB, PostgreSQL, SQLite, SQL Server; others through new adapters or dialects |
| Dependencies | no database driver is ever required: the user brings their own |
| Big data | server-side filtering, multi-column sorting, cursor (keyset) paging, smart counting |
| DataEngine | an optional package for advanced search, performance and index recommendations |

## 1. Decisions and conditions

Confirmed by the owner on 2026-10-24 as the architectural baseline.

| Decision | |
|---|---|
| Name, licence | Acun DataEngine, MIT, free. No paid or "Enterprise" tier is planned |
| Light packages keep | the column allowlist, filtering, sorting, limits, the result window, keyset (cursor) paging, a basic count, basic search (LIKE or a folded column) |
| DataEngine takes | advanced search, counts with a time limit, queued exports, big-data optimizations (query plans, time and cost budgets, smart counting), Index Advisor |
| SQL Server | optional support in the Node adapter; no database driver is ever required — database-independent, as DataTables is |
| Search order | the databases' native full-text first, then OpenSearch as an optional provider; the provider contract stays open to Meilisearch and Typesense |
| Order of work | first the first stable DataTable release (demo, tests, docs, upgrade guide); DataEngine after it |

Further conditions:

- **DataTable works professionally without DataEngine.** Nothing in the light
  packages needs it, and nothing a user sees is reserved for it.
- MySQL, MariaDB, PostgreSQL, SQLite and SQL Server are reached through
  adapters (dialects), never by name in the core.
- Index recommendations are written per database (§7) and **never applied
  automatically**.
- Performance tests for **5 million, 100 million and 1 billion rows** (§10).

Three conditions every contract below must meet:

1. **No dependency on a framework or a database.** DataEngine has a
   framework-free core per language (PHP, TypeScript); Laravel and Node
   bindings are thin. Every database feature is reached through a
   capability, never assumed.
2. **Installed later, frontend unchanged.** The browser speaks wire protocol
   v1 (§2) with or without DataEngine; DataEngine only changes how a server
   answers it.
3. **Capability Detection, Query Budget and Search-First** are first-class
   (§4, §5, §6).

## 2. Contract: wire protocol v1 (frozen)

The only interface between browser and server. Changes are **additive only**:
new optional request parameters and new optional response fields that older
clients ignore. Nothing is renamed or removed in v1.

Request (GET query, POST form or JSON), validated on the server:

| Parameter | Meaning |
|---|---|
| `page`, `pageSize` | 1-based page; size within the server's maximum |
| `sort` | `field:asc,field:desc` |
| `filters[i][field\|op\|value]` | `contains startsWith eq gt gte lt lte between in empty notEmpty` |
| `search` | smart search text (words, `"quoted phrases"`) |
| `paging`, `cursor` | `paging=cursor`; `cursor` is the previous answer's `nextCursor` |
| DataTables protocol | `draw`, `start`, `length`, `order[i]`, `columns[i]`, `search[value]` — answered in DataTables' format |

Response:

| Field | Meaning |
|---|---|
| `rows` | the page |
| `totalRows` *or* `totalRowsAtLeast` | exact count, or a lower bound when counting was cut short |
| `nextCursor` | cursor paging, while there is a next page |
| `totals` | footer totals per column ID |
| errors | 422 `{ message, errors: { field: message } }` (DataTables: 200 with `error`) |

Reserved for DataEngine (additive, ignored by today's clients):
`meta.count` (`exact` \| `estimated` \| `lowerBound`), `meta.engine`
(which provider answered), `meta.budget` (what was limited and why),
`facets` (counts per value, for engine-first search). An estimated count
keeps using `totalRowsAtLeast` or `totalRows` so current pagers work.

## 3. Contract: the query pipeline and its seams

Both server adapters (Laravel `QueryApplier`/`TableResponse`/`WithDataTable`,
Node `readTableQuery`/`sqlQuery`/`prismaQuery`) run the same stages:

```
read & validate → policy (budget) → search resolution → filters & sort
  → page strategy (OFFSET | keyset) → count strategy → totals → answer
```

DataEngine attaches at **one** entry point per binding and replaces stages,
never the protocol:

- Laravel: `TableResponse::engine(Engine $engine)` and a `dataEngine(): ?Engine`
  hook on `WithDataTable` (null → today's behaviour).
- Node: `readTableQuery(..., { engine })` / `engine.answer(query, source)`;
  without an engine, `sqlQuery` and `prismaQuery` as today.

Seams that exist today and stay stable (DataEngine builds on them, the
light packages keep working without it): `searchEngine()` /
`TableResponse::searchEngine()` (search resolution), `countLimit()` /
`countTimeout()` (count strategy), `maxResultWindow()` and `cursorPaging()`
(page strategy), `queuedExports()` / `Action::queued()` (queued operations).

## 4. Contract: Capability Detection

Each connection reports what it can do, detected once (version query,
driver) and cached; any feature whose capability is missing **degrades** to
the light behaviour instead of failing.

```ts
interface Capabilities {
  dialect: 'postgres' | 'mysql' | 'mariadb' | 'sqlite' | 'sqlserver' | string;
  version: string;
  statementTimeout: 'transaction' | 'session' | 'query-option' | 'none';
  estimatedCount: 'statistics' | 'explain' | 'none';      // pg_class, information_schema / sys.partitions, EXPLAIN rows
  fullText: 'tsvector' | 'fulltext' | 'fulltext-ngram' | 'contains' | 'fts5' | 'none';
  keyset: 'row-values' | 'bounded-or';                   // (a, id) < (x, y) or the bounded OR form
  explain: 'json' | 'text' | 'none';                     // for cost budgets
  maxBindings: number;                                   // SQL Server 2100, MySQL/PostgreSQL 65535, SQLite 32766
}
```

## 5. Contract: Query Budget

A per-endpoint policy; the light packages already enforce the first block.

| Limit | Light packages today | DataEngine |
|---|---|---|
| page size, filters, sort rules, search words, text length | ✓ | ✓ |
| result window (deepest OFFSET) | ✓ | ✓ |
| count time limit | ✓ (PostgreSQL, MySQL, MariaDB) | per capability |
| statement time limit for the page itself | – | ✓ |
| required filters on huge tables (e.g. a date range) | – | ✓ |
| cost estimate ceiling (EXPLAIN) | – | ✓ where `explain` ≠ `none` |
| rate limit per user | – | ✓ |
| bound-parameter ceiling (`maxBindings`) | ✓ (Node, SQL Server) | ✓ |

Over budget: either **degrade** (lower-bound count, keyset instead of OFFSET,
DB-first instead of engine-first) or **refuse** with 422
`{ errors: { budget: "…" } }` — the policy decides which, per limit.

## 6. Contract: Search-First

Text search is resolved **before** filters, by a provider:

```ts
interface SearchProvider {
  capabilities(): { fullText: boolean; fuzzy: boolean; facets: boolean; filterable: string[]; sortable: string[] };
  // DB-first: the engine finds keys, the database filters, sorts and pages them.
  keys(text: string, limit: number): Promise<{ keys: (string | number)[]; complete: boolean }>;
  // Engine-first: the engine answers the whole page; the database only loads these rows by key, in order.
  page?(query: Query): Promise<{ keys: (string | number)[]; total: number; exact: boolean; facets?: Facets; nextCursor?: string }>;
}
```

Planner rule: engine-first when the provider can serve every filter and sort
of the query; DB-first while the key list stays within budget; else the
database's native full-text; else LIKE / folded column (light behaviour).
Providers in order: PostgreSQL `tsvector`, MySQL/MariaDB `FULLTEXT`, SQL
Server `CONTAINS`, SQLite FTS5, then OpenSearch (later Meilisearch,
Typesense, through the same `SearchProvider` contract). Index sync: `upsert(key, document)` / `delete(key)` through an
outbox (model events in Laravel, hooks in Node); change-data capture is an
option for very large tables.

## 7. Contract: Index Advisor

Input: the column definitions (sortable, filterable, searchable) and,
optionally, a log of real queries. Output: database-neutral
recommendations, with DDL rendered per dialect by the capability layer —
**never executed** by DataEngine.

```ts
interface IndexRecommendation {
  table: string;
  columns: { name: string; order?: 'asc' | 'desc' }[];   // equality columns first, then the range or sort column, then the key
  kind: 'btree' | 'fulltext' | 'trigram' | 'folded-copy';
  reason: string;                                       // e.g. "status filter + ordered_at sort in 62% of requests"
  ddl: Record<string, string>;                          // per dialect
}
```

## 8. Contract: queued operations

```ts
interface TableTask {
  id: string; kind: 'export' | 'bulk' | string;
  owner: string | null;                  // only the owner reads the result
  state: Record<string, unknown>;        // the table's query state, rebuilt in the worker as that owner
  status: 'queued' | 'running' | 'ready' | 'failed';
  result?: { file?: string; message?: string };
  expiresAt: string;
}
```

Transport-free: Laravel queues and Node queues (e.g. BullMQ) are bindings.
The Laravel `RunTableTask` / `TableTasks` of the light package is the first
implementation and stays compatible when DataEngine takes over.

## 9. Packages (planned)

| Package | Contents |
|---|---|
| `@acunsoft/dataengine` | TypeScript core: planner, budget, capabilities, providers, advisor, tasks |
| `@acunsoft/dataengine-opensearch` | OpenSearch provider |
| `acunsoft/dataengine` | PHP core with a Laravel binding |

No package of the light set depends on DataEngine; DataEngine depends on
the light server packages only through the seams of §3.

## 10. Performance targets and tests

| Rows | Where it runs | What is measured |
|---|---|---|
| 5 million | locally and in an optional CI job | first page, page 100,000 by OFFSET and by cursor, filtered and sorted pages, search, the count (exact and with its time limit) |
| 100 million | a dedicated database server, by hand or on schedule | the same, with the indexes Index Advisor recommends; p50 / p95 of each request |
| 1 billion | a dedicated server or cluster, by hand | cursor paging, Search-First through a search provider, estimated counts; OFFSET is expected to be refused by the result window |

A benchmark is a script that seeds a table of the given size (generated in
the database, not sent from the client), runs every query type a fixed
number of times and reports p50 / p95 and the query plan. Each size has a
budget; a release must not make a measured request slower than its budget.
The light packages are measured at 5 million; 100 million and 1 billion
measure DataEngine.
