import type { ColumnDef } from './columns';
import type { Row } from './rows';
import { compareNormalized, isDecimal, isMissing, normalizeValue, type DecimalValue } from './values';

const collator = new Intl.Collator(undefined, { numeric: true });
const compareValues = (left: unknown, right: unknown, type: ColumnDef<unknown>['type']): number | undefined => {
  if (type !== undefined) return compareNormalized(left, right, type, collator);
  if (typeof left === 'number' && typeof right === 'number') return Math.sign(left - right);
  if (typeof left === 'string' && typeof right === 'string') return collator.compare(left, right);
  return undefined;
};

/** A footer total of a column. */
export type Aggregate = 'sum' | 'avg' | 'min' | 'max' | 'count';
export const AGGREGATES: readonly Aggregate[] = Object.freeze(['sum', 'avg', 'min', 'max', 'count']);

/** One column's footer value: `count` is a number; the others are values of the column's type. */
export interface AggregateResult {
  readonly aggregate: Aggregate;
  readonly value: unknown;
}

const scaled = (value: DecimalValue, scale: number): bigint =>
  BigInt(value.sign) * BigInt(`${value.int}${value.frac.padEnd(scale, '0')}`);

const decimalText = (units: bigint, scale: number): string => {
  const negative = units < 0n;
  const digits = (negative ? -units : units).toString().padStart(scale + 1, '0');
  const text = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative ? `-${text}` : text;
};

/**
 * The footer totals of the columns with `aggregate`, over the given rows (the
 * rows matching the filters and search, not just a page). Decimal sums are
 * exact (no float rounding: `0.10 + 0.20` is `0.30`) and keep the largest
 * written scale; averages of decimals are rounded to that scale. Missing
 * values are skipped; `count` counts the values that are not missing.
 */
export function aggregateRows<TData>(rows: readonly Row<TData>[], columns: readonly ColumnDef<TData>[]): Readonly<Record<string, AggregateResult>> {
  const out: Record<string, AggregateResult> = {};
  for (const column of columns) {
    const aggregate = column.aggregate;
    if (aggregate === undefined) continue;
    const read = (row: Row<TData>): unknown => {
      const raw = column.accessorFn
        ? column.accessorFn(row.original)
        : (row.original as Record<PropertyKey, unknown>)[column.accessorKey as PropertyKey];
      return column.type === undefined ? raw : normalizeValue(raw, column.type);
    };
    const values = rows.map(read).filter(value => !isMissing(value) && value !== '');
    if (aggregate === 'count') {
      out[column.id] = Object.freeze({ aggregate, value: values.length });
      continue;
    }
    if (values.length === 0) {
      out[column.id] = Object.freeze({ aggregate, value: undefined });
      continue;
    }
    if (aggregate === 'min' || aggregate === 'max') {
      let best = values[0];
      for (const value of values.slice(1)) {
        const order = compareValues(value, best, column.type);
        if (order !== undefined && (aggregate === 'min' ? order < 0 : order > 0)) best = value;
      }
      out[column.id] = Object.freeze({ aggregate, value: best });
      continue;
    }
    // sum / avg: exact for decimals, plain numbers otherwise.
    if (values.every(isDecimal)) {
      const decimals = values as DecimalValue[];
      const scale = Math.max(...decimals.map(value => value.scale));
      const units = decimals.reduce((total, value) => total + scaled(value, scale), 0n);
      if (aggregate === 'sum') {
        out[column.id] = Object.freeze({ aggregate, value: normalizeValue(decimalText(units, scale), 'decimal') });
      } else {
        // Round half away from zero to the same scale.
        const count = BigInt(decimals.length);
        const doubled = (units * 2n) / count;
        const rounded = doubled >= 0n ? (doubled + 1n) / 2n : (doubled - 1n) / 2n;
        out[column.id] = Object.freeze({ aggregate, value: normalizeValue(decimalText(rounded, scale), 'decimal') });
      }
      continue;
    }
    const numbers = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    const sum = numbers.reduce((total, value) => total + value, 0);
    out[column.id] = Object.freeze({
      aggregate,
      value: numbers.length === 0 ? undefined : aggregate === 'sum' ? sum : sum / numbers.length,
    });
  }
  return Object.freeze(out);
}
