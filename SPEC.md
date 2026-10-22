# Acun DataTable — Product specification & acceptance criteria (v0.1)

## Goal

Create a publishable, framework-agnostic data table engine, starting with a small but well-tested headless core. Do not claim parity with jQuery DataTables or AG Grid until comparison tests demonstrate it.

## Non-goals for initial milestone

No DOM renderer, CSS theme, Excel/PDF export, virtual scrolling, React/Vue/Livewire adapters, grouping or cell editing in milestone M0. They are planned, not implemented.

## M0 — Repository foundation (this starter)

Deliverables:
- Root workspace configured for independent packages.
- `@acunsoft/datatable-core` TypeScript build with type declarations.
- Unit test runner and automated GitHub Actions CI.
- Three authoritative project docs: `ARCHITECTURE.md`, `SPEC.md`, `AGENTS.md`.
- One small executable function that demonstrates stable, immutable table query normalization.

Acceptance:
- `npm install`, `npm run check`, `npm run test`, `npm run build` succeed on supported Node LTS.
- No runtime dependencies on a framework, DOM or CSS.
- Core package compiles in TypeScript strict mode.
- CI invokes the same commands as a local developer.

## M1 — Headless table core

Features:
- Column schema: `id`, `header`, optional value accessor and sorting/filtering capabilities.
- Generic `Table<Row>` state transitions; immutable snapshots and subscriptions.
- Local data source; stable multiple-column sorting, per-column filtering, global search.
- 1-based paged results and visible row IDs; server mode bypasses local transforms.
- Single/multi row selection keyed by stable IDs.

Acceptance:
- Deterministic tests for sorting, filtering, empty data, selection and page bounds.
- Never mutate input rows, column definitions or caller-owned state.
- Duplicate row IDs handled by documented deterministic error behavior.
- Each state action yields a documented event; unsubscribing works.
- Public API has typed examples and tests.

## M2 — Remote DataSource and HTTP

Features:
- Typed `TableQuery` / `PageResult<Row>` contract.
- Fetch adapter with injectable URL/auth headers/serializer (no Laravel coupling).
- Abort and latest-request-wins behavior; loading, error and empty states.
- Maximum page size configurable; validation of malformed responses.

Acceptance:
- Tests prove stale responses cannot overwrite newer data.
- Retry behavior is explicit and does not duplicate writes.
- Contract examples include Laravel/PHP backend and plain Node backend.
- Security notes cover authorization, allowlisted sorts, filtering, limits and indexes.

## M3 — DOM renderer

Features:
- Accessible HTML table, separate toolbar/pagination components, configurable theme hooks.
- Keyboard traversal and focus management, responsive fallback.
- Default untrusted cell content rendered as text.

Acceptance:
- XSS fixture is rendered as literal text, not executed.
- Playwright test checks core interactions in Chromium and WebKit or Firefox.
- Keyboard-only navigation for primary controls.
- No Alpine, jQuery, Tailwind or framework dependency.

## M4 — Performance & integrations

Features:
- Virtual row rendering package; row-height strategy and overscan.
- CSV export module, import module, then optional Excel/PDF packages.
- Optional adapters for React/Vue/Livewire and compatible Tailwind theme.

Acceptance:
- Performance report vs jQuery DataTables / AG Grid with reproducible environment and dataset.
- Report bundle size gzipped, memory, interactions and perceived latency.
- All format adapters maintain core API parity and do not duplicate state owners.

## Composed public API (implemented in M1, local mode)

```ts
import { createDataTable } from '@acunsoft/datatable-core';

const table = createDataTable<Order>({
  data: orders,
  getRowId: (row) => String(row.id), // optional when every record has an `id`
  columns: [{ id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true }],
  initialState: { page: 1, pageSize: 25 },
});

table.setSorting([{ field: 'customer', direction: 'asc' }]);
table.subscribe((state, event) => console.log(event.type, state));
```

Deviations from the originally proposed example, decided during M1:

- `data` instead of `rows`: `Row<TData>` already names the identity wrapper that
  `createRows` produces, so the raw records are called `data`.
- `accessorKey` / `accessorFn` instead of `accessor`: fixed by the column schema
  (exactly one accessor; keys are typed against the record).
- Listeners receive `(state, event)`, where `event.type` names the action
  (`page`, `pageSize`, `sorting`, `filters`, `globalSearch`, `data`,
  `selection`), to satisfy "each state action yields a documented event".

`mode: 'server'` bypasses the local transforms: the table exposes `getQuery()`
and accepts `setPageResult()`; `@acunsoft/datatable-http` provides `connectTable`.

## API response example (M2 target)

```json
{
  "rows": [{ "id": "123", "customer": "Example" }],
  "totalRows": 185920
}
```

## Definition of Done for each change

1. Meets a numbered acceptance criterion.
2. Includes or updates tests for happy path and boundary/failure path.
3. Passes `npm run check`, `npm run test`, and `npm run build`.
4. Updates docs/examples if public contract changes.
5. Reports performance only when measured, including dataset and environment.
6. Does not introduce undocumented runtime dependencies.
7. Is reviewed for security and accessibility impact.

## Planned release approach

- `0.1.0` foundation and experimental headless API.
- `0.2.x` complete M1/M2, explicit breaking-change allowance while pre-1.0.
- `0.3.x` DOM renderer MVP.
- `1.0.0` only after stable API, docs, compatibility matrix, CI, benchmarks and accessibility review.

Do not publish the package publicly from this scaffold without validating package ownership, version, naming rights and release permissions.
