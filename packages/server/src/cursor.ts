import { TableQueryError } from './query';

/** A short, stable fingerprint of a sort, so a cursor is only used with the sort it was made for. */
export function sortSignature(orders: readonly { readonly column: string; readonly direction: string }[]): string {
  let hash = 0x811c9dc5;
  for (const char of JSON.stringify(orders)) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

const toBase64Url = (text: string): string => {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (text: string): string => {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
};

/** The cursor after a row: its sort values (and key), for this sort only. */
export function encodeCursor(signature: string, values: readonly unknown[]): string {
  // Dates travel as { d: ISO } and big integers as { b: digits }; both come back as they were,
  // so each driver binds them its own way.
  return toBase64Url(JSON.stringify({ s: signature, v: values.map(value => (value instanceof Date ? { d: value.toISOString() }
    : typeof value === 'bigint' ? { b: value.toString() } : value)) }));
}

/** The values a cursor carries, checked against the sort; throws `TableQueryError`. */
export function decodeCursor(cursor: string, signature: string, count: number): unknown[] {
  let decoded: { s?: unknown; v?: unknown };
  try {
    decoded = JSON.parse(fromBase64Url(cursor)) as { s?: unknown; v?: unknown };
  } catch {
    throw new TableQueryError('cursor', 'cursor must be the nextCursor of a previous page');
  }
  if (decoded?.s !== signature) throw new TableQueryError('cursor', 'cursor does not match the sort; start from the first page');
  const values = decoded.v;
  const isDate = (value: unknown): value is { d: string } => typeof value === 'object' && value !== null && typeof (value as { d?: unknown }).d === 'string'
    && !Number.isNaN(Date.parse((value as { d: string }).d));
  const isBig = (value: unknown): value is { b: string } => typeof value === 'object' && value !== null
    && typeof (value as { b?: unknown }).b === 'string' && /^-?\d{1,40}$/.test((value as { b: string }).b);
  if (!Array.isArray(values) || values.length !== count
    || !values.every(value => value === null || ['string', 'number', 'boolean'].includes(typeof value) || isDate(value) || isBig(value))) {
    throw new TableQueryError('cursor', 'cursor must be the nextCursor of a previous page');
  }
  return values.map(value => (isDate(value) ? new Date(value.d) : isBig(value) ? BigInt(value.b) : value));
}
