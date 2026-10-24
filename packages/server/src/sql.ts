import { foldText } from '@acunsoft/datatable-core';
import { checkIdentifier, type ServerColumn } from './columns';
import { decodeCursor, encodeCursor, sortSignature } from './cursor';
import { TableQueryError, type ServerFilter, type ServerTableQuery } from './query';

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite' | 'sqlserver';

/**
 * The most bound values one statement may carry. SQL Server allows 2,100
 * parameters per request; the others far more than a table query needs.
 */
export const MAX_BINDINGS: Readonly<Record<SqlDialect, number>> = Object.freeze({ postgres: 65_535, mysql: 65_535, sqlite: 32_766, sqlserver: 2_100 });

/**
 * SQL text with its bound values: `$1` placeholders for PostgreSQL, `?` for
 * MySQL and SQLite, `@p1` for SQL Server (`request.input('p1', value)` with
 * the `mssql` driver). No driver is part of this package: bring your own.
 */
export interface SqlStatement {
  readonly text: string;
  readonly values: readonly unknown[];
}

export interface SqlQueryOptions {
  readonly dialect: SqlDialect;
  /** The table (or view) to read: `orders`. */
  readonly table: string;
  /** Unique key, the last sort tie-breaker so pages never overlap. Default `id`. */
  readonly key?: string;
  /** Columns to read. Default every column (`*`). */
  readonly select?: readonly string[];
  /**
   * The rows this user may see, written by you with `?` placeholders:
   * `{ text: 'tenant_id = ?', values: [tenantId] }`. Every query stays inside it.
   */
  readonly scope?: { readonly text: string; readonly values: readonly unknown[] };
  /**
   * How a date (a date-time filter, a date in a cursor) is bound. Default: the
   * `Date` itself, which the drivers bind as local time; for SQLite, local
   * `YYYY-MM-DD HH:MM:SS` text. Use `date => date.toISOString()` when SQLite
   * stores ISO text in UTC.
   */
  readonly bindDate?: (date: Date) => unknown;
}

export interface SqlTableQuery {
  /** The page: `pageSize` rows (one more with cursor paging, to know whether a next page exists). */
  readonly page: SqlStatement;
  /** `SELECT COUNT(*) AS count` with the same filters and search. */
  readonly count: SqlStatement;
  /** The cursor that continues after a row of the page (for `nextCursor`). */
  cursorOf(row: Readonly<Record<string, unknown>>): string;
}

const pad = (value: number): string => String(value).padStart(2, '0');
const isMidnight = (date: Date): boolean => date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
const nextDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

/**
 * Parameterized SQL for a checked query (`readTableQuery`): filters, the
 * smart search (every word must match some searchable column), sorting with
 * the key as tie-breaker, and `LIMIT`/`OFFSET` — or, with cursor paging, a
 * keyset condition that every database can serve from a `(column, key)`
 * index (the first sort column is bounded before the exact comparison).
 * Only identifiers from `defineColumns` and these options reach the SQL
 * text; every value is bound. A day given for a date-time column means the
 * whole day (`[00:00, next day)`).
 */
export function sqlQuery(query: ServerTableQuery, columns: readonly ServerColumn[], options: SqlQueryOptions): SqlTableQuery {
  const { dialect } = options;
  if (!(dialect in MAX_BINDINGS)) throw new TypeError('dialect must be postgres, mysql, sqlite or sqlserver');
  const quote = (name: string): string => checkIdentifier(name, 'identifier').split('.')
    .map(part => (dialect === 'mysql' ? `\`${part}\`` : dialect === 'sqlserver' ? `[${part}]` : `"${part}"`)).join('.');
  const table = quote(options.table);
  const key = quote(options.key ?? 'id');
  const keyName = (options.key ?? 'id').split('.').pop()!;
  const select = options.select ? options.select.map(quote).join(', ') : '*';

  if (options.bindDate !== undefined && typeof options.bindDate !== 'function') throw new TypeError('bindDate must be a function');
  const bindDate = options.bindDate ?? (dialect === 'sqlite'
    ? (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
    : (date: Date) => date);
  const values: unknown[] = [];
  const bind = (value: unknown): string => {
    values.push(value instanceof Date ? bindDate(value) : dialect === 'sqlite' && typeof value === 'boolean' ? (value ? 1 : 0) : value);
    return dialect === 'postgres' ? `$${values.length}` : dialect === 'sqlserver' ? `@p${values.length}` : '?';
  };
  // One escape character that means the same in every dialect and SQL mode (a backslash
  // does not: MySQL's NO_BACKSLASH_ESCAPES). SQL Server's LIKE also treats [ as a pattern.
  const like = (text: string): string => text.replace(dialect === 'sqlserver' ? /[!%_[]/g : /[!%_]/g, char => `!${char}`);
  const likeOp = dialect === 'postgres' ? 'ILIKE' : 'LIKE';
  const escape = " ESCAPE '!'";
  const asText = (sql: string): string => (dialect === 'mysql' ? `CAST(${sql} AS CHAR)` : dialect === 'sqlserver' ? `CAST(${sql} AS NVARCHAR(4000))` : `CAST(${sql} AS TEXT)`);
  // A column left at the default `text` type may be an enum or a uuid on PostgreSQL, which
  // has no LIKE or = '' for those; the cast is free for text and varchar columns.
  const textOf = (column: ServerColumn): string => (column.type !== 'text' ? asText(quote(column.sql))
    : dialect === 'postgres' ? `CAST(${quote(column.sql)} AS TEXT)` : quote(column.sql));

  const where: string[] = [];
  if (options.scope) {
    if (typeof options.scope.text !== 'string' || !Array.isArray(options.scope.values)) throw new TypeError('scope must be { text, values }');
    let index = 0;
    const text = options.scope.text.replace(/\?/g, () => bind(options.scope!.values[index++]));
    if (index !== options.scope.values.length) throw new TypeError('scope has a different number of ? placeholders and values');
    where.push(`(${text})`);
  }
  for (const filter of query.filters) where.push(condition(filter));
  for (const term of query.terms) {
    const candidates = columns.filter(column => column.searchable && couldContain(column, term));
    if (candidates.length === 0) {
      where.push('1 = 0'); // every word must match somewhere
      continue;
    }
    where.push(`(${candidates.map(column => (column.search
      ? `${quote(column.search)} LIKE ${bind(`%${like(foldText(term))}%`)}${escape}`
      : `${textOf(column)} ${column.type === 'text' ? likeOp : 'LIKE'} ${bind(`%${like(term)}%`)}${escape}`)).join(' OR ')})`);
  }

  function condition(filter: ServerFilter): string {
    const { column, operator, value } = filter;
    const sql = quote(column.sql);
    const day = column.type === 'datetime' && value instanceof Date && isMidnight(value);
    switch (operator) {
      case 'contains':
        return column.search
          ? `${quote(column.search)} LIKE ${bind(`%${like(foldText(String(value)))}%`)}${escape}`
          : `${textOf(column)} ${likeOp} ${bind(`%${like(String(value))}%`)}${escape}`;
      case 'startsWith':
        return `${textOf(column)} ${likeOp} ${bind(`${like(String(value))}%`)}${escape}`;
      case 'eq':
        return day ? `(${sql} >= ${bind(value)} AND ${sql} < ${bind(nextDay(value as Date))})` : `${sql} = ${bind(value)}`;
      case 'gt':
        return day ? `${sql} >= ${bind(nextDay(value as Date))}` : `${sql} > ${bind(value)}`;
      case 'gte':
        return `${sql} >= ${bind(value)}`;
      case 'lt':
        return `${sql} < ${bind(value)}`;
      case 'lte':
        return day ? `${sql} < ${bind(nextDay(value as Date))}` : `${sql} <= ${bind(value)}`;
      case 'between': {
        const [low, high] = value as [unknown, unknown];
        const wholeDay = column.type === 'datetime' && high instanceof Date && isMidnight(high);
        return wholeDay ? `(${sql} >= ${bind(low)} AND ${sql} < ${bind(nextDay(high as Date))})` : `${sql} BETWEEN ${bind(low)} AND ${bind(high)}`;
      }
      case 'in':
        return `${sql} IN (${(value as unknown[]).map(item => bind(item)).join(', ')})`;
      case 'empty':
        return column.type === 'text' ? `(${sql} IS NULL OR ${textOf(column)} = '')` : `${sql} IS NULL`;
      case 'notEmpty':
        return column.type === 'text' ? `(${sql} IS NOT NULL AND ${textOf(column)} <> '')` : `${sql} IS NOT NULL`;
    }
    throw new TypeError(`unknown operator ${String(operator)}`);
  }

  // Sorting, with the key last so equal values never swap between pages.
  const orders = query.sorting.map(rule => ({ column: rule.column.sql, direction: rule.direction }));
  const nullable = new Set(query.sorting.filter(rule => rule.column.nullable).map(rule => rule.column.sql));
  if (!orders.some(order => order.column === (options.key ?? 'id'))) {
    orders.push({ column: options.key ?? 'id', direction: orders.at(-1)?.direction ?? 'asc' });
  }
  const orderBy = `ORDER BY ${orders.map(order => `${quote(order.column)} ${order.direction.toUpperCase()}`).join(', ')}`;
  const signature = sortSignature(orders);
  // Where each database sorts NULL by default (the ORDER BY stays plain, so indexes serve it):
  // PostgreSQL as the largest value, the others as the smallest.
  const nullsFirst = (direction: 'asc' | 'desc'): boolean => (direction === 'asc') === (dialect !== 'postgres');

  const filterSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  const countValues = [...values];
  const count: SqlStatement = { text: `SELECT COUNT(*) AS ${dialect === 'sqlserver' ? '[count]' : 'count'} FROM ${table}${filterSql}`, values: countValues };

  // SQL Server pages with OFFSET … FETCH (the ORDER BY is always there: the key at least).
  const window = (take: number, skip: number): string => (dialect === 'sqlserver'
    ? `OFFSET ${skip} ROWS FETCH NEXT ${take} ROWS ONLY`
    : `LIMIT ${take}${skip > 0 || !query.cursorPaging ? ` OFFSET ${skip}` : ''}`);
  let pageWhere = filterSql;
  let limit = window(query.pageSize, (query.page - 1) * query.pageSize);
  if (query.cursorPaging) {
    limit = window(query.pageSize + 1, 0);
    if (query.cursor !== undefined) {
      const after = decodeCursor(query.cursor, signature, orders.length);
      // The rows after `value` in this column's order; NULL rows come where the database puts
      // them. `orEqual` gives the bound form (>=), which lets an index range serve the page.
      const beyond = (index: number, orEqual: boolean): string | undefined => {
        const order = orders[index]!;
        const name = quote(order.column);
        const value = after[index];
        const first = nullsFirst(order.direction);
        if (value === null) return first ? (orEqual ? undefined : `${name} IS NOT NULL`) : (orEqual ? `${name} IS NULL` : '1 = 0');
        const compare = `${name} ${order.direction === 'desc' ? '<' : '>'}${orEqual ? '=' : ''} ${bind(value)}`;
        return nullable.has(order.column) && !first ? `(${compare} OR ${name} IS NULL)` : compare;
      };
      const nest = (index: number): string => {
        const strict = beyond(index, false)!;
        if (index + 1 === orders.length) return strict;
        const name = quote(orders[index]!.column);
        const same = after[index] === null ? `${name} IS NULL` : `${name} = ${bind(after[index])}`;
        return strict === '1 = 0' ? `(${same} AND ${nest(index + 1)})` : `(${strict} OR (${same} AND ${nest(index + 1)}))`;
      };
      const bound = beyond(0, true);
      pageWhere = `${filterSql}${filterSql ? ' AND' : ' WHERE'} ${bound === undefined ? '' : `${bound} AND `}${nest(0)}`;
    }
  }
  const page: SqlStatement = { text: `SELECT ${select} FROM ${table}${pageWhere} ${orderBy} ${limit}`, values };
  if (values.length > MAX_BINDINGS[dialect]) {
    throw new TableQueryError('filters', `the query needs ${values.length} values; ${dialect} allows ${MAX_BINDINGS[dialect]} per statement`);
  }

  return Object.freeze({
    page,
    count,
    cursorOf: (row: Readonly<Record<string, unknown>>) => encodeCursor(signature, orders.map(order => {
      const name = order.column.split('.').pop()!;
      if (!(name in row)) throw new TypeError(`the row has no "${name}" for the cursor; select it (${keyName} too)`);
      return row[name];
    })),
  });
}

/** Whether a word could be part of a column's text: letters are never looked for in numbers or dates. */
function couldContain(column: ServerColumn, term: string): boolean {
  if (column.type === 'text' || column.search) return true;
  if (column.type === 'boolean') return false;
  return /^[\d.,:/ -]+$/.test(term); // numbers and dates as text
}
