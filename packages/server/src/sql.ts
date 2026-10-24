import { foldText } from '@acunsoft/datatable-core';
import { checkIdentifier, type ServerColumn } from './columns';
import { decodeCursor, encodeCursor, sortSignature } from './cursor';
import type { ServerFilter, ServerTableQuery } from './query';

export type SqlDialect = 'postgres' | 'mysql' | 'sqlite';

/** SQL text with its bound values: `$1` placeholders for PostgreSQL, `?` for MySQL and SQLite. */
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
const like = (text: string): string => text.replace(/[\\%_]/g, char => `\\${char}`);

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
  if (dialect !== 'postgres' && dialect !== 'mysql' && dialect !== 'sqlite') throw new TypeError('dialect must be postgres, mysql or sqlite');
  const quote = (name: string): string => checkIdentifier(name, 'identifier').split('.').map(part => (dialect === 'mysql' ? `\`${part}\`` : `"${part}"`)).join('.');
  const table = quote(options.table);
  const key = quote(options.key ?? 'id');
  const keyName = (options.key ?? 'id').split('.').pop()!;
  const select = options.select ? options.select.map(quote).join(', ') : '*';

  const values: unknown[] = [];
  const bind = (value: unknown): string => {
    values.push(dialect === 'sqlite' && value instanceof Date
      ? `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())} ${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`
      : dialect === 'sqlite' && typeof value === 'boolean' ? (value ? 1 : 0) : value);
    return dialect === 'postgres' ? `$${values.length}` : '?';
  };
  const likeOp = dialect === 'postgres' ? 'ILIKE' : 'LIKE';
  const escape = dialect === 'mysql' ? " ESCAPE '\\\\'" : " ESCAPE '\\'";
  const asText = (sql: string): string => (dialect === 'mysql' ? `CAST(${sql} AS CHAR)` : `CAST(${sql} AS TEXT)`);

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
      : column.type === 'text'
        ? `${quote(column.sql)} ${likeOp} ${bind(`%${like(term)}%`)}${escape}`
        : `${asText(quote(column.sql))} LIKE ${bind(`%${like(term)}%`)}${escape}`)).join(' OR ')})`);
  }

  function condition(filter: ServerFilter): string {
    const { column, operator, value } = filter;
    const sql = quote(column.sql);
    const day = column.type === 'datetime' && value instanceof Date && isMidnight(value);
    switch (operator) {
      case 'contains':
        return column.search
          ? `${quote(column.search)} LIKE ${bind(`%${like(foldText(String(value)))}%`)}${escape}`
          : `${column.type === 'text' ? sql : asText(sql)} ${likeOp} ${bind(`%${like(String(value))}%`)}${escape}`;
      case 'startsWith':
        return `${column.type === 'text' ? sql : asText(sql)} ${likeOp} ${bind(`${like(String(value))}%`)}${escape}`;
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
        return column.type === 'text' ? `(${sql} IS NULL OR ${sql} = '')` : `${sql} IS NULL`;
      case 'notEmpty':
        return column.type === 'text' ? `(${sql} IS NOT NULL AND ${sql} <> '')` : `${sql} IS NOT NULL`;
    }
    throw new TypeError(`unknown operator ${String(operator)}`);
  }

  // Sorting, with the key last so equal values never swap between pages.
  const orders = query.sorting.map(rule => ({ column: rule.column.sql, direction: rule.direction }));
  if (!orders.some(order => order.column === (options.key ?? 'id'))) {
    orders.push({ column: options.key ?? 'id', direction: orders.at(-1)?.direction ?? 'asc' });
  }
  const orderBy = `ORDER BY ${orders.map(order => `${quote(order.column)} ${order.direction.toUpperCase()}`).join(', ')}`;
  const signature = sortSignature(orders);

  const filterSql = where.length > 0 ? ` WHERE ${where.join(' AND ')}` : '';
  const countValues = [...values];
  const count: SqlStatement = { text: `SELECT COUNT(*) AS count FROM ${table}${filterSql}`, values: countValues };

  let pageWhere = filterSql;
  let limit = `LIMIT ${query.pageSize} OFFSET ${(query.page - 1) * query.pageSize}`;
  if (query.cursorPaging) {
    limit = `LIMIT ${query.pageSize + 1}`;
    if (query.cursor !== undefined) {
      const after = decodeCursor(query.cursor, signature, orders.length);
      const first = orders[0]!;
      const bound = `${quote(first.column)} ${first.direction === 'desc' ? '<=' : '>='} ${bind(after[0])}`;
      const nest = (index: number): string => {
        const order = orders[index]!;
        const strict = `${quote(order.column)} ${order.direction === 'desc' ? '<' : '>'} ${bind(after[index])}`;
        return index + 1 < orders.length
          ? `(${strict} OR (${quote(order.column)} = ${bind(after[index])} AND ${nest(index + 1)}))`
          : strict;
      };
      pageWhere = `${filterSql}${filterSql ? ' AND' : ' WHERE'} ${bound} AND ${nest(0)}`;
    }
  }
  const page: SqlStatement = { text: `SELECT ${select} FROM ${table}${pageWhere} ${orderBy} ${limit}`, values };

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
