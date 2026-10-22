/** Supported column filter operators. */
export type FilterOperator = 'contains' | 'eq' | 'gt' | 'lt';
export const FILTER_OPERATORS: readonly FilterOperator[] = Object.freeze(['contains', 'eq', 'gt', 'lt']);

/** A single column filter. Every rule must match (logical AND). */
export interface FilterRule {
  readonly field: string;
  readonly operator: FilterOperator;
  readonly value: unknown;
}

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
  if (operator === 'contains') {
    if (typeof value !== 'string') throw new TypeError(`filter "${field}" contains value must be a string`);
    return;
  }
  const comparable = typeof value === 'string' ||
    (typeof value === 'number' && !Number.isNaN(value)) ||
    (value instanceof Date && !Number.isNaN(value.getTime()));
  if (comparable || (operator === 'eq' && typeof value === 'boolean')) return;
  throw new TypeError(operator === 'eq'
    ? `filter "${field}" eq value must be a string, number, boolean or valid Date`
    : `filter "${field}" ${operator} value must be a string, number or valid Date`);
}

/** A `contains` rule whose text is empty or only spaces constrains nothing. */
export function isNoOpRule(rule: FilterRule): boolean {
  return rule.operator === 'contains' && (rule.value as string).trim() === '';
}
