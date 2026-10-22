export type RowId = string;
export type RowIdValue = string | number;
export type GetRowId<TData> = (row: Readonly<TData>) => RowIdValue;

/** Frozen identity wrapper; original data stays caller-owned and is not cloned. */
export interface Row<TData> {
  readonly id: RowId;
  readonly original: Readonly<TData>;
}

export interface RowOptions<TData> {
  readonly getRowId: GetRowId<TData>;
}

function normalizeRowId(value: unknown, index: number): RowId {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw new TypeError(`row[${index}] ID must be a non-empty string or a safe integer`);
}

/** Default identity requires a statically known, required string/number id. */
export function createRows<TData extends { readonly id: RowIdValue }>(
  data: readonly TData[],
): readonly Row<TData>[];
export function createRows<TData>(
  data: readonly TData[], options: RowOptions<TData>,
): readonly Row<TData>[];
export function createRows<TData>(
  data: readonly TData[], options?: RowOptions<TData>,
): readonly Row<TData>[] {
  if (!Array.isArray(data)) throw new TypeError('rows must be an array');
  if (options !== undefined && (!options || typeof options.getRowId !== 'function')) {
    throw new TypeError('getRowId must be a function');
  }
  const ids = new Set<RowId>();
  const rows: Row<TData>[] = [];
  for (const [index, original] of data.entries()) {
    let value: unknown;
    if (options) {
      value = options.getRowId(original);
    } else {
      if (!original || typeof original !== 'object' || !Object.hasOwn(original, 'id')) {
        throw new TypeError(`row[${index}] requires an own id property or a getRowId callback`);
      }
      value = (original as { id: unknown }).id;
    }
    const id = normalizeRowId(value, index);
    if (ids.has(id)) throw new Error(`duplicate row ID: ${id}`);
    ids.add(id);
    rows.push(Object.freeze({ id, original }));
  }
  return Object.freeze(rows);
}
