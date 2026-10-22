/**
 * Declared value type of a column. It tells sorting, filtering, search and
 * renderers how to read values that arrive as text, e.g. Laravel decimals
 * (`"1250.50"`) or ISO dates. Without a type, values are used as they are.
 */
export type ColumnType = 'text' | 'number' | 'decimal' | 'date' | 'datetime' | 'boolean';
export const COLUMN_TYPES: readonly ColumnType[] = Object.freeze(['text', 'number', 'decimal', 'date', 'datetime', 'boolean']);

/** An exact decimal, compared digit by digit (never through floating point). */
export interface DecimalValue {
  readonly kind: 'decimal';
  readonly sign: 1 | -1;
  /** Integer digits without leading zeros (`'0'` for zero). */
  readonly int: string;
  /** Fraction digits without trailing zeros. */
  readonly frac: string;
  /** Fraction digits as written (`"9.50"` → 2), for display. */
  readonly scale: number;
  /** The value as written, without a leading `+`. */
  readonly text: string;
}

const DECIMAL = /^([+-])?(\d+)(?:\.(\d+))?$/;
const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const plain = new Intl.NumberFormat('en-US', { useGrouping: false, maximumFractionDigits: 20 });
const pad = (value: number, size = 2): string => String(Math.abs(value)).padStart(size, '0');

/** True when a date is exactly local midnight, i.e. it names a calendar day. */
export function isLocalMidnight(date: Date): boolean {
  return date.getHours() === 0 && date.getMinutes() === 0 && date.getSeconds() === 0 && date.getMilliseconds() === 0;
}

/**
 * Write a date in local time so the calendar day never shifts: a local midnight
 * becomes `2026-10-23`, any other time `2026-10-23T14:05:00.000+03:00`
 * (`toISOString()` would turn a Turkish 23 October midnight into
 * `2026-10-22T21:00:00Z`).
 */
export function formatLocalDate(date: Date): string {
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  if (isLocalMidnight(date)) return day;
  const offset = -date.getTimezoneOffset();
  const zone = `${offset >= 0 ? '+' : '-'}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`;
  return `${day}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}${zone}`;
}

/** True for text such as `2026-10-23` (a calendar day without a time). */
export function isDateOnlyText(value: unknown): value is string {
  return typeof value === 'string' && DATE_ONLY.test(value.trim());
}

/** `null`, `undefined`, `NaN` and invalid dates are missing values. */
export function isMissing(value: unknown): boolean {
  return value == null || (typeof value === 'number' && Number.isNaN(value)) ||
    (value instanceof Date && Number.isNaN(value.getTime()));
}

export function isDecimal(value: unknown): value is DecimalValue {
  return typeof value === 'object' && value !== null && (value as { kind?: unknown }).kind === 'decimal';
}

function toDecimal(value: unknown): DecimalValue | undefined {
  let text: string;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return undefined;
    text = plain.format(value);
  } else if (typeof value === 'string') {
    text = value.trim();
  } else {
    return undefined;
  }
  const match = DECIMAL.exec(text);
  if (!match) return undefined;
  const int = match[2]!.replace(/^0+(?=\d)/, '');
  const written = match[3] ?? '';
  const frac = written.replace(/0+$/, '');
  const zero = int === '0' && frac === '';
  const sign: 1 | -1 = match[1] === '-' && !zero ? -1 : 1;
  return Object.freeze({
    kind: 'decimal', sign, int, frac, scale: written.length,
    text: `${sign < 0 ? '-' : ''}${int}${written ? `.${written}` : ''}`,
  });
}

function toDate(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === 'number') return Number.isFinite(value) ? new Date(value) : undefined;
  if (typeof value !== 'string') return undefined;
  const text = value.trim();
  const day = DATE_ONLY.exec(text);
  if (day) {
    // A calendar date means local midnight, like a date picker's value.
    const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])];
    const local = new Date(year, month - 1, date);
    return local.getFullYear() === year && local.getMonth() === month - 1 && local.getDate() === date ? local : undefined;
  }
  const time = Date.parse(text);
  return Number.isNaN(time) ? undefined : new Date(time);
}

const toDay = (value: unknown): Date | undefined => {
  const date = toDate(value);
  return date && new Date(date.getFullYear(), date.getMonth(), date.getDate());
};

/**
 * Read a value the way a column of `type` means it. Returns `undefined` for
 * missing values and for values that cannot be read as that type; without a
 * type the value is returned unchanged.
 *
 * - `date` is a calendar day: the time is dropped (local midnight), so
 *   `2026-10-23T14:05:00` is 23 October.
 * - `datetime` is an instant; a bare `2026-10-23` is local midnight.
 * - `number` text must be a finite number (`"1e400"` is not readable).
 * - `text` of a `Date` is written in local time (`formatLocalDate`).
 */
export function normalizeValue(value: unknown, type: ColumnType | undefined): unknown {
  if (isMissing(value)) return undefined;
  switch (type) {
    case undefined:
      return value;
    case 'text':
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
      if (value instanceof Date) return formatLocalDate(value);
      return undefined;
    case 'number': {
      if (typeof value === 'number') return value;
      if (typeof value !== 'string' || !NUMBER.test(value.trim())) return undefined;
      const parsed = Number(value.trim());
      return Number.isFinite(parsed) ? parsed : undefined; // "1e400" overflows to Infinity
    }
    case 'decimal':
      return toDecimal(value);
    case 'date':
      return toDay(value);
    case 'datetime':
      return toDate(value);
    case 'boolean':
      if (typeof value === 'boolean') return value;
      if (value === 1 || value === 0) return value === 1;
      if (typeof value === 'string') {
        const text = value.trim().toLowerCase();
        if (text === 'true' || text === '1') return true;
        if (text === 'false' || text === '0') return false;
      }
      return undefined;
  }
}

export function compareDecimal(left: DecimalValue, right: DecimalValue): number {
  if (left.sign !== right.sign) return left.sign < right.sign ? -1 : 1;
  let magnitude = left.int.length - right.int.length;
  if (magnitude === 0) magnitude = left.int < right.int ? -1 : left.int > right.int ? 1 : 0;
  if (magnitude === 0) {
    const length = Math.max(left.frac.length, right.frac.length);
    const a = left.frac.padEnd(length, '0');
    const b = right.frac.padEnd(length, '0');
    magnitude = a < b ? -1 : a > b ? 1 : 0;
  }
  return magnitude === 0 ? 0 : left.sign * Math.sign(magnitude);
}

/** Compare two values already normalized for the same column type. */
export function compareNormalized(left: unknown, right: unknown, type: ColumnType, collator: Intl.Collator): number {
  switch (type) {
    case 'text':
      return collator.compare(left as string, right as string);
    case 'number': {
      const a = left as number;
      const b = right as number;
      return a < b ? -1 : a > b ? 1 : 0;
    }
    case 'decimal':
      return compareDecimal(left as DecimalValue, right as DecimalValue);
    case 'date':
    case 'datetime':
      return Math.sign((left as Date).getTime() - (right as Date).getTime());
    case 'boolean':
      return left === right ? 0 : left ? 1 : -1;
  }
}

/**
 * Fold text for searching: case-insensitive, accent-insensitive and
 * Turkish-aware in every locale (`İ`, `I`, `ı` and `i` all match `i`; `ş`→`s`,
 * `ğ`→`g`, `ç`→`c`, `ö`→`o`, `ü`→`u`). Used only for matching, never for
 * sorting, which keeps the locale's own order.
 */
export function foldText(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/ı/g, 'i');
}
