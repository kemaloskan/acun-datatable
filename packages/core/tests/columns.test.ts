import { describe, expect, it } from 'vitest';
import { createColumns } from '../src/index';

describe('editable columns', () => {
  it('accepts true or options and freezes them', () => {
    const [plain, choice] = createColumns<{ id: number; a: string; b: string }>([
      { id: 'a', header: 'A', accessorKey: 'a', editable: true },
      { id: 'b', header: 'B', accessorKey: 'b', editable: { options: [{ value: 'x', label: 'X' }] } },
    ]);
    expect(plain!.editable).toBe(true);
    expect(Object.isFrozen((choice!.editable as { options: unknown[] }).options)).toBe(true);
    expect(() => createColumns<{ a: string }>([{ id: 'a', header: 'A', accessorKey: 'a', editable: 'yes' as never }])).toThrow('editable must be');
    expect(() => createColumns<{ a: string }>([{ id: 'a', header: 'A', accessorKey: 'a', editable: { options: [] } }])).toThrow('editable.options');
  });
});
