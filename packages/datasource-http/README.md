# @acunsoft/datatable-http

HTTP `DataSource` and a latest-request-wins query runner for
`@acunsoft/datatable-core`. The server does the heavy work (filtering, sorting,
paging); the browser only ever holds one page. Not tied to Laravel or any backend.

```ts
import { createTableQuery } from '@acunsoft/datatable-core';
import { createHttpDataSource, createQueryRunner, fromLaravelPaginator } from '@acunsoft/datatable-http';

const source = createHttpDataSource({
  url: '/api/orders',
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  parseResponse: fromLaravelPaginator,   // omit if the server returns { rows, totalRows }
  maxPageSize: 100,
});
const runner = createQueryRunner(source);

runner.subscribe(({ status, result, error }) => {
  // status: 'idle' | 'loading' | 'success' | 'error'
  // result: last successful page, kept while the next one loads
});

let query = createTableQuery({ page: 1, pageSize: 25 });
runner.run(query);

// On user input (debounce search typing in the UI), build the next query:
query = createTableQuery({ ...query, page: 1, globalSearch: text });
runner.run(query);
```

`createDataTable` is local-only for now: it filters and pages in memory, so do
not feed it remote pages yet. A server mode that keeps the table state and
takes rows and `totalRows` from this runner is the next M2 step.

## Behaviour

- **Latest request wins.** Each `run` aborts the request in flight and gets a
  sequence number. A response or error from an older run is dropped even if the
  server ignores the abort, so stale data can never overwrite newer data.
- **States.** `loading` keeps the previous `result`; `error` keeps it too and
  sets `error`. An empty page is a normal `success`. `run` never rejects
  (except for an invalid query, which is rejected before anything is sent).
- **Retry is explicit.** The runner never retries on its own; call `retry()` to
  re-run the last query. `cancel()` aborts and returns to the last settled state.
- **Read-only.** `getPage` is an HTTP `GET` and must not change server data, so a
  retry can never duplicate a write.
- **Validation.** Non-2xx responses throw `HttpError` (`status`, `statusText`);
  non-JSON bodies and bodies that break the `PageResult` contract (rows not an
  array of objects, more rows than requested, bad `totalRows`) are rejected.
  `maxPageSize` (default 100, at most 1000) is enforced before sending.
- **Injectable.** `fetch`, `headers` (static or async per request),
  `serializeQuery`, `parseResponse` and `credentials` are all options.

## Wire format

`serializeTableQuery` produces query parameters that PHP/Laravel and Node `qs`
parse into nested arrays:

```
GET /api/orders?page=2&pageSize=25
  &sort=total:desc,customer:asc
  &filters[0][field]=total&filters[0][op]=gt&filters[0][value]=100
  &filters[1][field]=total&filters[1][op]=lt&filters[1][value]=500
  &search=ayşe
```

Dates are sent as ISO 8601 strings, booleans as `true`/`false`. The server
answers `{ "rows": [...], "totalRows": 185920 }` (`totalRows` may be omitted when
unknown), or Laravel's paginator JSON with `parseResponse: fromLaravelPaginator`.

## Laravel / PHP backend

```php
use App\Models\Order;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

public function index(Request $request)
{
    $this->authorize('viewAny', Order::class);          // authorize every request

    $columns = ['customer', 'total', 'city'];           // allowlist (filter + search)
    $sortable = ['customer', 'total'];                  // allowlist (sort)

    $input = $request->validate([
        'page' => ['integer', 'min:1'],
        'pageSize' => ['integer', 'min:1', 'max:100'],  // server-side limit
        'sort' => ['nullable', 'string', 'max:200'],
        'search' => ['nullable', 'string', 'max:100'],
        'filters' => ['array', 'max:10'],
        'filters.*.field' => ['required', Rule::in($columns)],
        'filters.*.op' => ['required', Rule::in(['contains', 'eq', 'gt', 'lt'])],
        'filters.*.value' => ['required', 'string', 'max:100'],
    ]);

    $like = fn (string $text) => '%'.addcslashes($text, '%_\\').'%';
    $query = Order::query();

    foreach ($input['filters'] ?? [] as $filter) {
        match ($filter['op']) {                         // values are always bound
            'contains' => $query->where($filter['field'], 'like', $like($filter['value'])),
            'eq' => $query->where($filter['field'], $filter['value']),
            'gt' => $query->where($filter['field'], '>', $filter['value']),
            'lt' => $query->where($filter['field'], '<', $filter['value']),
        };
    }
    if (filled($input['search'] ?? null)) {
        $query->where(function ($q) use ($columns, $like, $input) {
            foreach ($columns as $column) $q->orWhere($column, 'like', $like($input['search']));
        });
    }
    foreach (array_filter(explode(',', $input['sort'] ?? '')) as $part) {
        [$field, $direction] = array_pad(explode(':', $part, 2), 2, 'asc');
        if (in_array($field, $sortable, true) && in_array($direction, ['asc', 'desc'], true)) {
            $query->orderBy($field, $direction);
        }
    }
    $query->orderBy('id');                              // stable order across pages

    return OrderResource::collection(                   // expose only intended fields
        $query->paginate($input['pageSize'] ?? 25, ['*'], 'page', $input['page'] ?? 1)
    );
}
```

`OrderResource::collection(...)` returns `{ data, meta: { total } }`; either
return `$query->paginate(...)` directly with `fromLaravelPaginator`, or pass a
`parseResponse` that reads `meta.total`.

## Node backend (Express + PostgreSQL)

```js
import express from 'express';
import pg from 'pg';

const db = new pg.Pool();
const app = express();
app.set('query parser', 'extended');                    // parse filters[0][field]

const COLUMNS = { customer: 'customer', total: 'total', city: 'city' }; // API id -> SQL column
const SORTABLE = new Set(['customer', 'total']);
const OPS = { eq: '=', gt: '>', lt: '<' };
const int = (value, fallback, min, max) => {
  const n = Number.parseInt(value, 10);
  return Number.isSafeInteger(n) ? Math.min(Math.max(n, min), max) : fallback;
};
const like = (text) => `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

app.get('/api/orders', requireAuth, async (req, res) => {
  const page = int(req.query.page, 1, 1, 1_000_000);
  const pageSize = int(req.query.pageSize, 25, 1, 100); // server-side limit
  const where = [];
  const params = [];
  const bind = (value) => { params.push(value); return `$${params.length}`; };

  for (const filter of Object.values(req.query.filters ?? {}).slice(0, 10)) {
    const column = COLUMNS[filter?.field];
    if (!column || typeof filter.value !== 'string' || filter.value.length > 100) {
      return res.status(400).json({ error: 'invalid filter' });
    }
    if (filter.op === 'contains') where.push(`${column} ILIKE ${bind(like(filter.value))}`);
    else if (OPS[filter.op]) where.push(`${column} ${OPS[filter.op]} ${bind(filter.value)}`);
    else return res.status(400).json({ error: 'invalid operator' });
  }
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '';
  if (search) {
    const term = bind(like(search));
    where.push(`(${Object.values(COLUMNS).map((c) => `${c}::text ILIKE ${term}`).join(' OR ')})`);
  }
  const order = String(req.query.sort ?? '').split(',').map((part) => part.split(':'))
    .filter(([field, dir]) => SORTABLE.has(field) && (dir === 'asc' || dir === 'desc'))
    .map(([field, dir]) => `${COLUMNS[field]} ${dir.toUpperCase()}`);
  order.push('id ASC');                                 // stable order across pages

  const filterSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const [rows, count] = await Promise.all([
    db.query(`SELECT id, customer, total, city FROM orders ${filterSql}
              ORDER BY ${order.join(', ')} LIMIT ${pageSize} OFFSET ${(page - 1) * pageSize}`, params),
    db.query(`SELECT count(*)::int AS n FROM orders ${filterSql}`, params),
  ]);
  res.json({ rows: rows.rows, totalRows: count.rows[0].n });
});
```

Only allowlisted identifiers and clamped integers are ever placed in the SQL
text; every user value is a bound parameter.

## Security checklist

- **Authorize every request** on the server; the client's query is untrusted.
- **Allowlist** filterable, searchable and sortable columns, and the operators.
  Map public column IDs to real column names; never interpolate client column
  names into SQL.
- **Bind values** as parameters and escape `%`/`_` in `LIKE` patterns.
- **Limit** page size, number of filters and value lengths on the server too;
  add timeouts and rate limiting for expensive queries.
- **Index** the columns you sort and filter on, and always add a unique
  tie-breaker (e.g. `id`) to `ORDER BY` so pages are stable. Very deep `OFFSET`
  pages get slow; cursor pagination is planned for that case.
- **Return only intended fields** (API resources / explicit `SELECT`).
- **Treat row values as untrusted** in the browser: render them as text.
