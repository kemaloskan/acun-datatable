// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createDataTable, isDecimal, type ColumnDef } from '@acunsoft/datatable-core';
import { tableToSheet } from '../src/index';

type Order = { id: number; customer: string; total: string; created: string; secret: string };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
  { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', enableSorting: true },
  { id: 'created', header: 'Tarih', accessorKey: 'created', type: 'date' },
  { id: 'secret', header: 'Gizli', accessorFn: row => row.secret.length },
];
const data: Order[] = [
  { id: 1, customer: 'Ayşe', total: '120.50', created: '2026-10-23', secret: 'abc' },
  { id: 2, customer: 'Ali', total: '80.00', created: 'not a date', secret: 'x' },
  { id: 3, customer: 'Can', total: '99.90', created: '2026-10-22', secret: '' },
];

describe('tableToSheet', () => {
  it('exports the filtered, sorted rows of visible columns with typed values', () => {
    const table = createDataTable<Order>({ data, columns, initialState: { pageSize: 1, hiddenColumns: ['secret'] } });
    table.setSorting([{ field: 'total', direction: 'desc' }]);
    table.setGlobalSearch('a'); // Ayşe, Ali, Can all contain "a"
    const sheet = tableToSheet(table);
    expect(sheet.headers).toEqual(['Müşteri', 'Tutar', 'Tarih']);
    expect(sheet.types).toEqual([undefined, 'decimal', 'date']);
    expect(sheet.rows.map(row => row[0])).toEqual(['Ayşe', 'Can', 'Ali']); // every page, in view order
    expect(isDecimal(sheet.rows[0]![1]) && (sheet.rows[0]![1] as { text: string }).text).toBe('120.50');
    expect(sheet.rows[0]![2]).toEqual(new Date(2026, 9, 23));
    expect(sheet.rows[2]![2]).toBe('not a date'); // unreadable values are kept as written
    expect(Object.isFrozen(sheet.rows[0])).toBe(true);
  });

  it('exports the page, the selection, all columns and custom values', () => {
    const table = createDataTable<Order>({ data, columns, initialState: { pageSize: 2, hiddenColumns: ['secret'] } });
    table.selectRows(['3', '1']);
    expect(tableToSheet(table, { rows: 'page' }).rows.map(row => row[0])).toEqual(['Ayşe', 'Ali']);
    expect(tableToSheet(table, { rows: 'selected' }).rows.map(row => row[0])).toEqual(['Ayşe', 'Can']);
    const all = tableToSheet(table, { columns: 'all', value: { secret: () => 'hidden', customer: value => String(value).toUpperCase() } });
    expect(all.headers).toEqual(['Müşteri', 'Tutar', 'Tarih', 'Gizli']);
    expect(all.rows[0]).toEqual(['AYŞE', expect.anything(), new Date(2026, 9, 23), 'hidden']);
  });

  it('validates options', () => {
    const table = createDataTable<Order>({ data, columns });
    expect(() => tableToSheet(table, { rows: 'some' as never })).toThrow('rows must be');
    expect(() => tableToSheet(table, { columns: 'few' as never })).toThrow('columns must be');
    expect(() => tableToSheet(table, { value: { nope: () => null } })).toThrow('unknown value column ID: nope');
  });
});

describe('package hygiene', () => {
  it('uses no DOM API: it runs in Node and in workers', () => {
    const dir = new URL('../src/', import.meta.url);
    for (const file of readdirSync(dir)) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      expect(source, file).not.toMatch(/\b(document|window|localStorage|XMLHttpRequest|DOMParser)\b/);
      expect(source, file).not.toMatch(/\beval\(|new Function\(/);
    }
  });
});
