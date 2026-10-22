// Regression tests for the issues reported in the October 2026 review.
import { describe, expect, it, vi } from 'vitest';
import {
  createColumns, createDataTable, createEmitter, createLocalRowModel, createRowSelection, createRows,
  createTableState, filterRows, normalizeValue, type ColumnDef, type ColumnType,
} from '../src/index';

type Item = { id: number; v: unknown };
const column = (type?: ColumnType): ColumnDef<Item>[] => [{
  id: 'v', header: '', accessorKey: 'v', enableFiltering: true, enableSorting: true, ...(type ? { type } : {}),
}];
const rowsOf = (values: unknown[]) => createRows<Item>(values.map((v, i) => ({ id: i + 1, v })));
const search = (values: unknown[], text: string, locale?: string, type?: ColumnType) =>
  filterRows(rowsOf(values), column(type), { globalSearch: text }, locale ? { locale } : {}).map(r => r.original.v);
const sortedValues = (values: unknown[], direction: 'asc' | 'desc', type?: ColumnType, locale = 'tr') =>
  createLocalRowModel(rowsOf(values), column(type), { locale }).getSortedRows([{ field: 'v', direction }]).map(r => r.original.v);

describe('1a · Turkish search', () => {
  it('finds upper-case Turkish text in every locale', () => {
    expect(search(['ISPARTA'], 'isparta', 'tr')).toEqual(['ISPARTA']);
    expect(search(['İSTANBUL'], 'istanbul')).toEqual(['İSTANBUL']);
    expect(search(['İSTANBUL'], 'İstanbul', 'en')).toEqual(['İSTANBUL']);
  });

  it('matches without Turkish characters', () => {
    expect(search(['Ayşe'], 'ayse', 'tr')).toEqual(['Ayşe']);
    expect(search(['Iğdır'], 'igdir', 'tr')).toEqual(['Iğdır']);
    expect(search(['Çanakkale', 'Göreme', 'Üsküdar'], 'canakkale')).toEqual(['Çanakkale']);
    expect(search(['Çanakkale', 'Göreme', 'Üsküdar'], 'USKUDAR')).toEqual(['Üsküdar']);
  });

  it('keeps the Turkish alphabetical order for sorting', () => {
    expect(sortedValues(['ş', 's', 'ı', 'i', 'ğ', 'g', 'ç', 'c'], 'asc')).toEqual(['c', 'ç', 'g', 'ğ', 'ı', 'i', 's', 'ş']);
  });
});

describe('1b · numbers sent as text and natural order', () => {
  it('sorts Laravel decimals as numbers with a decimal column type', () => {
    expect(sortedValues(['9.50', '100.00', '25.00'], 'desc', 'decimal')).toEqual(['100.00', '25.00', '9.50']);
    // Without a type, natural text order handles whole numbers but not fractions (5 < 25):
    expect(sortedValues(['1.5', '1.25'], 'asc')).toEqual(['1.5', '1.25']);
    expect(sortedValues(['1.5', '1.25'], 'asc', 'decimal')).toEqual(['1.25', '1.5']);
  });

  it('filters Laravel decimals numerically', () => {
    const rows = rowsOf(['9.50', '100.00', '50.00']);
    const gt = (value: unknown) => filterRows(rows, column('decimal'), { filters: [{ field: 'v', operator: 'gt', value }] }).map(r => r.original.v);
    expect(gt(50)).toEqual(['100.00']);
    expect(gt('50.0')).toEqual(['100.00']);
    expect(filterRows(rows, column('decimal'), { filters: [{ field: 'v', operator: 'eq', value: 50 }] }).map(r => r.original.v)).toEqual(['50.00']);
  });

  it('compares decimals exactly, beyond floating-point precision', () => {
    const big = ['9007199254740993.10', '9007199254740993.09', '-0.00', '0'];
    expect(sortedValues(big, 'asc', 'decimal')).toEqual(['-0.00', '0', '9007199254740993.09', '9007199254740993.10']);
  });

  it('sorts text naturally: "Ürün 2" before "Ürün 10"', () => {
    expect(sortedValues(['Ürün 10', 'Ürün 2', 'Ürün 1'], 'asc')).toEqual(['Ürün 1', 'Ürün 2', 'Ürün 10']);
    const plain = createLocalRowModel(rowsOf(['Ürün 10', 'Ürün 2']), column(), { locale: 'tr', numeric: false });
    expect(plain.getSortedRows([{ field: 'v', direction: 'asc' }]).map(r => r.original.v)).toEqual(['Ürün 10', 'Ürün 2']);
  });

  it('reads number, date and boolean text by column type', () => {
    expect(sortedValues(['10', '2', 'x', '1e3'], 'asc', 'number')).toEqual(['2', '10', '1e3', 'x']); // unreadable sorts last
    expect(sortedValues(['2026-10-23', '2025-01-01', 'soon'], 'asc', 'date')).toEqual(['2025-01-01', '2026-10-23', 'soon']);
    expect(sortedValues(['true', 'false', '1', '0'], 'asc', 'boolean')).toEqual(['false', '0', 'true', '1']);
    const dates = rowsOf(['2026-10-23', '2026-10-22']);
    expect(filterRows(dates, column('date'), { filters: [{ field: 'v', operator: 'eq', value: new Date(2026, 9, 23) }] })
      .map(r => r.original.v)).toEqual(['2026-10-23']);
  });
});

describe('1c · search finds numbers, dates and booleans as people type them', () => {
  it('finds 1234.5 by "1234,5", "1.234" and "1234.5" in Turkish', () => {
    for (const text of ['1234,5', '1.234', '1.234,5', '1234.5']) expect(search([1234.5], text, 'tr')).toEqual([1234.5]);
    expect(search(['1250.50'], '1.250,50', 'tr', 'decimal')).toEqual(['1250.50']);
  });

  it('searches dates and booleans', () => {
    const date = new Date(2026, 9, 23);
    expect(search([date], '23.10.2026', 'tr')).toEqual([date]);
    expect(search([date], '2026-10-23')).toEqual([date]);
    expect(search([true, false], 'evet', 'tr')).toEqual([true]);
    expect(search([true, false], 'no')).toEqual([false]);
  });
});

describe('1e · event order and failing listeners', () => {
  it('delivers events in order when a listener changes the table', () => {
    const table = createDataTable({ data: [{ id: 1 }], columns: [], initialState: { pageSize: 5 } });
    const seen: string[] = [];
    let first = true;
    table.subscribe((_, event) => {
      seen.push(`A:${event.type}`);
      if (first) { first = false; table.setPageSize(10); }
    });
    table.subscribe((state, event) => seen.push(`B:${event.type}/${state.pageSize}`));
    table.setGlobalSearch('x');
    expect(seen).toEqual(['A:globalSearch', 'B:globalSearch/5', 'A:pageSize', 'B:pageSize/10']);
  });

  it('keeps notifying other listeners when one throws, and the action still succeeds', () => {
    for (const make of [
      (onListenerError: (e: unknown) => void) => { const t = createDataTable({ data: [{ id: 1 }], columns: [], onListenerError }); return { sub: t.subscribe, act: () => t.setGlobalSearch('y'), done: () => t.getState().globalSearch === 'y' }; },
      (onListenerError: (e: unknown) => void) => { const s = createTableState({ onListenerError }); return { sub: s.subscribe, act: () => s.setPage(2), done: () => s.getState().page === 2 }; },
      (onListenerError: (e: unknown) => void) => { const s = createRowSelection({ onListenerError }); return { sub: s.subscribe, act: () => s.select('1'), done: () => s.isSelected('1') }; },
    ]) {
      const errors: unknown[] = [];
      const { sub, act, done } = make(error => errors.push(error));
      const reached = vi.fn();
      sub(() => { throw new Error('boom'); });
      sub(reached);
      expect(act).not.toThrow();
      expect(done()).toBe(true);
      expect(reached).toHaveBeenCalledTimes(1);
      expect(errors).toEqual([new Error('boom')]);
    }
  });

  it('reports each failure through the platform by default', () => {
    const original = (globalThis as { reportError?: unknown }).reportError;
    const report = vi.fn();
    (globalThis as { reportError?: unknown }).reportError = report;
    try {
      const emitter = createEmitter<[number]>();
      emitter.subscribe(() => { throw new Error('a'); });
      emitter.subscribe(() => { throw new Error('b'); });
      expect(() => emitter.emit(1)).not.toThrow();
      expect(report.mock.calls.map(([error]) => (error as Error).message)).toEqual(['a', 'b']);
    } finally {
      (globalThis as { reportError?: unknown }).reportError = original;
    }
  });
});

describe('second review · server mode and listener errors', () => {
  it('clamps the page before listeners hear about a result', () => {
    const table = createDataTable<{ id: number }>({ mode: 'server', columns: [], initialState: { page: 5, pageSize: 10 } });
    const seen: string[] = [];
    table.subscribe((state, event) => seen.push(`${event.type}:${state.page}/${table.getPage().pageCount}`));
    table.setPageResult({ rows: [], totalRows: 15 });
    expect(seen).toEqual(['result:2/2', 'page:2/2']);
  });

  it('still clamps and emits the page event when a listener throws', () => {
    const errors: unknown[] = [];
    const table = createDataTable<{ id: number }>({ mode: 'server', columns: [], initialState: { page: 5, pageSize: 10 }, onListenerError: e => errors.push(e) });
    const events: string[] = [];
    table.subscribe(() => { throw new Error('ui bug'); });
    table.subscribe((_, event) => events.push(event.type));
    expect(() => table.setPageResult({ rows: [], totalRows: 15 })).not.toThrow();
    expect(table.getState().page).toBe(2);
    expect(events).toEqual(['result', 'page']);
    expect(errors).toHaveLength(2);
  });

  it('rejects an invalid onListenerError option', () => {
    expect(() => createTableState({ onListenerError: 'x' as never })).toThrow('onListenerError must be a function');
  });
});

describe('column types: validation', () => {
  it('rejects unknown types and filter values a typed column cannot read', () => {
    expect(() => createColumns<Item>([{ id: 'v', header: '', accessorKey: 'v', type: 'money' as never }])).toThrow('type must be one of');
    expect(() => filterRows(rowsOf([]), column('number'), { filters: [{ field: 'v', operator: 'gt', value: 'abc' }] }))
      .toThrow('value is not a valid number');
    expect(() => filterRows(rowsOf([]), column('boolean'), { filters: [{ field: 'v', operator: 'gt', value: 'true' }] }))
      .toThrow('gt is not supported for boolean columns');
  });

  it('exposes normalizeValue for renderers and adapters', () => {
    expect(normalizeValue('12.50', 'decimal')).toMatchObject({ kind: 'decimal', int: '12', frac: '5', scale: 2 });
    expect(normalizeValue('2026-02-30', 'date')).toBeUndefined();
    expect(normalizeValue(' 42 ', 'number')).toBe(42);
    expect(normalizeValue('0x10', 'number')).toBeUndefined();
    expect(normalizeValue(null, 'text')).toBeUndefined();
  });
});
