import { beforeEach, describe, expect, it } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { labelsTr, renderColumnToggle, renderTable } from '../src/index';

type Order = { id: number; customer: string; city: string; total: number };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Customer', accessorKey: 'customer', enableHiding: false },
  { id: 'city', header: 'City', accessorKey: 'city' },
  { id: 'total', header: 'Total', accessorKey: 'total', enableSorting: true },
];
const data: Order[] = [{ id: 1, customer: 'Ayşe', city: 'İstanbul', total: 10 }];
let host: HTMLElement;
let menu: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  menu = document.createElement('div');
  host = document.createElement('div');
  document.body.append(menu, host);
});
const make = () => createDataTable<Order>({ data, columns });
const headers = () => [...host.querySelectorAll('thead th')].map(th => th.textContent);
const box = (id: string) => menu.querySelector<HTMLInputElement>(`input[value="${id}"]`)!;

describe('column visibility in the DOM', () => {
  it('renders only visible columns and follows changes', () => {
    const table = make();
    renderTable(host, table, { selectable: true });
    table.setColumnVisibility('city', false);
    expect(headers()).toEqual(['', 'Customer', 'Total']);
    expect([...host.querySelectorAll('tbody td')].map(td => td.getAttribute('data-label'))).toEqual([null, 'Customer', 'Total']);
    table.setGlobalSearch('nobody');
    expect(host.querySelector('.adt-empty td')!.getAttribute('colspan')).toBe('3');
  });

  it('offers a labelled checkbox per column inside a native details menu', () => {
    renderColumnToggle(menu, make(), { labels: labelsTr });
    expect(menu.querySelector('details > summary')!.textContent).toBe('Kolonlar');
    expect(menu.querySelector('fieldset > legend')!.textContent).toBe('Gösterilecek kolonlar');
    expect([...menu.querySelectorAll('label')].map(label => label.textContent)).toEqual(['Customer', 'City', 'Total']);
    expect(box('customer').disabled).toBe(true); // enableHiding: false
    expect([box('city').checked, box('total').checked]).toEqual([true, true]);
  });

  it('hides columns from the checkboxes and keeps the last visible one', () => {
    const table = createDataTable<Order>({ data, columns: columns.slice(1) });
    renderColumnToggle(menu, table);
    renderTable(host, table);
    box('city').checked = false;
    box('city').dispatchEvent(new Event('change'));
    expect(table.getState().hiddenColumns).toEqual(['city']);
    expect(headers()).toEqual(['Total']);
    expect(box('total').disabled).toBe(true); // the last visible column
    table.setColumnVisibility('city', true); // external change
    expect(box('city').checked).toBe(true);
    expect(box('total').disabled).toBe(false);
  });

  it('stops on destroy', () => {
    const table = make();
    renderColumnToggle(menu, table).destroy();
    expect(menu.children).toHaveLength(0);
    table.setColumnVisibility('city', false);
    expect(menu.children).toHaveLength(0);
  });
});
