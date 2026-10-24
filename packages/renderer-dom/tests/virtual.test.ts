import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { checkVirtual, renderDataTable, renderTable, virtualWindow } from '../src/index';

type R = { id: number; name: string };
const columns: readonly ColumnDef<R>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', enableSorting: true, enableFiltering: true }];
const data: R[] = Array.from({ length: 10_000 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400); // the box shows 400px
});
afterEach(() => vi.restoreAllMocks());
const names = () => [...host.querySelectorAll('tbody .adt-row td')].map(td => td.textContent);
const scrollTo = async (top: number) => {
  const scroller = host.querySelector<HTMLElement>('.adt-scroll')!;
  scroller.scrollTop = top;
  scroller.dispatchEvent(new Event('scroll'));
  await new Promise(resolve => setTimeout(resolve, 40));
};

describe('virtualWindow', () => {
  it('returns the rows in view with overscan and the space around them', () => {
    expect(virtualWindow(1000, 40, 4000, 400, 5)).toEqual({ start: 95, end: 115, before: 3800, after: 885 * 40 });
    expect(virtualWindow(0, 40, 0, 400)).toEqual({ start: 0, end: 0, before: 0, after: 0 });
    expect(virtualWindow(3, 40, 0, 400)).toMatchObject({ start: 0, end: 3, after: 0 });
    expect(() => checkVirtual({ overscan: -1 })).toThrow('virtual.overscan');
  });
});

describe('virtual scrolling', () => {
  it('draws only the rows in view of 10,000 and follows the scroll', async () => {
    const table = createDataTable<R>({ data, columns });
    renderTable(host, table, { virtual: { rowHeight: 40, overscan: 2 } });
    expect(names()).toEqual(Array.from({ length: 12 }, (_, i) => `Row ${i + 1}`)); // 10 in view + 2
    expect(host.querySelector('table')!.getAttribute('aria-rowcount')).toBe('10001');
    expect(host.querySelector('tbody .adt-row')!.getAttribute('aria-rowindex')).toBe('2');
    const after = host.querySelector<HTMLElement>('tbody .adt-spacer:last-child td')!;
    expect(after.style.height).toBe(`${(10_000 - 12) * 40}px`);
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-scroll-y')).toBe(true); // 480px by default
    await scrollTo(200_000); // row 5,001
    expect(names()[0]).toBe('Row 4999');
    expect(host.querySelectorAll('tbody .adt-row')).toHaveLength(14);
    table.setGlobalSearch('Row 99');
    expect(host.querySelector('table')!.getAttribute('aria-rowcount')).toBe(String(table.getFilteredRows().length + 1));
  });

  it('selects every matching row, hides the pager and needs a local table', () => {
    const table = createDataTable<R>({ data, columns });
    renderDataTable(host, table, { virtual: { rowHeight: 40 }, selectable: true });
    expect(host.querySelector('.adt-paging, .adt-length')).toBeNull();
    expect(host.querySelector('.adt-info')!.textContent).toBe('Showing 1 to 10,000 of 10,000 rows');
    host.querySelector<HTMLInputElement>('thead .adt-select input')!.click();
    expect(table.getState().selectedIds).toHaveLength(10_000);
    expect(() => renderTable(host, createDataTable<R>({ mode: 'server', columns }), { virtual: true })).toThrow('virtual scrolling needs a local table');
  });
});
