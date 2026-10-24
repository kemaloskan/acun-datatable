import { COLUMN_TYPES, type ColumnType } from '@acunsoft/datatable-core';

/** One column the API allows, by its ID in requests. */
export interface ServerColumnSpec {
  /** The SQL column: `total` or `orders.total`. Default: the ID. Never taken from a request. */
  readonly sql?: string;
  /** The Prisma field. Default: the ID. */
  readonly field?: string;
  /** Read and compare values as this type. Default `text`. */
  readonly type?: ColumnType;
  readonly sortable?: boolean;
  /**
   * The column may hold `NULL`. Cursor paging then also reaches the `NULL`
   * rows, in the database's own order (PostgreSQL: last when ascending;
   * MySQL, MariaDB, SQLite, SQL Server: first). Prisma sorts such a column
   * with explicit `nulls` (last when ascending) on every database.
   */
  readonly nullable?: boolean;
  /** May be used in `filters`. */
  readonly filterable?: boolean;
  /** Part of the global search. Default: filterable text columns. */
  readonly searchable?: boolean;
  /**
   * A folded copy of the column (lower case, accents removed: `ayse` for
   * `Ayşe`) to search instead, so search ignores case, accents and Turkish
   * letters and can use a plain or trigram index. The term is folded the
   * same way (`foldText`).
   */
  readonly search?: string;
}

export interface ServerColumn {
  readonly id: string;
  readonly sql: string;
  readonly field: string;
  readonly type: ColumnType;
  readonly sortable: boolean;
  readonly nullable: boolean;
  readonly filterable: boolean;
  readonly searchable: boolean;
  readonly search: string | undefined;
}

const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)?$/;
const ID = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/;

/** Check an SQL identifier written by the developer (`orders.total`); requests never supply one. */
export function checkIdentifier(name: string, what: string): string {
  if (typeof name !== 'string' || !IDENTIFIER.test(name)) throw new TypeError(`${what} "${String(name)}" must be a plain SQL identifier such as total or orders.total`);
  return name;
}

/**
 * The column allowlist of an endpoint: only these IDs may be sorted,
 * filtered or searched, and only their SQL names reach the SQL text.
 */
export function defineColumns(spec: Readonly<Record<string, ServerColumnSpec>>): readonly ServerColumn[] {
  if (!spec || typeof spec !== 'object') throw new TypeError('defineColumns needs an object of columns');
  return Object.freeze(Object.entries(spec).map(([id, column]) => {
    if (!ID.test(id)) throw new TypeError(`column ID "${id}" must start with a letter and use letters, digits, _ . -`);
    const type = column.type ?? 'text';
    if (!COLUMN_TYPES.includes(type)) throw new TypeError(`column "${id}".type must be one of ${COLUMN_TYPES.join(', ')}`);
    const filterable = column.filterable === true;
    return Object.freeze({
      id,
      sql: checkIdentifier(column.sql ?? id, `column "${id}".sql`),
      field: column.field ?? id,
      type,
      sortable: column.sortable === true,
      nullable: column.nullable === true,
      filterable,
      searchable: column.searchable ?? (filterable && type === 'text'),
      search: column.search === undefined ? undefined : checkIdentifier(column.search, `column "${id}".search`),
    });
  }));
}
