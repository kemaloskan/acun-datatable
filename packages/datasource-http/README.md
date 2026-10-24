# @acunsoft/datatable-http

HTTP `DataSource` and a latest-request-wins query runner for
`@acunsoft/datatable-core`. The server does the heavy work (filtering, sorting,
paging); the browser only ever holds one page. Not tied to Laravel or any backend.

```ts
import { createDataTable } from '@acunsoft/datatable-core';
import {
  connectTable, createHttpDataSource, createQueryRunner, fromLaravelPaginator,
} from '@acunsoft/datatable-http';

const table = createDataTable<Order>({
  mode: 'server',                        // no local sorting, filtering or paging
  columns,
  initialState: { pageSize: 25 },
});
const runner = createQueryRunner(createHttpDataSource({
  url: '/api/orders',
  headers: async () => ({ Authorization: `Bearer ${await getToken()}` }),
  parseResponse: fromLaravelPaginator,   // omit if the server returns { rows, totalRows }
  maxPageSize: 100,
}));

const disconnect = connectTable(table, runner); // loads page 1

table.subscribe(() => render(table.getPage()));  // { rows, page, pageCount, totalRows }
runner.subscribe(({ status, error }) => renderStatus(status, error));

table.setGlobalSearch(text);             // debounce typing in the UI; re-queries page 1
table.setPage(3);                        // re-queries page 3
```

`connectTable` runs the table's query (`table.getQuery()`) whenever the page,
page size, sorting, filters or search change, and applies a successful result
with `table.setPageResult` only if it answers the table's current query. Loading
and error states live on the runner. Without `connectTable`, call
`runner.run(table.getQuery())` and `table.setPageResult(result)` yourself.

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
- **GET or POST.** `method: 'POST'` sends the same parameters as a form body
  (long filter lists, servers that expect POST). It is still a read. Laravel
  POST routes need the CSRF token: `headers: { 'X-CSRF-TOKEN': token }`.
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

Dates are sent in the user's local time so the day never shifts (`formatLocalDate`):
a local midnight becomes `2026-10-23`, other times `2026-10-23T14:05:00.000+03:00`.
Booleans are sent as `true`/`false`. `createTableQuery` rejects unknown operators
and invalid values and leaves out empty `contains` filters and empty search. The server
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
        'filters.*.op' => ['required', Rule::in(['contains', 'startsWith', 'eq', 'gt', 'lt', 'between', 'in', 'empty', 'notEmpty'])],
        'filters.*.value' => ['nullable'],              // checked per operator below
        'filters.*.value.*' => ['string', 'max:100'],
    ]);

    $escape = fn (string $text) => addcslashes($text, '%_\\');
    $query = Order::query();

    foreach ($input['filters'] ?? [] as $filter) {
        [$field, $op, $value] = [$filter['field'], $filter['op'], $filter['value'] ?? null];
        $list = is_array($value) ? $value : null;
        $text = is_string($value) && strlen($value) <= 100 ? $value : null;
        abort_if(match ($op) {                          // reject malformed rules
            'between' => count($list ?? []) !== 2,
            'in' => $list === null || count($list) < 1 || count($list) > 100,
            'empty', 'notEmpty' => $value !== null,
            default => $text === null,
        }, 422);
        match ($op) {                                   // values are always bound
            'contains' => $query->where($field, 'like', '%'.$escape($text).'%'),
            'startsWith' => $query->where($field, 'like', $escape($text).'%'),
            'eq' => $query->where($field, $text),
            'gt' => $query->where($field, '>', $text),
            'lt' => $query->where($field, '<', $text),
            'between' => $query->whereBetween($field, $list),
            'in' => $query->whereIn($field, $list),
            'empty' => $query->where(fn ($q) => $q->whereNull($field)->orWhere($field, '')),
            'notEmpty' => $query->whereNotNull($field)->where($field, '<>', ''),
        };
    }
    // Smart search, as on the client: every word must match some column;
    // "quoted phrases" stay together.
    preg_match_all('/"([^"]*)"?|(\S+)/u', $input['search'] ?? '', $matches, PREG_SET_ORDER);
    foreach (array_slice($matches, 0, 10) as $match) {
        $term = trim(($match[1] ?? '') !== '' ? $match[1] : ($match[2] ?? ''));
        if ($term === '') continue;
        $query->where(function ($q) use ($columns, $escape, $term) {
            foreach ($columns as $column) $q->orWhere($column, 'like', '%'.$escape($term).'%');
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

**Days:** a date-only filter value (`2026-10-23`, which is also how a date
picker's local midnight is sent) means the whole day. On a `datetime` column
apply it with `whereDate($field, $text)` for `eq` (and `whereDate(... '>' ...)`
/ `'<'` for `gt` / `lt`), not with a plain comparison, so `created_at` values
later that day still match, exactly as the client does.

For the same case- and accent-insensitive matching as the client (`ayse` finds
`Ayşe`, `istanbul` finds `İSTANBUL`), match against a folded copy of the text:
for example a generated search column that stores the lower-cased text without
accents, or a database function that removes them. A plain `LIKE` on the
original column follows the database collation and may differ from the client.

## Node backend (Express + PostgreSQL)

```js
import express from 'express';
import pg from 'pg';
import { splitSearchTerms } from '@acunsoft/datatable-core';

const db = new pg.Pool();
const app = express();
app.set('query parser', 'extended');                    // parse filters[0][field]

const COLUMNS = { customer: 'customer', total: 'total', city: 'city' }; // API id -> SQL column
const SORTABLE = new Set(['customer', 'total']);
const OPS = { eq: '=', gt: '>', lt: '<' };  // between, in and empty work the same way
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
  // Smart search, as on the client: every word must match some column.
  const search = typeof req.query.search === 'string' ? req.query.search.slice(0, 100) : '';
  for (const term of splitSearchTerms(search).slice(0, 10)) {   // from @acunsoft/datatable-core
    const placeholder = bind(like(term));
    where.push(`(${Object.values(COLUMNS).map((c) => `${c}::text ILIKE ${placeholder}`).join(' OR ')})`);
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

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
