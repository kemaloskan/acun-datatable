// Compiled by npm run check; this function is intentionally never executed.
import { expectTypeOf } from 'vitest';
import { createRowSelection, type RowId, type SelectionChange, type SelectionStatus } from '../src/index';

export function verifySelectionTypes(): void {
  const selection = createRowSelection({ mode: 'single' });
  expectTypeOf(selection.getState().selectedIds).toEqualTypeOf<readonly RowId[]>();
  expectTypeOf(selection.getStatus([])).toEqualTypeOf<SelectionStatus>();
  selection.subscribe((state, change) => {
    expectTypeOf(change).toEqualTypeOf<Readonly<SelectionChange>>();
    // @ts-expect-error snapshots are readonly
    state.selectedIds.push('1');
  });
  // @ts-expect-error row IDs are strings (use Row.id)
  selection.select(1);
  // @ts-expect-error unknown mode
  createRowSelection({ mode: 'many' });
}
