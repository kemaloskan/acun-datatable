# Acun DataTable — Architecture (v0.1)

## 1. Product intent

Acun DataTable is an independent, accessible, extensible TypeScript data-table engine. It is **not** coupled to Laravel, Livewire, Alpine.js, Tailwind CSS, jQuery, React or Vue. Consumers can use it through a DOM renderer or framework adapters.

Design priority: correctness and maintainability first; prove performance with measurements rather than promises. A million records are handled remotely with bounded page/window requests, never loaded entirely into the browser.

## 2. Architectural boundaries

```text
Consumer (HTML / Laravel / Livewire / React / Vue / Next.js)
                  |
        Optional integration adapter
                  |
         Renderer / UI layer
                  |
       @acunsoft/datatable-core
       (pure data/state engine)
                  |
        DataSource abstraction
             /           \
       LocalDataSource  RemoteDataSource
                              |
                     user-owned HTTP API
```

### Core engine (`packages/core`)
- Pure TypeScript; no DOM, browser globals or framework imports in the core runtime.
- Owns typed column definitions, table state, event subscriptions, local transformations and data source contracts.
- Must not import a renderer, transport, CSS package or a framework.
- Immutable state snapshots; controlled state update operations; stable row IDs.
- Initial release: local data, sorting, filtering, pagination and selection. Remote capability uses an explicit query/result contract.

### DOM renderer (`packages/renderer-dom`, M3 done)
- Renders semantic `<table>` by default; keyboard and screen reader support.
- Does not own business state. Subscribes to core and invokes core actions.
- HTML/DOM text must be escaped or assigned via `textContent` by default; never directly inject untrusted cell HTML.
- Published as `@acunsoft/datatable-dom`: `renderTable`, `renderPagination`, `renderSearch`. It uses no HTML-parsing DOM API at all (enforced by a test); formatters must return strings. Unit tests run in jsdom (dev dependency); Playwright tests run the renderer in Chromium, Firefox and WebKit.

### DataSource implementations (`packages/datasource-http`, M2 done)
- `local`: in-memory records suitable for small/medium datasets (`createDataTable`).
- `remote`: sends validated filter/sort/page parameters; server does heavy work.
- Uses `AbortController` and request sequence protection to avoid stale responses.
- No assumption that an HTTP backend uses Laravel.
- Published as `@acunsoft/datatable-http`. The contract types and the
  synchronous helpers (`createTableQuery`, `validatePageResult`) live in core;
  core stays free of DOM types by typing the request signal as a structural
  `AbortSignalLike`. Abort handling and the latest-request-wins runner
  (`createQueryRunner`) live in this package because they need `AbortController`.
- Default wire format: `page`, `pageSize`, `sort=field:dir,...`,
  `filters[i][field|op|value]`, `search`. Responses: `{ rows, totalRows? }`.

### Framework adapters (future)
- `adapter-react`: hooks/component; React peer dependency.
- `adapter-vue`: composables/component; Vue peer dependency.
- `adapter-laravel` (`acunsoft/datatable-laravel`): one Composer package for Laravel and Livewire. A shared server-side query layer (allowlisted columns, Eloquent operators, Turkish-aware smart search, page-size limit) serves both the JSON endpoint used by `@acunsoft/datatable-http` and the Livewire integration, which only activates when Livewire is installed (decided 2026-10-23).
- Next.js uses the React adapter with client boundaries; it is not a separate engine.
- Alpine.js integration is optional and must not duplicate Livewire-managed Alpine runtime.

### Plugins (future)
- Features such as virtual scrolling, CSV/Excel/PDF export, print, column resizing, import and grouping live in separately installable packages.
- Plugin registration has lifecycle hooks and an explicit compatibility/version policy.
- Export with remote datasets needs a **server-side export job** for all filtered records; do not equate exporting current visible page with exporting all matches.

## 3. Data contracts

```ts
export type RowId = string;
export type SortDirection = 'asc' | 'desc';
export interface SortRule { field: string; direction: SortDirection }
export interface FilterRule { field: string; operator: 'contains' | 'eq' | 'gt' | 'lt'; value: unknown }
export interface TableQuery {
  page: number;              // 1-based
  pageSize: number;
  sorting: SortRule[];
  filters: FilterRule[];
  globalSearch?: string;
}
export interface PageResult<Row> {
  rows: Row[];
  totalRows?: number;        // optional for unknown totals
  nextCursor?: string;       // future cursor mode
}
export interface DataSource<Row> {
  getPage(query: TableQuery, options?: { signal?: AbortSignal }): Promise<PageResult<Row>>;
}
```

- Every row has a deterministic, unique ID from `getRowId(row)`; never depend on array index for identity.
- Sorting and filtering have declared semantics; remote implementations must document which operators they support.
- Use allowlisted column keys server-side. Never interpolate client column names into raw SQL.
- Pagination v1: offset/page, 1-based. Cursor pagination is a separate capability that cannot promise arbitrary page jumps.
- Dates, number formats, and locale should have explicit policies; never silently coerce monetary values to binary floating point for business calculations.

## 4. Package topology

```text
acun-datatable/
  ARCHITECTURE.md        # Decisions and boundaries
  SPEC.md                # Milestones / acceptance tests
  CHANGELOG.md, LICENSE  # MIT
  package.json           # npm workspaces (no framework deps)
  tsconfig.base.json
  packages/               # directory          → published name
    core/                 # implemented        → @acunsoft/datatable-core
    datasource-http/      # implemented        → @acunsoft/datatable-http
    renderer-dom/         # implemented        → @acunsoft/datatable-dom
    adapter-react/        # planned            → @acunsoft/datatable-react
    adapter-vue/          # planned            → @acunsoft/datatable-vue
    adapter-laravel/      # in progress (PHP)  → acunsoft/datatable-laravel (Composer): query layer,
                          #                      JSON endpoint and Livewire support in one package
    plugin-virtual/       # later
    plugin-export-csv/    # later
    plugin-export-excel/  # later
    plugin-export-pdf/    # later
  e2e/                    # Playwright browser tests
  site/                   # documentation site (datatable.acunsoft.test)
  .github/workflows/
```

Directories are named by role (`renderer-dom`, `datasource-http`); published names use the `datatable-` prefix. Planned entries are reservations for roadmap planning, not a claim that those packages exist. Nothing is published yet. Blade components use the `x-acun-datatable::` namespace (e.g. `<x-acun-datatable::table>`). Acun Pro will build its tables on Acun DataTable; its earlier DataTables-based `acun:data-table` component is being removed.

## 5. Toolchain and packaging

- Node.js: development standard is Node.js 24 LTS (pinned in `.nvmrc`); `package.json` `engines` allows `>=22`. CI runs the suite on Node 22 and 24 (every supported LTS line); Node 20 was dropped after its end of life in April 2026.
- Dependency updates are controlled: the committed lockfile is authoritative (`npm ci`), and upgrades land only via a PR that passes the full CI matrix — no automatic or unattended updates.
- Package manager: npm workspaces for low setup friction; lockfile committed.
- TypeScript strict mode, ESM first; generate declarations and `exports` map.
- Vitest unit tests; Playwright browser/accessibility smoke tests after a DOM renderer exists.
- Changesets / semantic versioning before public distribution. Publish only through CI with access controls.
- Keep source and built `dist/` separate; avoid committing builds unless distribution design demands it.

## 6. Performance and reliability

- 1,000,000 rows: remote pagination and indexed server queries. A local array with a million elements is not a default target.
- Benchmark cold/warm render, page transitions, search latency, memory, and scrolling with reproducible datasets and hardware labels.
- Debounce only UI inputs; stale-response suppression belongs to transport contract.
- Core operations must be deterministic; no mutating caller-owned rows or state.
- Prefer accessible native tables; virtualization must preserve keyboard focus and announce positions appropriately.

## 7. Security and quality

- Treat every remote row value as untrusted.
- CSP-compatible default implementation; no eval.
- Never run untrusted formatters as remote-provided executable code.
- Remote API must authorize every query independently and enforce page-size bounds, timeouts, and rate limits where needed.
- Test edge cases: empty data, duplicate IDs, malformed response, out-of-range page, Turkish locale, Unicode, late response, cancellation, XSS strings.
- Public API changes require tests, docs, and migration notes.

## 8. Decision records

- ADR-001: Core is headless and framework-independent.
- ADR-002: UI and plugins are separate packages.
- ADR-003: DataSource is a contract, not Laravel-specific.
- ADR-004: Remote mode owns scalability; performance must be measured.
- ADR-005: Accessibility and secure rendering are release criteria, not add-ons.

Update this document when any boundary or design decision changes; don't silently deviate.
