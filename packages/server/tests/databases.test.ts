// sqlQuery on real servers with their usual Node drivers. Each database runs when its
// variable names a database (CI starts them as services), and is skipped otherwise:
//   ADT_TEST_PGSQL=postgres://postgres@127.0.0.1:5432/adt_test
//   ADT_TEST_MYSQL=mysql://root:secret@127.0.0.1:3306/adt_test        (MySQL or MariaDB)
//   ADT_TEST_MSSQL=mssql://sa:Secret-12345@127.0.0.1:1433/master
// The test table is temporary (PostgreSQL, MySQL) or dropped afterwards (SQL Server).
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { foldText } from '@acunsoft/datatable-core';
import { defineColumns, readTableQuery, sqlQuery, tableResponse, type SqlDialect, type SqlStatement } from '../src/index';

const columns = defineColumns({
  customer: { sortable: true, filterable: true, search: 'customer_search' },
  city: { sortable: true, filterable: true, nullable: true }, // NULL every 7th row
  total: { type: 'decimal', sortable: true, filterable: true },
  ordered: { sql: 'ordered_at', type: 'datetime', sortable: true, filterable: true },
  paid: { type: 'boolean', filterable: true },
});
const names = ['Ayşe Yılmaz', 'Ali Kaya', 'İrem Şahin', 'Çağrı Öztürk', 'Zeynep Doğan', 'Ümit Kılıç'];
const cities = ['İstanbul', 'Ankara', 'İzmir'];
const ROWS = Array.from({ length: 60 }, (_, i) => {
  const id = i + 1;
  const customer = names[id % names.length]!;
  return {
    id, customer, customer_search: foldText(customer), city: id % 7 === 0 ? null : cities[id % cities.length]!,
    total: ((id * 37) % 500 + 0.5).toFixed(2),
    ordered_at: `2026-10-${String(1 + (id % 28)).padStart(2, '0')} ${String(id % 24).padStart(2, '0')}:00:00`,
    paid: id % 2 === 1, tenant: id % 4 === 0 ? 2 : 1,
  };
});

interface Connection {
  readonly dialect: SqlDialect;
  readonly table: string;
  all(statement: SqlStatement): Promise<Record<string, unknown>[]>;
  close(): Promise<void>;
}

async function postgres(url: string): Promise<Connection> {
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE TEMPORARY TABLE adt_orders (id int PRIMARY KEY, customer text, customer_search text, city text,
    total numeric(10,2), ordered_at timestamp, paid boolean, tenant int)`);
  for (const row of ROWS) {
    await client.query('INSERT INTO adt_orders VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [row.id, row.customer, row.customer_search, row.city, row.total, row.ordered_at, row.paid, row.tenant]);
  }
  return { dialect: 'postgres', table: 'adt_orders', all: async ({ text, values }) => (await client.query(text, [...values])).rows, close: () => client.end() };
}

async function mysql(url: string): Promise<Connection> {
  const { default: mysql2 } = await import('mysql2/promise');
  const connection = await mysql2.createConnection({ uri: url, dateStrings: false });
  await connection.query(`CREATE TEMPORARY TABLE adt_orders (id int PRIMARY KEY, customer varchar(100), customer_search varchar(100), city varchar(100),
    total decimal(10,2), ordered_at datetime, paid tinyint(1), tenant int) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  for (const row of ROWS) {
    await connection.query('INSERT INTO adt_orders VALUES (?,?,?,?,?,?,?,?)', [row.id, row.customer, row.customer_search, row.city, row.total, row.ordered_at, row.paid ? 1 : 0, row.tenant]);
  }
  return { dialect: 'mysql', table: 'adt_orders', all: async ({ text, values }) => (await connection.query(text, [...values]))[0] as Record<string, unknown>[], close: () => connection.end() };
}

async function sqlserver(url: string): Promise<Connection> {
  const { default: mssql } = await import('mssql');
  const parsed = new URL(url);
  const pool = await new mssql.ConnectionPool({
    server: parsed.hostname, port: Number(parsed.port || 1433), user: decodeURIComponent(parsed.username), password: decodeURIComponent(parsed.password),
    database: parsed.pathname.slice(1) || 'master',
    options: { encrypt: false, trustServerCertificate: true, useUTC: false }, // dates as written (local wall time)
  }).connect();
  await pool.request().query(`IF OBJECT_ID('adt_orders') IS NOT NULL DROP TABLE adt_orders;
    CREATE TABLE adt_orders (id int PRIMARY KEY, customer nvarchar(100), customer_search nvarchar(100), city nvarchar(100),
    total decimal(10,2), ordered_at datetime2, paid bit, tenant int)`);
  for (const row of ROWS) {
    await pool.request().input('a', row.id).input('b', row.customer).input('c', row.customer_search).input('d', row.city)
      .input('e', mssql.Decimal(10, 2), row.total).input('f', mssql.DateTime2, new Date(row.ordered_at.replace(' ', 'T'))).input('g', row.paid).input('h', row.tenant)
      .query('INSERT INTO adt_orders VALUES (@a,@b,@c,@d,@e,@f,@g,@h)');
  }
  return {
    dialect: 'sqlserver', table: 'adt_orders',
    all: async ({ text, values }) => {
      const request = pool.request();
      values.forEach((value, index) => request.input(`p${index + 1}`, value));
      return (await request.query(text)).recordset as Record<string, unknown>[];
    },
    close: async () => { await pool.request().query('DROP TABLE adt_orders'); await pool.close(); },
  };
}

const servers: [string, string | undefined, (url: string) => Promise<Connection>][] = [
  ['PostgreSQL', process.env['ADT_TEST_PGSQL'], postgres],
  ['MySQL / MariaDB', process.env['ADT_TEST_MYSQL'], mysql],
  ['SQL Server', process.env['ADT_TEST_MSSQL'], sqlserver],
];

for (const [name, url, open] of servers) {
  describe.skipIf(!url)(`sqlQuery on ${name}`, () => {
    let db: Connection;
    beforeAll(async () => { db = await open(url!); }, 60_000);
    afterAll(async () => { await db?.close(); });
    const mine = ROWS.filter(row => row.tenant === 1);
    const ask = async (params: string) => {
      const query = readTableQuery(new URLSearchParams(params), columns, { maxPageSize: 100 });
      const sql = sqlQuery(query, columns, { dialect: db.dialect, table: db.table, select: ['id', 'customer', 'city', 'total', 'ordered_at'], scope: { text: 'tenant = ?', values: [1] } });
      const rows = await db.all(sql.page);
      const total = Number((await db.all(sql.count))[0]!['count']);
      return { rows, total, body: tableResponse(query, rows, total, { cursorOf: sql.cursorOf }) };
    };
    const ids = (rows: Record<string, unknown>[]) => rows.map(row => Number(row['id']));

    it('searches through the folded column and filters by every operator', async () => {
      expect((await ask('pageSize=100&search=ayse')).total).toBe(mine.filter(row => row.customer === 'Ayşe Yılmaz').length);
      expect((await ask('pageSize=100&search=ayse ankara')).total).toBe(mine.filter(row => row.customer === 'Ayşe Yılmaz' && row.city === 'Ankara').length);
      expect((await ask('pageSize=100&filters[0][field]=total&filters[0][op]=between&filters[0][value][0]=100&filters[0][value][1]=200.5')).total)
        .toBe(mine.filter(row => Number(row.total) >= 100 && Number(row.total) <= 200.5).length);
      expect((await ask('pageSize=100&filters[0][field]=city&filters[0][op]=in&filters[0][value][0]=Ankara&filters[0][value][1]=İzmir')).total)
        .toBe(mine.filter(row => row.city === 'Ankara' || row.city === 'İzmir').length);
      expect((await ask('pageSize=100&filters[0][field]=city&filters[0][op]=empty')).total).toBe(mine.filter(row => row.city === null).length);
      expect((await ask('pageSize=100&filters[0][field]=paid&filters[0][op]=eq&filters[0][value]=true')).total).toBe(mine.filter(row => row.paid).length);
      expect((await ask('pageSize=100&filters[0][field]=customer&filters[0][op]=contains&filters[0][value]=100%25_x')).total).toBe(0); // % and _ are literal
    });

    it('treats a day as the whole day for a date-time column', async () => {
      expect((await ask('pageSize=100&filters[0][field]=ordered&filters[0][op]=eq&filters[0][value]=2026-10-06')).total)
        .toBe(mine.filter(row => row.ordered_at.startsWith('2026-10-06')).length);
      expect((await ask('pageSize=100&filters[0][field]=ordered&filters[0][op]=lte&filters[0][value]=2026-10-03')).total)
        .toBe(mine.filter(row => row.ordered_at.slice(0, 10) <= '2026-10-03').length);
    });

    it('sorts with the key as tie-breaker and pages by OFFSET and by cursor to the same rows, NULLs included', async () => {
      for (const sort of ['total:desc', 'customer:asc,ordered:desc', 'city:asc', 'city:desc,total:asc']) {
        const byOffset: number[] = [];
        for (let page = 1; page <= Math.ceil(mine.length / 7); page++) byOffset.push(...ids((await ask(`sort=${sort}&pageSize=7&page=${page}`)).rows));
        const byCursor: number[] = [];
        let cursor: string | undefined;
        let page = 1;
        do {
          const { body } = await ask(`sort=${sort}&pageSize=7&paging=cursor&page=${page}${cursor ? `&cursor=${cursor}` : ''}`);
          byCursor.push(...ids(body['rows'] as Record<string, unknown>[]));
          cursor = body['nextCursor'] as string | undefined;
          page++;
        } while (cursor && page < 30);
        expect(byOffset).toHaveLength(mine.length);
        expect(byCursor).toEqual(byOffset);
      }
    });
  });
}
