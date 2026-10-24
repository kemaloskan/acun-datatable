import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { checkFixedColumns, pinColumns, renderTable } from '../src/index';

type Order = { id: number; customer: string; city: string; total: number };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true },
  { id: 'city', header: 'City', accessorKey: 'city' },
  { id: 'total', header: 'Total', accessorKey: 'total', type: 'number' },
];
const data: Order[] = [{ id: 1, customer: 'Ayşe', city: 'İzmir', total: 10 }, { id: 2, customer: 'Ali', city: 'Ankara', total: 20 }];
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
  // jsdom has no layout: every cell is 100px wide.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return { width: /^T[HD]$/.test(this.tagName) ? 100 : 2000 } as DOMRect; });
});
const pinned = (row: Element) => [...row.children].map(cell => {
  const td = cell as HTMLElement;
  return td.classList.contains('adt-pin') ? `${td.style.left ? `L${td.style.left}` : ''}${td.style.right ? `R${td.style.right}` : ''}` : '-';
});

describe('fixed columns', () => {
  it('pins the control cells with the start columns and the last cells, measured from the header', async () => {
    const table = createDataTable<Order>({ data, columns });
    renderTable(host, table, { selectable: true, fixedColumns: { start: 1, end: 2 }, rowActions: [{ id: 'edit', label: 'Edit', onSelect: () => undefined }] });
    expect(pinned(host.querySelector('thead tr')!)).toEqual(['L0px', 'L100px', '-', 'R100px', 'R0px']);
    expect(pinned(host.querySelector('tbody tr')!)).toEqual(['L0px', 'L100px', '-', 'R100px', 'R0px']);
    expect(host.querySelector('thead tr')!.children[1]!.classList.contains('adt-pin--edge-start')).toBe(true);
    expect(host.querySelector('thead tr')!.children[3]!.classList.contains('adt-pin--edge-end')).toBe(true);

    table.setSorting([{ field: 'customer', direction: 'desc' }]); // a re-render replaces the table
    await Promise.resolve();
    await Promise.resolve();
    expect(pinned(host.querySelector('tbody tr')!)).toEqual(['L0px', 'L100px', '-', 'R100px', 'R0px']);
  });

  it('works on markup rendered elsewhere and stops', () => {
    host.innerHTML = '<table class="adt-table"><thead><tr><th class="adt-th">A</th><th class="adt-th">B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr><tr class="adt-detail"><td colspan="2">x</td></tr></tbody></table>';
    const stop = pinColumns(host, { start: 1 });
    expect(pinned(host.querySelector('tbody tr')!)).toEqual(['L0px', '-']);
    expect(host.querySelector('.adt-detail td')!.classList.contains('adt-pin')).toBe(false); // spanning rows are left alone
    stop();
  });

  it('lets pins scroll again when they would cover most of a narrow table', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { width: /^T[HD]$/.test(this.tagName) ? 100 : 350 } as DOMRect; // a phone: 350px visible
    });
    renderTable(host, createDataTable<Order>({ data, columns }), { selectable: true, fixedColumns: { start: 1, end: 1 } });
    expect(pinned(host.querySelector('tbody tr')!)).toEqual(['L0px', 'L100px', '-', '-']); // 300px > 60%: the end goes first
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { width: /^T[HD]$/.test(this.tagName) ? 100 : 300 } as DOMRect;
    });
    renderTable(host, createDataTable<Order>({ data, columns }), { selectable: true, fixedColumns: { start: 1, end: 1 } });
    expect(pinned(host.querySelector('tbody tr')!)).toEqual(['-', '-', '-', '-']); // even the start is too wide
  });

  it('checks its input', () => {
    expect(checkFixedColumns(undefined)).toEqual({ start: 0, end: 0 });
    expect(() => checkFixedColumns({ start: -1 })).toThrow('fixedColumns.start');
    expect(() => checkFixedColumns({ end: 1.5 })).toThrow('fixedColumns.end');
    expect(() => renderTable(host, createDataTable<Order>({ data, columns }), { fixedColumns: 2 as never })).toThrow('fixedColumns must be');
  });
});
