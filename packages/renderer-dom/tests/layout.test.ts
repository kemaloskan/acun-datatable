import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { DEFAULT_LAYOUT, renderDataTable } from '../src/index';

type Item = { id: number; name: string };
const columns: readonly ColumnDef<Item>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', enableFiltering: true, enableSorting: true },
  { id: 'id', header: 'No', accessorKey: 'id' },
];
const data = Array.from({ length: 60 }, (_, index) => ({ id: index + 1, name: `Row ${index + 1}` }));
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
const make = () => createDataTable<Item>({ data, columns, initialState: { pageSize: 10 } });
const order = (selectors: readonly string[]) => selectors.map(selector => {
  const node = host.querySelector(selector);
  if (!node) throw new Error(`missing ${selector}`);
  return [...host.querySelectorAll('*')].indexOf(node);
});

describe('renderDataTable', () => {
  it('arranges size and search above, info and pages below, like DataTables', () => {
    renderDataTable(host, make());
    const top = host.querySelector('.adt > .adt-top')!;
    const bottom = host.querySelector('.adt > .adt-bottom')!;
    expect(top.querySelector('.adt-bar-start .adt-length')).not.toBeNull();
    expect(top.querySelector('.adt-bar-start .adt-search')).not.toBeNull();
    expect(top.querySelector('.adt-bar-end .adt-columns')).not.toBeNull();
    expect(bottom.querySelector('.adt-bar-start .adt-info')!.textContent).toBe('Showing 1 to 10 of 60 rows');
    expect(bottom.querySelector('.adt-bar-end .adt-paging')).not.toBeNull();
    const [length, table, paging] = order(['.adt-length', '.adt-table', '.adt-paging']);
    expect(length! < table! && table! < paging!).toBe(true);
    expect(DEFAULT_LAYOUT.bottomEnd).toBe('paging');
  });

  it('wires every part to the same table', () => {
    const table = make();
    renderDataTable(host, table);
    host.querySelector<HTMLButtonElement>('.adt-page[aria-label="Page 3"]')!.click();
    expect(host.querySelector('.adt-info')!.textContent).toBe('Showing 21 to 30 of 60 rows');
    expect(host.querySelector('tbody td')!.textContent).toBe('Row 21');
    const select = host.querySelector('select')!;
    select.value = '25';
    select.dispatchEvent(new Event('change'));
    expect(host.querySelector('.adt-info')!.textContent).toBe('Showing 1 to 25 of 60 rows');
  });

  it('picks the texts from the locale and applies overrides', () => {
    renderDataTable(host, make(), { locale: 'tr', labels: { pageInfoEmpty: 'Hiç yok' } });
    expect(host.querySelector('.adt-info')!.textContent).toBe('Toplam: 60 kaydın 1 ile 10 arasını gösteriyor');
    expect(host.querySelector<HTMLInputElement>('.adt-search input')!.placeholder).toBe('Ara…');
    expect(host.querySelector('.adt-paging')!.getAttribute('aria-label')).toBe('Sayfalama');
  });

  it('moves, removes and adds features', () => {
    const custom = vi.fn((slot: HTMLElement) => {
      slot.append(Object.assign(document.createElement('button'), { className: 'my-filter', textContent: 'Filters' }));
    });
    renderDataTable(host, make(), {
      layout: { topStart: 'search', topEnd: [custom, 'pageSize'], bottomStart: null, bottomEnd: ['info', 'paging'] },
      paging: { firstLast: true },
    });
    expect(custom).toHaveBeenCalledOnce();
    expect(host.querySelector('.adt-top .adt-bar-end .my-filter')).not.toBeNull();
    expect(host.querySelector('.adt-top .adt-bar-end .adt-length')).not.toBeNull();
    expect(host.querySelector('.adt-columns')).toBeNull();
    expect(host.querySelector('.adt-bottom .adt-bar-start')!.children).toHaveLength(0);
    expect(host.querySelector('.adt-bottom .adt-bar-end .adt-info')).not.toBeNull();
    expect(host.querySelector('.adt-first')).not.toBeNull();
  });

  it('leaves out an empty bar and shows bulk actions above the table', () => {
    const table = make();
    const onSelect = vi.fn();
    renderDataTable(host, table, {
      layout: { topStart: null, topEnd: null }, selectable: true, bulkActions: [{ id: 'archive', label: 'Archive', onSelect }],
    });
    expect(host.querySelector('.adt-top')).toBeNull();
    expect(host.querySelector<HTMLElement>('.adt-selection')!.hidden).toBe(true);
    table.selectRow(table.getPage().rows[0]!.id);
    expect(host.querySelector<HTMLElement>('.adt-selection')!.hidden).toBe(false);
    host.querySelector<HTMLButtonElement>('.adt-bulk-action')!.click();
    expect(onSelect).toHaveBeenCalledOnce();
    const menu = host.querySelector<HTMLSelectElement>('.adt-selection-menu')!;
    menu.value = 'archive';
    menu.dispatchEvent(new Event('change'));
    expect(onSelect).toHaveBeenCalledTimes(2); // the select runs the same action
  });

  it('shows the selection bar for a selectable table without bulk actions: count, select all matching, clear', () => {
    const table = make();
    renderDataTable(host, table, { selectable: true });
    const bar = host.querySelector<HTMLElement>('.adt-selection')!;
    expect(bar.hidden).toBe(true);
    table.selectRows(table.getPage().rows.map(row => row.id));
    expect(bar.hidden).toBe(false);
    expect(bar.querySelector('.adt-bulk-action')).toBeNull();
    // The same choices as a select for phones.
    const menu = bar.querySelector<HTMLSelectElement>('.adt-selection-menu')!;
    expect([...menu.options].map(option => option.value)).toEqual(['', '__matching', '__clear']);
    menu.value = '__matching';
    menu.dispatchEvent(new Event('change'));
    expect(table.getState().selectedIds).toHaveLength(60); // local rows: every match, selected
    expect(menu.value).toBe('');
    expect([...menu.options].map(option => option.value)).toEqual(['', '__clear']); // nothing more to select
    bar.querySelector<HTMLButtonElement>('.adt-clear-selection')!.click();
    expect(bar.hidden).toBe(true);
    renderDataTable(host, make());
    expect(host.querySelector('.adt-selection')).toBeNull(); // not selectable: no bar
  });

  it('rejects unknown features and slots, and destroys every part', () => {
    expect(() => renderDataTable(host, make(), { layout: { topStart: 'buttons' as never } })).toThrow('Unknown layout feature "buttons"');
    expect(() => renderDataTable(host, make(), { layout: { middle: 'info' } as never })).toThrow('Unknown layout slot "middle"');
    const destroy = vi.fn();
    const table = make();
    const rendered = renderDataTable(host, table, { layout: { bottomStart: () => ({ destroy }) } });
    rendered.destroy();
    expect(destroy).toHaveBeenCalledOnce();
    expect(host.children).toHaveLength(0);
    table.setPage(2); // no listener left
    expect(host.children).toHaveLength(0);
  });
});
