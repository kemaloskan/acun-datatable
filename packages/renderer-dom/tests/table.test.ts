import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { labelsTr, renderTable } from '../src/index';

type Order = { id: number; customer: string; total: number; createdAt?: Date; note?: unknown };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
  { id: 'total', header: 'Total', accessorKey: 'total', enableSorting: true },
  { id: 'note', header: 'Note', accessorKey: 'note' },
];
const orders: Order[] = [
  { id: 1, customer: 'Ayşe', total: 1250.5 },
  { id: 2, customer: 'Ali', total: 90 },
  { id: 3, customer: 'Can', total: 400 },
];
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
const make = (overrides = {}) => createDataTable<Order>({ data: orders, columns, ...overrides });
const cells = (row = 0) => [...host.querySelectorAll('tbody tr')[row]!.querySelectorAll('td')].map(td => td.textContent);
const headers = () => [...host.querySelectorAll('thead th')];
const sortButton = (name: string) => [...host.querySelectorAll<HTMLButtonElement>('th button')]
  .find(button => button.firstChild?.textContent === name)!;

describe('renderTable structure', () => {
  it('renders a semantic table with caption, column headers and rows', () => {
    renderTable(host, make(), { caption: 'Orders' });
    expect(host.querySelector('table caption')!.textContent).toBe('Orders');
    expect(headers().map(th => th.getAttribute('scope'))).toEqual(['col', 'col', 'col']);
    expect(headers().map(th => th.textContent)).toEqual(['Customer', 'Total', 'Note']);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(3);
    expect(cells(0)).toEqual(['Ayşe', '1,250.5', '']);
  });

  it('uses locale-aware default text and custom string formatters', () => {
    const data = [{ id: 1, customer: 'A', total: 1250.5, createdAt: new Date('2025-03-01T12:00:00Z'), note: NaN }];
    const dateColumns: ColumnDef<Order>[] = [...columns, { id: 'createdAt', header: 'Date', accessorKey: 'createdAt' }];
    renderTable(host, createDataTable<Order>({ data, columns: dateColumns }), {
      locale: 'tr', format: { customer: (value, row) => `${String(value)} #${row.id}` },
    });
    expect(cells(0)).toEqual(['A #1', '1.250,5', '', '1 Mar 2025']);
  });

  it('shows an empty state spanning all columns', () => {
    renderTable(host, make({ data: [] }), { selectable: true, labels: labelsTr });
    const td = host.querySelector('tbody tr.adt-empty td')!;
    expect(td.textContent).toBe('Eşleşen kayıt yok');
    expect(td.getAttribute('colspan')).toBe('4');
    expect(host.querySelector('thead input')).toBeNull(); // nothing to select
  });

  it('renders the current page only and follows table changes', () => {
    const table = make({ initialState: { pageSize: 2 } });
    renderTable(host, table);
    expect(host.querySelectorAll('tbody tr')).toHaveLength(2);
    table.setPage(2);
    expect(cells(0)[0]).toBe('Can');
    table.setGlobalSearch('ali');
    expect(host.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(cells(0)[0]).toBe('Ali');
  });

  it('works with a server-mode table', () => {
    const table = createDataTable<Order>({ mode: 'server', columns, initialState: { pageSize: 2 } });
    renderTable(host, table);
    expect(host.querySelector('tbody tr.adt-empty')).not.toBeNull();
    table.setPageResult({ rows: [orders[2]!, orders[0]!], totalRows: 3 });
    expect(cells(0)[0]).toBe('Can');
  });
});

describe('renderTable sorting', () => {
  it('cycles ascending → descending → none and sets aria-sort on the header', () => {
    const table = make();
    renderTable(host, table);
    const th = () => sortButton('Total').closest('th')!;
    expect(th().hasAttribute('aria-sort')).toBe(false);
    sortButton('Total').click();
    expect(table.getState().sorting).toEqual([{ field: 'total', direction: 'asc' }]);
    expect(th().getAttribute('aria-sort')).toBe('ascending');
    expect(cells(0)[0]).toBe('Ali');
    sortButton('Total').click();
    expect(th().getAttribute('aria-sort')).toBe('descending');
    sortButton('Total').click();
    expect(table.getState().sorting).toEqual([]);
    expect(th().hasAttribute('aria-sort')).toBe(false);
  });

  it('adds a secondary sort with Shift and marks only the primary header', () => {
    const table = make();
    renderTable(host, table);
    sortButton('Total').click();
    sortButton('Customer').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(table.getState().sorting).toEqual([{ field: 'total', direction: 'asc' }, { field: 'customer', direction: 'asc' }]);
    expect(headers().filter(th => th.hasAttribute('aria-sort')).map(th => th.textContent)).toEqual(['Total▲1']);
    expect(sortButton('Customer').querySelector('.adt-sort-mark')!.getAttribute('aria-hidden')).toBe('true');
    sortButton('Customer').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    sortButton('Customer').dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(table.getState().sorting).toEqual([{ field: 'total', direction: 'asc' }]);
  });

  it('renders non-sortable headers as plain text and sortable ones as buttons', () => {
    renderTable(host, make());
    expect(headers()[2]!.querySelector('button')).toBeNull();
    expect(sortButton('Customer').getAttribute('type')).toBe('button');
  });

  it('keeps keyboard focus on the sort button after re-rendering', () => {
    renderTable(host, make());
    sortButton('Total').focus();
    sortButton('Total').click();
    expect(document.activeElement).toBe(sortButton('Total'));
    expect(document.activeElement).toBeInstanceOf(HTMLButtonElement);
  });
});

describe('renderTable selection', () => {
  it('toggles rows and drives the tri-state header checkbox for the page', () => {
    const table = make({ initialState: { pageSize: 2 } });
    renderTable(host, table, { selectable: true });
    const all = () => host.querySelector<HTMLInputElement>('thead input[type=checkbox]')!;
    const row = (index: number) => host.querySelectorAll<HTMLInputElement>('tbody input[type=checkbox]')[index]!;
    expect(all().getAttribute('aria-label')).toBe('Select all rows on this page');
    expect(row(0).getAttribute('aria-label')).toBe('Select row 1');

    row(0).click();
    expect(table.getState().selectedIds).toEqual(['1']);
    expect(all().indeterminate).toBe(true);
    expect(host.querySelector('tbody tr')!.classList.contains('adt-row--selected')).toBe(true);

    all().click();
    expect(table.getState().selectedIds).toEqual(['1', '2']);
    expect(all().checked).toBe(true);
    table.setPage(2);
    expect(all().checked).toBe(false); // page 2 has nothing selected
    table.setPage(1);
    all().click(); // deselect this page only
    expect(table.getState().selectedIds).toEqual([]);
  });

  it('keeps focus on a row checkbox and omits select-all in single mode', () => {
    const table = make({ selectionMode: 'single' });
    renderTable(host, table, { selectable: true });
    expect(host.querySelector('thead input')).toBeNull();
    const box = () => host.querySelectorAll<HTMLInputElement>('tbody input')[1]!;
    box().focus();
    box().click();
    expect(document.activeElement).toBe(box());
    host.querySelectorAll<HTMLInputElement>('tbody input')[0]!.click();
    expect(table.getState().selectedIds).toEqual(['1']);
  });
});

describe('renderTable lifecycle and validation', () => {
  it('destroy removes the table and stops updates', () => {
    const table = make();
    const rendered = renderTable(host, table);
    rendered.destroy();
    expect(host.children).toHaveLength(0);
    table.setGlobalSearch('ali');
    expect(host.children).toHaveLength(0);
  });

  it('rejects bad arguments and non-string formatters', () => {
    expect(() => renderTable(null as never, make())).toThrow('container must be a DOM element');
    expect(() => renderTable(host, {} as never)).toThrow('table must be created with createDataTable');
    expect(() => renderTable(host, make(), { format: { nope: () => '' } })).toThrow('unknown format column ID: nope');
    expect(() => renderTable(host, make(), { format: { total: 'x' as never } })).toThrow('must be a function');
    expect(() => renderTable(host, make(), { format: { total: () => 5 as never } })).toThrow('must return a string');
  });

  it('does not call accessors for hidden rows', () => {
    const accessor = vi.fn((row: Readonly<Order>) => row.customer);
    const table = createDataTable<Order>({
      data: orders, columns: [{ id: 'c', header: 'C', accessorFn: accessor }], initialState: { pageSize: 1 },
    });
    renderTable(host, table);
    expect(accessor).toHaveBeenCalledTimes(1);
  });
});
