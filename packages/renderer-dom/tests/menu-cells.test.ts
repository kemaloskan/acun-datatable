import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { el, labelsTr, renderDataTable, renderMenu, renderTable } from '../src/index';

type Order = { id: number; customer: string; status: string };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Customer', accessorKey: 'customer', enableFiltering: true },
  { id: 'status', header: 'Status', accessorKey: 'status', enableSorting: true },
];
const data: Order[] = [{ id: 1, customer: '<b>Ayşe</b>', status: 'paid' }, { id: 2, customer: 'Ali', status: 'new' }];
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
const make = () => createDataTable<Order>({ data, columns });

describe('renderMenu', () => {
  it('groups items, runs them and announces the result', async () => {
    const copy = vi.fn(() => '2 satır kopyalandı');
    renderMenu(host, { labels: labelsTr, items: [
      { id: 'xlsx', label: 'Excel', group: 'Dışa aktar', onSelect: () => undefined },
      { id: 'copy', label: 'Kopyala', onSelect: copy },
      { id: 'boom', label: 'Bozuk', onSelect: () => { throw new Error('olmadı'); } },
    ] });
    expect(host.querySelector('summary')!.textContent).toBe('Araçlar');
    expect(host.querySelector('.adt-menu-label')!.textContent).toBe('Dışa aktar');
    expect(host.querySelectorAll('.adt-menu-separator')).toHaveLength(1);
    host.querySelector('details')!.open = true;
    host.querySelector<HTMLButtonElement>('[data-action="copy"]')!.click();
    await vi.waitFor(() => expect(host.querySelector('.adt-menu-status')!.textContent).toBe('2 satır kopyalandı'));
    expect(host.querySelector('details')!.open).toBe(false);
    host.querySelector<HTMLButtonElement>('[data-action="boom"]')!.click();
    await vi.waitFor(() => expect(host.querySelector('.adt-menu-status--error')!.textContent).toBe('olmadı'));
    expect(() => renderMenu(host, { items: [{ id: 'x' } as never] })).toThrow('menu items need');
  });

  it('is the tools feature of renderDataTable', () => {
    renderDataTable(host, make(), { tools: [{ id: 'print', label: 'Print', onSelect: () => undefined }] });
    expect(host.querySelector('.adt-top .adt-bar-end .adt-tools')).not.toBeNull();
    renderDataTable(host, make());
    expect(host.querySelector('.adt-tools')).toBeNull(); // no items, no menu
  });
});

describe('custom cells', () => {
  it('render DOM nodes or text, never HTML', () => {
    renderTable(host, make(), {
      responsive: 'modal',
      cells: {
        status: ({ value, text }) => el('span', { class: `badge badge--${String(value)}` }, text.toUpperCase()),
        customer: ({ text }) => `${text}!`,
      },
    });
    const badges = [...host.querySelectorAll('tbody .badge')];
    expect(badges.map(badge => [badge.className, badge.textContent])).toEqual([['badge badge--paid', 'PAID'], ['badge badge--new', 'NEW']]);
    expect(host.querySelector('tbody td[data-label="Customer"]')!.textContent).toBe('<b>Ayşe</b>!');
    expect(host.querySelector('tbody b')).toBeNull();
    host.querySelector<HTMLButtonElement>('.adt-expand')!.click();
    expect(host.querySelector('dialog .badge')!.textContent).toBe('PAID'); // also in the dialog
    expect(() => renderTable(host, make(), { cells: { status: 'x' as never } })).toThrow('cells.status must be a function');
    expect(() => renderTable(host, make(), { cells: { status: () => 42 as never } })).toThrow('must return a DOM node or a string');
  });
});
