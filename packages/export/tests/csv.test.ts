import { describe, expect, it } from 'vitest';
import { normalizeValue } from '@acunsoft/datatable-core';
import { ImportError, parseCsv, toCsv, type Sheet } from '../src/index';

const decimal = (text: string) => normalizeValue(text, 'decimal') as Sheet['rows'][number][number];
const sheet: Sheet = {
  headers: ['Müşteri', 'Tutar', 'Tarih', 'Zaman', 'Aktif', 'Not'],
  types: ['text', 'decimal', 'date', 'datetime', 'boolean', undefined],
  rows: [
    ['Ayşe, "VIP"', decimal('1250.50'), new Date(2026, 9, 23), new Date(2026, 9, 23, 14, 5, 9), true, 'satır1\nsatır2'],
    ['=HYPERLINK("http://evil")', -5, null, null, false, '@SUM(A1)'],
  ],
};

describe('toCsv', () => {
  it('writes RFC 4180 CSV with a BOM, quoting and exact machine-readable values', () => {
    expect(toCsv(sheet)).toBe('﻿' +
      'Müşteri,Tutar,Tarih,Zaman,Aktif,Not\r\n' +
      '"Ayşe, ""VIP""",1250.50,2026-10-23,2026-10-23 14:05:09,true,"satır1\nsatır2"\r\n' +
      '"\'=HYPERLINK(""http://evil"")",-5,,,false,\'@SUM(A1)\r\n');
  });

  it('guards text formulas but never numbers, and can be turned off', () => {
    const risky: Sheet = { headers: ['a', 'b', 'c', 'd'], rows: [['+1', '-x', '\tTAB', -1]] };
    expect(toCsv(risky, { bom: false, newline: '\n' })).toBe("a,b,c,d\n'+1,'-x,\"'\tTAB\",-1\n");
    expect(toCsv(risky, { bom: false, newline: '\n', guardFormulas: false })).toBe('a,b,c,d\n+1,-x,"\tTAB",-1\n');
  });

  it('uses another delimiter and validates input', () => {
    expect(toCsv({ headers: ['a', 'b'], rows: [['1;2', 'x']] }, { delimiter: ';', bom: false })).toBe('a;b\r\n"1;2";x\r\n');
    expect(() => toCsv({ headers: ['a'], rows: [['x', 'y']] })).toThrow('must have 1 cells');
    expect(() => toCsv(sheet, { delimiter: '|' as never })).toThrow('delimiter must be');
  });
});

describe('parseCsv', () => {
  it('reads what toCsv writes', () => {
    const back = parseCsv(toCsv(sheet, { guardFormulas: false }));
    expect(back.headers).toEqual(sheet.headers);
    expect(back.rows[0]).toEqual(['Ayşe, "VIP"', '1250.50', '2026-10-23', '2026-10-23 14:05:09', 'true', 'satır1\nsatır2']);
    expect(back.rows[1]![0]).toBe('=HYPERLINK("http://evil")');
  });

  it('detects ; and tab, handles every line ending and skips empty lines', () => {
    expect(parseCsv('a;b\r\n1;2\r\n\r\n3;4').rows).toEqual([['1', '2'], ['3', '4']]);
    expect(parseCsv('a\tb\n1\t2\n').rows).toEqual([['1', '2']]);
    expect(parseCsv('a,b\r1,2\r').rows).toEqual([['1', '2']]);
    expect(parseCsv('"x;y",z\n1,2').headers).toEqual(['x;y', 'z']); // quoted delimiters do not count
  });

  it('pads short rows, cuts long ones and keeps empty fields as empty text', () => {
    expect(parseCsv('a,b,c\n1\n1,2,3,4\n,,x').rows).toEqual([['1', null, null], ['1', '2', '3'], ['', '', 'x']]);
  });

  it('reports broken files and limits', () => {
    expect(() => parseCsv('a,b\n"open,1')).toThrow(ImportError);
    expect(() => parseCsv('a,b\n"open,1')).toThrow('a quoted field is not closed (line 2)');
    expect(() => parseCsv('a\n1\n2\n3', { maxRows: 2 })).toThrow('more than 2 rows');
    expect(() => parseCsv('a,b,c', { maxColumns: 2 })).toThrow('more than 2 columns');
    expect(() => parseCsv(42 as never)).toThrow('CSV input must be a string');
    expect(parseCsv('')).toEqual({ headers: [], rows: [] });
  });
});
