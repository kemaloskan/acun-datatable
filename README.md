# Acun DataTable

Framework-independent TypeScript data table engine (early development scaffold).

## Setup

This project targets **Node.js 24 LTS**, pinned in [`.nvmrc`](.nvmrc) and used by
CI as its single source of truth. With [nvm](https://github.com/nvm-sh/nvm):

```bash
nvm use        # select the Node version from .nvmrc
npm ci         # clean, reproducible install from the committed lockfile
npm run check  # TypeScript strict type-check (src + tests)
npm run test   # Vitest unit tests
npm run build  # ESM bundle + type declarations
```

Use `npm install` only when intentionally updating dependencies; CI runs
`npm ci` so the lockfile must stay in sync.

## Headless state API available today

```ts
import { createTableState } from '@acunsoft/datatable-core';

const table = createTableState({
  page: 1,
  pageSize: 25,
  sorting: [{ field: 'customer', direction: 'asc' }],
});

const unsubscribe = table.subscribe((state) => {
  console.log(state); // deeply frozen snapshot
});

table.setPage(2);
table.setPageSize(50);
table.setSorting([{ field: 'createdAt', direction: 'desc' }]);

unsubscribe();
table.destroy();
```

Pages are 1-based and `pageSize` must be between 1 and 1000. Sorting
precedence follows array order; fields must be unique and directions must be
`asc` or `desc`. Successful state changes create immutable snapshots and notify
subscribers. Equivalent setter calls do not notify. After `destroy`, setters and
new subscriptions are no-ops while the final snapshot remains readable.

The existing `createPagination(page, pageSize)` helper remains available. No
renderer, HTTP DataSource, local row processing or full table API has been
implemented yet. See `SPEC.md` for milestones.

## Column schema and stable row IDs (M1)

```ts
import {
  createColumns, createRows, type ColumnDef,
} from '@acunsoft/datatable-core';

type Customer = { readonly id: number; readonly name: string };

const nameColumn = {
  id: 'name', header: 'Customer', accessorKey: 'name', enableSorting: true,
} as const satisfies ColumnDef<Customer, string>;

const columns = createColumns<Customer>([
  nameColumn,
  {
    id: 'nameLength', header: 'Name length',
    accessorFn: customer => customer.name.length,
    enableFiltering: true,
  },
]);

const rows = createRows([{ id: 42, name: 'Ayşe' }] as const);
// rows[0]: { id: '42', original: { id: 42, name: 'Ayşe' } }

const externalRows = createRows([{ customerCode: 'C-42' }], {
  getRowId: customer => customer.customerCode,
});
```

`ColumnDef<TData, TValue = unknown>` accepts readonly definitions. `accessorKey`
is a direct `keyof TData` property (including numeric/symbol keys), not a dotted
path. When `TValue` is specified, only keys whose values fit that type are
accepted. `accessorFn` receives `Readonly<TData>`; its return type must fit
`TValue`. Use `satisfies` to validate a definition while retaining its inferred
function return type and literal key. `createColumns<TData>` accepts mixed value
types and returns a readonly array of `ColumnDef<TData>`.

Every data column requires a unique, non-blank string `id`, a string `header`
(empty text is allowed), and **exactly one** accessor. Neither accessor takes
precedence: supplying both, even with an explicitly undefined property, throws.
Missing accessors also throw in this data-column API; the optional display-only
columns described in the roadmap are not implemented yet. Sorting/filtering
flags default to `false` and must be booleans when provided. These flags only
declare capabilities; they do not sort or filter rows yet. Validation runs once
when constructing columns, without calling accessors. Runtime validation cannot
verify `keyof TData` after TypeScript erasure; JavaScript callers must supply
keys that exist on their records. IDs are case-sensitive and are not trimmed.

`createRows(data)` is available only when TypeScript knows each record has a
required string/number `id`. Runtime validation also requires an own `id`
property. Other data shapes require `createRows(data, { getRowId })`.
The callback takes only the record, runs once per record, and overrides `row.id`.
It must be pure and return the same ID for the same logical record across
reloads/pages. The engine never generates IDs or derives them from an index.

IDs accept non-blank strings (preserved exactly) or safe integer numbers
(converted to strings). Zero and negative integers are valid. Fractional,
unsafe, infinite, missing, boolean, bigint, and object IDs are rejected.
Duplicate normalized IDs throw: `1` and `'1'`, or `0` and `-0`, collide.
Duplicate detection applies to each supplied batch/page; uniqueness across the
whole dataset remains the data provider's responsibility. Empty arrays are valid.
Callback errors propagate unchanged.

Column definitions are shallow-copied and frozen; their output array is frozen.
Row wrappers and their output array are frozen, but `Row<TData>.original` shares
the caller's record through a shallow readonly view. The engine neither clones
nor freezes caller-owned records or nested objects. Caller mutations to originals
remain visible; callers should replace records on reload and keep identity fields
stable. Creating rows performs one pass with a Set for duplicate detection and
does not retain a global identity registry. No runtime dependency was added.

`npm run check` checks source, runtime tests, and compile-only type assertions
in `packages/core/tests/schema.types.ts` and
`packages/core/tests/local-row-model.types.ts`; build declarations remain
source-only.
