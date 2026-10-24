import { DatabaseSync } from 'node:sqlite';
import { beforeAll, describe, expect, it } from 'vitest';
import { foldText } from '@acunsoft/datatable-core';
import { defineColumns, prismaQuery, readTableQuery, sqlQuery, tableError, tableResponse, TableQueryError } from '../src/index';

const columns = defineColumns({
  customer: { sortable: true, filterable: true, search: 'customer_search' },
  city: { sortable: true, filterable: true },
  total: { type: 'decimal', sortable: true, filterable: true },
  qty: { type: 'number', filterable: true },
  ordered: { sql: 'ordered_at', type: 'datetime', sortable: true, filterable: true },
  paid: { type: 'boolean', filterable: true },
});
const names = ['Ayşe Yılmaz', 'Ali Kaya', 'İrem Şahin', 'Çağrı Öztürk', 'Zeynep Doğan', 'Ümit Kılıç'];
const cities = ['İstanbul', 'Ankara', 'İzmir'];
let db: DatabaseSync;
beforeAll(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, customer_search TEXT, city TEXT, total NUMERIC, qty INTEGER, ordered_at TEXT, paid INTEGER, tenant INTEGER, secret TEXT)`);
  const insert = db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (let id = 1; id <= 60; id++) {
    const customer = names[id % names.length]!;
    insert.run(id, customer, foldText(customer), id % 7 === 0 ? null : cities[id % cities.length]!, (id * 37) % 500 + 0.5, id % 9, `2026-10-${String(1 + (id % 28)).padStart(2, '0')} ${String(id % 24).padStart(2, '0')}:00:00`, id % 2, id % 4 === 0 ? 2 : 1, 'do-not-send');
  }
});
const run = (sql: { text: string; values: readonly unknown[] }) => db.prepare(sql.text).all(...(sql.values as never[])) as Record<string, unknown>[];
const ask = (params: string, scope = { text: 'tenant = ?', values: [1] }) => {
  const query = readTableQuery(new URLSearchParams(params), columns, { maxPageSize: 50 });
  const sql = sqlQuery(query, columns, { dialect: 'sqlite', table: 'orders', select: ['id', 'customer', 'city', 'total', 'ordered_at'], scope });
  const rows = run(sql.page);
  const total = Number(run(sql.count)[0]!['count']);
  return { query, sql, rows, total, body: tableResponse(query, rows, total, { cursorOf: sql.cursorOf }) };
};
const all = (where: (row: Record<string, unknown>) => boolean) => (db.prepare('SELECT * FROM orders WHERE tenant = 1 ORDER BY id').all() as Record<string, unknown>[]).filter(where);

describe('readTableQuery', () => {
  it('reads the wire format into checked, typed rules', () => {
    const query = readTableQuery(new URLSearchParams('page=2&pageSize=10&sort=total:desc,customer:asc&filters[0][field]=total&filters[0][op]=between&filters[0][value][0]=10&filters[0][value][1]=99.5&filters[1][field]=paid&filters[1][op]=eq&filters[1][value]=true&search=ayse "kaya ali"'), columns);
    expect(query).toMatchObject({ page: 2, pageSize: 10, search: 'ayse "kaya ali"', terms: ['ayse', 'kaya ali'], cursorPaging: false });
    expect(query.sorting.map(rule => `${rule.column.id}:${rule.direction}`)).toEqual(['total:desc', 'customer:asc']);
    expect(query.filters.map(filter => [filter.column.id, filter.operator, filter.value])).toEqual([['total', 'between', ['10', '99.5']], ['paid', 'eq', true]]);
  });

  it('refuses what the allowlist does not allow', () => {
    const fail = (params: string) => { try { readTableQuery(new URLSearchParams(params), columns); } catch (error) { return error instanceof TableQueryError ? `${error.field}: ${error.message}` : String(error); } return 'ok'; };
    expect(fail('sort=secret:asc')).toBe('sort: unknown column "secret"');
    expect(fail('sort=qty:asc')).toBe('sort: column "qty" cannot be sorted');
    expect(fail('filters[0][field]=secret&filters[0][op]=eq&filters[0][value]=x')).toBe('filters.0.field: unknown column "secret"');
    expect(fail('filters[0][field]=total&filters[0][op]=DROP&filters[0][value]=1')).toBe('filters.0.op: unknown operator "DROP"');
    expect(fail('filters[0][field]=qty&filters[0][op]=gt&filters[0][value]=1;DROP TABLE')).toMatch(/^filters\.0\.value: .* is not a valid number/);
    expect(fail('pageSize=1001')).toBe('pageSize: pageSize must be a whole number from 1 to 100');
    expect(fail('cursor=../x')).toBe('cursor: cursor must be the nextCursor of a previous page');
    expect(fail('__proto__[polluted]=1')).toBe('ok');
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('reads FormData, JSON bodies and DataTables requests', () => {
    const form = new FormData();
    form.set('pageSize', '5');
    form.set('filters[0][field]', 'city');
    form.set('filters[0][op]', 'in');
    form.set('filters[0][value][0]', 'Ankara');
    expect(readTableQuery(form, columns).filters[0]).toMatchObject({ operator: 'in', value: ['Ankara'] });
    expect(readTableQuery({ page: 3, pageSize: 5, filters: [{ field: 'qty', op: 'gte', value: 2 }] }, columns).filters[0]!.value).toBe(2);
    const datatables = readTableQuery(new URLSearchParams('draw=7&start=20&length=10&search[value]=ali&columns[0][data]=customer&columns[1][data]=city&columns[1][search][value]=ank&order[0][column]=0&order[0][dir]=desc'), columns);
    expect(datatables).toMatchObject({ draw: 7, page: 3, pageSize: 10, search: 'ali' });
    expect(datatables.filters[0]).toMatchObject({ operator: 'contains', value: 'ank' });
    expect(datatables.sorting[0]).toMatchObject({ direction: 'desc' });
  });
});

describe('sqlQuery (SQLite)', () => {
  it('filters, searches Turkish text through the folded column, sorts and pages inside the scope', () => {
    const search = ask('pageSize=50&search=ayse');
    expect(search.total).toBe(all(row => row['customer'] === 'Ayşe Yılmaz').length);
    expect(search.total).toBeGreaterThan(0);
    expect(search.rows.every(row => row['customer'] === 'Ayşe Yılmaz')).toBe(true);
    expect(Object.keys(search.rows[0]!)).not.toContain('secret');
    const both = ask('pageSize=50&search=ayse ankara'); // every word somewhere: the folded customer, the city
    expect(both.total).toBe(all(row => row['customer'] === 'Ayşe Yılmaz' && row['city'] === 'Ankara').length);
    const none = ask('pageSize=50&search=nobody');
    expect(none.body).toEqual({ rows: [], totalRows: 0 });
    const city = ask('pageSize=50&filters[0][field]=city&filters[0][op]=contains&filters[0][value]=zmir');
    expect(city.total).toBe(all(row => row['city'] === 'İzmir').length);
    const sorted = ask('pageSize=50&sort=total:desc').rows.map(row => Number(row['total']));
    expect(sorted).toEqual([...sorted].sort((a, b) => b - a));
  });

  it('treats a day as the whole day for date-time columns, and empty as null or blank', () => {
    const day = ask('pageSize=50&filters[0][field]=ordered&filters[0][op]=eq&filters[0][value]=2026-10-06');
    expect(day.total).toBe(all(row => String(row['ordered_at']).startsWith('2026-10-06')).length);
    expect(day.total).toBeGreaterThan(0);
    const range = ask('pageSize=50&filters[0][field]=ordered&filters[0][op]=between&filters[0][value][0]=2026-10-06&filters[0][value][1]=2026-10-07');
    expect(range.total).toBe(all(row => /^2026-10-0[67]/.test(String(row['ordered_at']))).length);
    const empty = ask('pageSize=50&filters[0][field]=city&filters[0][op]=empty');
    expect(empty.total).toBe(all(row => row['city'] === null).length);
    const paid = ask('pageSize=50&filters[0][field]=paid&filters[0][op]=eq&filters[0][value]=true');
    expect(paid.total).toBe(all(row => row['paid'] === 1).length);
  });

  it('binds every value and keeps the scope', () => {
    const { sql, total } = ask("search=x' OR 1=1 --&pageSize=5");
    expect(total).toBe(0);
    expect(sql.page.text).not.toContain('1=1');
    expect(sql.page.text).toMatch(/^SELECT "id", "customer", "city", "total", "ordered_at" FROM "orders" WHERE \(tenant = \?\) AND/);
    expect(ask('pageSize=50').total).toBe(all(() => true).length);
  });

  it('pages by OFFSET and by cursor to the same rows', () => {
    const byOffset: unknown[] = [];
    for (let page = 1; page <= Math.ceil(all(() => true).length / 7); page++) byOffset.push(...ask(`sort=total:desc&pageSize=7&page=${page}`).rows.map(row => row['id']));
    const byCursor: unknown[] = [];
    let cursor: string | undefined;
    let page = 1;
    do {
      const { body } = ask(`sort=total:desc&pageSize=7&paging=cursor&page=${page}${cursor ? `&cursor=${cursor}` : ''}`);
      byCursor.push(...(body['rows'] as Record<string, unknown>[]).map(row => row['id']));
      cursor = body['nextCursor'] as string | undefined;
      page++;
    } while (cursor && page < 20);
    expect(byCursor).toEqual(byOffset);
    expect(new Set(byCursor).size).toBe(byCursor.length);
    const first = ask('sort=total:desc&pageSize=7&paging=cursor').body['nextCursor'] as string;
    expect(() => ask(`sort=city:asc&pageSize=7&paging=cursor&cursor=${first}`)).toThrow('cursor does not match the sort');
  });

  it('writes PostgreSQL and MySQL with their own placeholders and quoting', () => {
    const query = readTableQuery(new URLSearchParams('sort=ordered:desc&filters[0][field]=customer&filters[0][op]=contains&filters[0][value]=ali&search=kaya'), columns);
    const pg = sqlQuery(query, columns, { dialect: 'postgres', table: 'orders', scope: { text: 'tenant_id = ?', values: [9] } });
    expect(pg.page.text).toBe('SELECT * FROM "orders" WHERE (tenant_id = $1) AND "customer_search" LIKE $2 ESCAPE \'\\\' AND ("customer_search" LIKE $3 ESCAPE \'\\\' OR "city" ILIKE $4 ESCAPE \'\\\') ORDER BY "ordered_at" DESC, "id" DESC LIMIT 25 OFFSET 0');
    expect(pg.page.values).toEqual([9, '%ali%', '%kaya%', '%kaya%']);
    const my = sqlQuery(query, columns, { dialect: 'mysql', table: 'orders' });
    expect(my.page.text).toContain('`customer_search` LIKE ? ESCAPE \'\\\\\'');
    expect(() => sqlQuery(query, columns, { dialect: 'postgres', table: 'orders; drop table x' })).toThrow('plain SQL identifier');
  });
});

describe('prismaQuery', () => {
  it('builds findMany and count arguments', () => {
    const query = readTableQuery(new URLSearchParams('page=2&pageSize=10&sort=total:asc&filters[0][field]=ordered&filters[0][op]=eq&filters[0][value]=2026-10-05&search=kaya'), columns);
    const prisma = prismaQuery(query, columns, { where: { tenant: 1 } });
    expect(prisma.findMany).toMatchObject({ orderBy: [{ total: 'asc' }, { id: 'asc' }], take: 10, skip: 10 });
    expect(prisma.count.where).toEqual({ AND: [
      { tenant: 1 },
      { ordered: { gte: new Date(2026, 9, 5), lt: new Date(2026, 9, 6) } },
      { OR: [{ customer_search: { contains: 'kaya' } }, { city: { contains: 'kaya', mode: 'insensitive' } }] },
    ] });
    const cursor = prisma.cursorOf({ total: '12.50', id: 4 });
    const next = prismaQuery(readTableQuery(new URLSearchParams(`sort=total:asc&paging=cursor&cursor=${cursor}`), columns), columns);
    expect(next.findMany).toMatchObject({ take: 26, where: { AND: [{ total: { gte: '12.50' } }, { OR: [{ total: { gt: '12.50' } }, { AND: [{ total: '12.50' }, { id: { gt: 4 } }] }] }] } });
  });
});

describe('tableResponse and tableError', () => {
  it('answers in the format the request used', () => {
    const query = readTableQuery(new URLSearchParams('draw=3&start=0&length=2'), columns);
    expect(tableResponse(query, [{ id: 1 }, { id: 2 }], 9n, { recordsTotal: 20 })).toEqual({ draw: 3, recordsTotal: 20, recordsFiltered: 9, data: [{ id: 1 }, { id: 2 }] });
    expect(tableResponse(readTableQuery({}, columns), [{ id: 1, secret: 'x' }], '1', { map: row => ({ id: row.id }) })).toEqual({ rows: [{ id: 1 }], totalRows: 1 });
  });

  it('turns query errors into 422, or DataTables errors into 200', () => {
    const params = new URLSearchParams('sort=secret:asc');
    const error = (() => { try { readTableQuery(params, columns); } catch (caught) { return caught; } })();
    expect(tableError(error, params)).toEqual({ status: 422, body: { message: 'unknown column "secret"', errors: { sort: 'unknown column "secret"' } } });
    expect(tableError(error, { draw: '5' })).toMatchObject({ status: 200, body: { draw: 5, error: 'unknown column "secret"' } });
    expect(() => tableError(new Error('boom'))).toThrow('boom');
  });
});
