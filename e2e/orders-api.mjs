// A real Node back end for the browser tests: @acunsoft/datatable-server (the
// built package) over an in-memory SQLite table, as an app would write it.
// GET or POST /e2e/api/orders: this package's wire format or DataTables'.
import { DatabaseSync } from 'node:sqlite';
import { foldText } from '../packages/core/dist/index.js';
import { defineColumns, readTableQuery, sqlQuery, tableError, tableResponse } from '../packages/server/dist/index.js';

const columns = defineColumns({
  customer: { sortable: true, filterable: true, search: 'customer_search' },
  city: { sortable: true, filterable: true, nullable: true },
  total: { type: 'decimal', sortable: true, filterable: true },
  ordered: { sql: 'ordered_at', type: 'datetime', sortable: true, filterable: true },
  paid: { type: 'boolean', filterable: true },
});

const names = ['Ayşe Yılmaz', 'Ali Kaya', 'İrem Şahin', 'Çağrı Öztürk', 'Zeynep Doğan', 'Ümit Kılıç', 'Deniz Ak'];
const cities = ['İstanbul', 'Ankara', 'İzmir', 'Bursa'];
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE orders (id INTEGER PRIMARY KEY, customer TEXT, customer_search TEXT, city TEXT, total NUMERIC,
  ordered_at TEXT, paid INTEGER, secret TEXT)`);
const insert = db.prepare('INSERT INTO orders VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
for (let id = 1; id <= 500; id++) {
  const customer = `${names[id % names.length]} ${id}`;
  insert.run(id, customer, foldText(customer), id % 9 === 0 ? null : cities[id % cities.length], ((id * 7919) % 100_000) / 100,
    `2026-${String(1 + (id % 12)).padStart(2, '0')}-${String(1 + (id % 28)).padStart(2, '0')} ${String(id % 24).padStart(2, '0')}:00:00`, id % 3 === 0 ? 1 : 0, 'never sent');
}

const all = statement => db.prepare(statement.text).all(...statement.values);

/**
 * Answer one table request; `params` is URLSearchParams (GET) or the parsed form
 * (POST). With `countUpTo`, matches are counted only that far (a limited count):
 * past it the answer carries `totalRowsAtLeast` instead of `totalRows`.
 */
export function ordersApi(params, { countUpTo } = {}) {
  try {
    const query = readTableQuery(params, columns, { maxPageSize: 100 });
    const sql = sqlQuery(query, columns, { dialect: 'sqlite', table: 'orders', select: ['id', 'customer', 'city', 'total', 'ordered_at', 'paid'] });
    const rows = all(sql.page).map(row => ({ ...row, paid: row.paid === 1 }));
    if (countUpTo !== undefined) {
      const limited = { text: `SELECT COUNT(*) AS count FROM (SELECT 1 FROM orders${sql.count.text.split(' FROM "orders"')[1] ?? ''} LIMIT ${countUpTo + 1})`, values: sql.count.values };
      const counted = all(limited)[0].count;
      return { status: 200, body: tableResponse(query, rows, counted, { cursorOf: sql.cursorOf, atLeast: counted > countUpTo }) };
    }
    const total = all(sql.count)[0].count;
    return { status: 200, body: tableResponse(query, rows, total, { cursorOf: sql.cursorOf, recordsTotal: 500 }) };
  } catch (error) {
    return tableError(error, params);
  }
}
