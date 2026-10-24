import { describe, expect, it } from 'vitest';
import { createDataTable, type ColumnDef } from '../src/index';

type R = { id: number; total: string; qty: number; at: string; note?: string };
const columns: readonly ColumnDef<R>[] = [
  { id: 'total', header: 'Total', accessorKey: 'total', type: 'decimal', enableFiltering: true, aggregate: 'sum' },
  { id: 'qty', header: 'Qty', accessorKey: 'qty', type: 'number', enableFiltering: true, aggregate: 'avg' },
  { id: 'at', header: 'At', accessorKey: 'at', type: 'date', aggregate: 'max' },
  { id: 'note', header: 'Note', accessorKey: 'note', aggregate: 'count' },
];
const data: R[] = [
  { id: 1, total: '0.10', qty: 1, at: '2026-10-01', note: 'a' },
  { id: 2, total: '0.20', qty: 2, at: '2026-10-30' },
  { id: 3, total: '100.005', qty: 6, at: '2026-10-15', note: '' },
];

describe('aggregates', () => {
  it('sum decimals exactly, average, max and count non-empty values over the matching rows', () => {
    const table = createDataTable<R>({ data, columns, initialState: { pageSize: 1 } });
    const totals = table.getAggregates();
    expect(totals['total']!.value).toMatchObject({ kind: 'decimal', text: '100.305', scale: 3 });
    expect(totals['qty']!.value).toBe(3);
    expect((totals['at']!.value as Date).getDate()).toBe(30);
    expect(totals['note']).toEqual({ aggregate: 'count', value: 1 });
    table.setFilters([{ field: 'qty', operator: 'lte', value: 2 }]);
    expect(table.getAggregates()['total']!.value).toMatchObject({ text: '0.30' }); // 0.10 + 0.20, no float error, scale kept
  });

  it('averages decimals to their scale and takes server totals in server mode', () => {
    const avg = createDataTable<R>({ data, columns: [{ id: 'total', header: 'T', accessorKey: 'total', type: 'decimal', aggregate: 'avg' }] });
    expect(avg.getAggregates()['total']!.value).toMatchObject({ text: '33.435' }); // 100.305 / 3
    const server = createDataTable<R>({ mode: 'server', columns });
    expect(server.getAggregates()).toEqual({});
    server.setPageResult({ rows: [], totalRows: 0, totals: { total: '12345.50', note: 7 } });
    expect(server.getAggregates()['total']!.value).toMatchObject({ kind: 'decimal', text: '12345.50', scale: 2 });
    expect(server.getAggregates()['note']).toEqual({ aggregate: 'count', value: 7 });
    expect(() => server.setPageResult({ rows: [], totals: { total: {} } as never })).toThrow('totals must be');
    expect(() => createDataTable<R>({ data, columns: [{ id: 'total', header: 'T', accessorKey: 'total', aggregate: 'median' as never }] })).toThrow('aggregate must be');
  });
});

describe('getAggregates', () => {
  it('computes once per set of matching rows', async () => {
    const { createDataTable } = await import('../src/index');
    const table = createDataTable({ data: [{ id: 1, n: 2 }, { id: 2, n: 3 }], columns: [{ id: 'n', header: 'N', accessorKey: 'n', type: 'number', aggregate: 'sum', enableFiltering: true }] });
    const first = table.getAggregates();
    expect(table.getAggregates()).toBe(first);
    table.setGlobalSearch('3');
    expect(table.getAggregates()).not.toBe(first);
    expect(table.getAggregates()['n']!.value).toBe(3);
  });
});
