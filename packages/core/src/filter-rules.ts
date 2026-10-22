/**
 * Supported column filter operators.
 *
 * - `contains`, `startsWith`: text, case-/accent-/Turkish-insensitive.
 * - `eq`, `gt`, `lt`: one value of the column's type.
 * - `between`: `[min, max]`, both ends included.
 * - `in`: a non-empty list; matches any of its values.
 * - `empty`, `notEmpty`: no value; missing values and blank text are empty.
 */
export type FilterOperator = 'contains' | 'startsWith' | 'eq' | 'gt' | 'lt' | 'between' | 'in' | 'empty' | 'notEmpty';
export const FILTER_OPERATORS: readonly FilterOperator[] = Object.freeze([
  'contains', 'startsWith', 'eq', 'gt', 'lt', 'between', 'in', 'empty', 'notEmpty',
]);
/** Largest list an `in` rule may hold. */
export const MAX_IN_VALUES = 1000;

/** A single column filter. Every rule must match (logical AND). */
export interface FilterRule {
  readonly field: string;
  readonly operator: FilterOperator;
  /** Absent for `empty` / `notEmpty`; `[min, max]` for `between`; a list for `in`. */
  readonly value?: unknown;
}

const isComparable = (value: unknown): boolean =>
  typeof value === 'string' ||
  (typeof value === 'number' && !Number.isNaN(value)) ||
  (value instanceof Date && !Number.isNaN(value.getTime()));

/**
 * Structural checks shared by local filtering and remote queries, so a rule
 * that is rejected locally is never sent to a server either.
 */
export function checkFilterRule(rule: unknown, label: string): asserts rule is FilterRule {
  const candidate = rule as Partial<FilterRule> | null;
  if (!candidate || typeof candidate.field !== 'string' || candidate.field.trim().length === 0) {
    throw new TypeError(`${label} field must be a non-empty column ID`);
  }
  const { field, operator, value } = candidate;
  if (!FILTER_OPERATORS.includes(operator as FilterOperator)) {
    throw new TypeError(`filter operator for "${field}" must be one of ${FILTER_OPERATORS.join(', ')}`);
  }
  switch (operator) {
    case 'contains':
    case 'startsWith':
      if (typeof value !== 'string') throw new TypeError(`filter "${field}" ${operator} value must be a string`);
      return;
    case 'eq':
      if (isComparable(value) || typeof value === 'boolean') return;
      throw new TypeError(`filter "${field}" eq value must be a string, number, boolean or valid Date`);
    case 'gt':
    case 'lt':
      if (isComparable(value)) return;
      throw new TypeError(`filter "${field}" ${operator} value must be a string, number or valid Date`);
    case 'between':
      if (Array.isArray(value) && value.length === 2 && value.every(isComparable)) return;
      throw new TypeError(`filter "${field}" between value must be [min, max] of strings, numbers or valid Dates`);
    case 'in':
      if (!Array.isArray(value) || value.length === 0 || !value.every(item => isComparable(item) || typeof item === 'boolean')) {
        throw new TypeError(`filter "${field}" in value must be a non-empty list of strings, numbers, booleans or valid Dates`);
      }
      if (value.length > MAX_IN_VALUES) throw new RangeError(`filter "${field}" in value may hold at most ${MAX_IN_VALUES} items`);
      return;
    case 'empty':
    case 'notEmpty':
      if (value !== undefined) throw new TypeError(`filter "${field}" ${operator} takes no value`);
      return;
  }
}

/** A `contains` / `startsWith` rule whose text is empty or only spaces constrains nothing. */
export function isNoOpRule(rule: FilterRule): boolean {
  return (rule.operator === 'contains' || rule.operator === 'startsWith') && (rule.value as string).trim() === '';
}

/** Copy a rule's value so callers cannot change it later; lists are frozen copies. */
export function copyRuleValue(value: unknown): unknown {
  return Array.isArray(value) ? Object.freeze([...value]) : value;
}

/**
 * Split global search text the way DataTables' "smart" search does: words are
 * separate terms that may match in different columns; a quoted phrase is one
 * term. Terms are trimmed; empty terms are dropped.
 */
export function splitSearchTerms(text: string): string[] {
  const terms: string[] = [];
  const pattern = /"([^"]*)"?|(\S+)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const term = (match[1] ?? match[2] ?? '').trim();
    if (term !== '') terms.push(term);
  }
  return terms;
}
