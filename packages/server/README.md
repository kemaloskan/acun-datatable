# @acunsoft/datatable-server

The Node back end of [Acun DataTable](https://kemaloskan.github.io/acun-datatable/):
for Next.js route handlers, Express, Fastify or any server that has a
`Request` or its query string. It reads the table's request, checks it
against a column allowlist, builds **bound-parameter SQL** for PostgreSQL,
MySQL and SQLite (or **Prisma** arguments), and answers in the format the
request used. No runtime dependency besides `@acunsoft/datatable-core`; it
runs on the Edge runtime too.

```bash
npm install @acunsoft/datatable-server
```

```ts
// app/api/orders/route.ts (Next.js App Router, PostgreSQL with pg)
import { defineColumns, readTableQuery, sqlQuery, tableError, tableResponse } from '@acunsoft/datatable-server';

const columns = defineColumns({
  customer: { sortable: true, filterable: true, search: 'customer_search' }, // folded copy: "ayse" finds "Ayşe"
  city: { sortable: true, filterable: true },
  total: { type: 'decimal', sortable: true, filterable: true },
  ordered: { sql: 'ordered_at', type: 'datetime', sortable: true, filterable: true },
});

export async function GET(request: Request) {
  const user = await auth();
  if (!user) return new Response(null, { status: 401 });
  const params = new URL(request.url).searchParams;
  try {
    const query = readTableQuery(params, columns, { maxPageSize: 100 });
    const sql = sqlQuery(query, columns, {
      dialect: 'postgres', table: 'orders', select: ['id', 'customer', 'city', 'total', 'ordered_at'],
      scope: { text: 'tenant_id = ?', values: [user.tenantId] },
    });
    const [page, count] = await Promise.all([pool.query(sql.page.text, [...sql.page.values]), pool.query(sql.count.text, [...sql.count.values])]);
    return Response.json(tableResponse(query, page.rows, count.rows[0].count, { cursorOf: sql.cursorOf }));
  } catch (error) {
    const { status, body } = tableError(error, params); // 422 { message, errors }, or DataTables' error
    return Response.json(body, { status });
  }
}
```

The browser side is `@acunsoft/datatable` (`serverSide: true, ajax: '/api/orders'`)
or `createHttpDataSource({ url: '/api/orders' })` with the React or Vue package.

## What it does

- **`defineColumns`** is the allowlist. Only its IDs may be sorted
  (`sortable`), filtered (`filterable`) or searched (`searchable`, by default
  the filterable text columns); only its `sql` identifiers (checked as plain
  identifiers) reach the SQL text. Requests never name a column of their own.
- **`readTableQuery`** reads `URLSearchParams` (GET), `FormData` (POST form)
  or a JSON body, in this package family's format (`page`, `pageSize`,
  `sort=total:desc`, `filters[i][field|op|value]`, `search`, `paging`,
  `cursor`) or **DataTables' protocol** (`draw`, `start`, `length`, `order`,
  `columns`, `search[value]`). Values are read as the column type (a number,
  decimal text, `YYYY-MM-DD`, a date-time, yes/no), sizes are limited (page
  size, 20 filters, 5 sort rules, 200-character texts, 10 search words) and
  anything else throws `TableQueryError`.
- **`sqlQuery`** writes the page and the count with every value bound
  (`$1` for PostgreSQL, `?` for MySQL and SQLite): filters (`contains`,
  `startsWith`, `eq`, `gt`, `gte`, `lt`, `lte`, `between`, `in`, `empty`,
  `notEmpty`; a day on a date-time column means the whole day), the smart
  search (every word must match some searchable column; letters are never
  looked for in numbers or dates), sorting with the key as the last
  tie-breaker, and `LIMIT`/`OFFSET`. `scope` is your own condition (tenant,
  owner) with `?` placeholders; every query stays inside it.
- **Cursor paging** (`paging=cursor`): the page continues after the last row
  of the page before, written so a `(column, id)` index serves it on every
  database (the first sort column is bounded before the exact comparison), so
  page 100,000 costs what page 2 does. `tableResponse` reads one extra row to
  know there is a next page and returns `nextCursor` (`cursorOf`). Cursors
  are tied to their sort; sort columns should not hold `NULL`s.
- **`prismaQuery`** gives `findMany` / `count` arguments instead
  (`insensitive: false` on MySQL and SQLite).
- **`tableResponse`** answers `{ rows, totalRows, nextCursor? }`, or
  `{ draw, recordsTotal, recordsFiltered, data }` for a DataTables request;
  `map` picks what each row sends. **`tableError`** turns a `TableQueryError`
  into a 422 (or DataTables' `error` with a 200) and throws anything else on.

## Turkish and accent-insensitive search

Database `LIKE` only folds ASCII letters on SQLite and depends on the
collation elsewhere. For "ayse" to find "Ayşe" and "istanbul" "İSTANBUL",
keep a folded copy of the column (`foldText` from `@acunsoft/datatable-core`
when you write the row) and name it in `search`; the term is folded the same
way. Index it (`text_pattern_ops` or a trigram index on PostgreSQL).

## Security checklist

- Authorize the user in the handler; put tenant or owner rules in `scope`.
- `select` only the columns the browser may see (or `map` the rows).
- Keep `maxPageSize` small (default 100).

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
