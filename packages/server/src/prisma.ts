import { foldText } from '@acunsoft/datatable-core';
import type { ServerColumn } from './columns';
import { decodeCursor, encodeCursor, sortSignature } from './cursor';
import type { ServerFilter, ServerTableQuery } from './query';

type Where = Record<string, unknown>;

export interface PrismaQueryOptions {
  /** Unique key field, the last sort tie-breaker. Default `id`. */
  readonly key?: string;
  /** The rows this user may see, e.g. `{ tenantId }`; every query stays inside it. */
  readonly where?: Where;
  /** `mode: 'insensitive'` on text matches (PostgreSQL, MongoDB). Default true; set false for MySQL and SQLite. */
  readonly insensitive?: boolean;
}

export interface PrismaTableQuery {
  /** Arguments for `findMany`: `where`, `orderBy`, `take` and `skip`. */
  readonly findMany: { readonly where: Where; readonly orderBy: readonly Record<string, 'asc' | 'desc'>[]; readonly take: number; readonly skip?: number };
  /** Arguments for `count`. */
  readonly count: { readonly where: Where };
  /** The cursor that continues after a row of the page. */
  cursorOf(row: Readonly<Record<string, unknown>>): string;
}

const isMidnight = (date: Date): boolean => date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
const nextDay = (date: Date): Date => new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

/**
 * Prisma arguments for a checked query (`readTableQuery`): `prisma.order.findMany(q.findMany)`
 * and `prisma.order.count(q.count)`. Columns are addressed by their `field`;
 * search looks in text columns (or their folded `search` field). With
 * cursor paging `take` is one more than the page, to know whether there is
 * a next one. A day given for a date-time column means the whole day.
 */
export function prismaQuery(query: ServerTableQuery, columns: readonly ServerColumn[], options: PrismaQueryOptions = {}): PrismaTableQuery {
  const key = options.key ?? 'id';
  const mode = options.insensitive === false ? {} : { mode: 'insensitive' };
  const and: Where[] = [];
  if (options.where) and.push(options.where);
  for (const filter of query.filters) and.push(condition(filter));
  for (const term of query.terms) {
    const candidates = columns.filter(column => column.searchable && (column.type === 'text' || column.search));
    and.push(candidates.length === 0
      ? { [key]: { in: [] } } // every word must match somewhere
      : { OR: candidates.map(column => (column.search ? { [column.search]: { contains: foldText(term) } } : { [column.field]: { contains: term, ...mode } })) });
  }

  function condition(filter: ServerFilter): Where {
    const { column, operator } = filter;
    const field = column.field;
    const value = column.type === 'date' && typeof filter.value === 'string' ? new Date(`${filter.value}T00:00:00.000Z`)
      : column.type === 'date' && Array.isArray(filter.value) ? filter.value.map(item => new Date(`${String(item)}T00:00:00.000Z`)) : filter.value;
    const day = column.type === 'datetime' && value instanceof Date && isMidnight(value);
    switch (operator) {
      case 'contains':
        return column.search ? { [column.search]: { contains: foldText(String(value)) } } : { [field]: { contains: String(value), ...mode } };
      case 'startsWith':
        return { [field]: { startsWith: String(value), ...mode } };
      case 'eq':
        return day ? { [field]: { gte: value, lt: nextDay(value as Date) } } : { [field]: { equals: value } };
      case 'gt':
        return day ? { [field]: { gte: nextDay(value as Date) } } : { [field]: { gt: value } };
      case 'gte':
        return { [field]: { gte: value } };
      case 'lt':
        return { [field]: { lt: value } };
      case 'lte':
        return day ? { [field]: { lt: nextDay(value as Date) } } : { [field]: { lte: value } };
      case 'between': {
        const [low, high] = value as [unknown, unknown];
        return column.type === 'datetime' && high instanceof Date && isMidnight(high)
          ? { [field]: { gte: low, lt: nextDay(high) } }
          : { [field]: { gte: low, lte: high } };
      }
      case 'in':
        return { [field]: { in: value } };
      case 'empty':
        return column.type === 'text' ? { OR: [{ [field]: null }, { [field]: '' }] } : { [field]: null };
      case 'notEmpty':
        return column.type === 'text' ? { AND: [{ NOT: { [field]: null } }, { NOT: { [field]: '' } }] } : { NOT: { [field]: null } };
    }
    throw new TypeError(`unknown operator ${String(operator)}`);
  }

  const orders = query.sorting.map(rule => ({ column: rule.column.field, direction: rule.direction }));
  if (!orders.some(order => order.column === key)) orders.push({ column: key, direction: orders.at(-1)?.direction ?? 'asc' });
  const signature = sortSignature(orders);
  const base = and.length === 0 ? {} : and.length === 1 ? and[0]! : { AND: and };
  let pageWhere: Where = base;
  if (query.cursorPaging && query.cursor !== undefined) {
    const after = decodeCursor(query.cursor, signature, orders.length);
    const first = orders[0]!;
    const nest = (index: number): Where => {
      const order = orders[index]!;
      const strict = { [order.column]: { [order.direction === 'desc' ? 'lt' : 'gt']: after[index] } };
      return index + 1 < orders.length ? { OR: [strict, { AND: [{ [order.column]: after[index] }, nest(index + 1)] }] } : strict;
    };
    pageWhere = { AND: [...and, { [first.column]: { [first.direction === 'desc' ? 'lte' : 'gte']: after[0] } }, nest(0)] };
  }
  return Object.freeze({
    findMany: {
      where: pageWhere,
      orderBy: orders.map(order => ({ [order.column]: order.direction })),
      take: query.cursorPaging ? query.pageSize + 1 : query.pageSize,
      ...(query.cursorPaging ? {} : { skip: (query.page - 1) * query.pageSize }),
    },
    count: { where: base },
    cursorOf: (row: Readonly<Record<string, unknown>>) => encodeCursor(signature, orders.map(order => {
      if (!(order.column in row)) throw new TypeError(`the row has no "${order.column}" for the cursor; select it`);
      return row[order.column];
    })),
  });
}
