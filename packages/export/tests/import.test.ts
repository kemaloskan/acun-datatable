import { describe, expect, it } from 'vitest';
import type { ColumnDef } from '@acunsoft/datatable-core';
import { importRows, parseCsv } from '../src/index';

type Order = { id: number; customer: string; total: string; day: string; at: string; active: boolean; qty: number };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Müşteri', accessorKey: 'customer', type: 'text' },
  { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal' },
  { id: 'day', header: 'Tarih', accessorKey: 'day', type: 'date' },
  { id: 'at', header: 'Zaman', accessorKey: 'at', type: 'datetime' },
  { id: 'active', header: 'Aktif', accessorKey: 'active', type: 'boolean' },
  { id: 'qty', header: 'Adet', accessorKey: 'qty', type: 'number' },
];

describe('importRows', () => {
  it('matches headers insensitively and reads Turkish-formatted values', () => {
    const sheet = parseCsv('MUSTERI;tutar;TARİH;Zaman;aktif;Adet;Fazla\n' +
      'Ayşe;1.234,50;23.10.2026;23.10.2026 14:05;Evet;1.000\n' +
      ' Ali ;0,10;2026-10-22;2026-10-22T09:00:00;hayır;\n');
    const result = importRows(sheet, columns, { decimalSeparator: ',' });
    expect(result.errors).toEqual([]);
    expect(result.ignoredHeaders).toEqual(['Fazla']);
    expect(result.rows).toEqual([
      { line: 2, values: { customer: 'Ayşe', total: '1234.50', day: new Date(2026, 9, 23), at: new Date(2026, 9, 23, 14, 5), active: true, qty: 1000 } },
      { line: 3, values: { customer: 'Ali', total: '0.10', day: new Date(2026, 9, 22), at: new Date(2026, 9, 22, 9), active: false, qty: null } },
    ]);
  });

  it('reports every invalid value with its line and keeps only valid rows', () => {
    const sheet = parseCsv('Müşteri,Tutar,Tarih,Aktif,Adet\n' +
      'A,12.5,31.02.2026,belki,3\n' +
      'B,"1,5",2026-10-23,1,1e400\n' +
      'C,"1,234.5",10/23/2026,0,7\n');
    const result = importRows(sheet, columns);
    expect(result.rows).toEqual([]);
    expect(result.errors.map(error => [error.line, error.column, error.value])).toEqual([
      [2, 'day', '31.02.2026'], [2, 'active', 'belki'],
      [3, 'total', '1,5'], [3, 'qty', '1e400'],
      [4, 'day', '10/23/2026'],
    ]);
    expect(result.errors[0]!.message).toBe('not a valid date value');
    expect(importRows(sheet, columns, { dateOrder: 'mdy' }).rows.map(row => row.line)).toEqual([4]);
  });

  it('checks required columns and values, aliases and duplicate headers', () => {
    const missing = importRows(parseCsv('Tutar\n5'), columns, { required: ['customer'] });
    expect(missing.rows).toEqual([]);
    expect(missing.errors).toEqual([{ line: 1, column: 'customer', value: '', message: 'required column is missing' }]);

    const result = importRows(parseCsv('Name,Amount,amount\nAyşe,5,6\n,7,8'), columns, {
      headers: { customer: 'Name', total: ['Amount'] }, required: ['customer'],
    });
    expect(result.rows).toEqual([{ line: 2, values: { customer: 'Ayşe', total: '5' } }]);
    expect(result.errors).toEqual([
      { line: 1, column: 'total', value: 'amount', message: 'column appears twice; the first one is used' },
      { line: 3, column: 'customer', value: '', message: 'required value is empty' },
    ]);
    expect(() => importRows(parseCsv('a\n1'), columns, { required: ['nope'] })).toThrow('unknown column ID: nope');
  });

  it('reads typed cells from xlsx directly and caps the error list', () => {
    const sheet = { headers: ['Tutar', 'Tarih', 'Aktif'], rows: [[1250.5, new Date(2026, 9, 23, 14, 5), true], ['x', 'y', 'z'], ['x', 'y', 'z']] };
    const result = importRows(sheet, columns, { maxErrors: 4 });
    expect(result.rows).toEqual([{ line: 2, values: { total: '1250.5', day: new Date(2026, 9, 23), active: true } }]);
    expect(result.errors).toHaveLength(4);
    expect(result.truncated).toBe(true);
  });

  it('never mutates the sheet and returns frozen results', () => {
    const sheet = parseCsv('Müşteri\nAyşe');
    const result = importRows(sheet, columns);
    expect(Object.isFrozen(result.rows[0]!.values)).toBe(true);
    expect(sheet.rows[0]).toEqual(['Ayşe']);
  });
});
