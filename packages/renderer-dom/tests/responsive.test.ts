import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { labelsTr, renderDataTable, renderTable } from '../src/index';

type Order = { id: number; customer: string; city: string; total: number; note: string };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
  { id: 'city', header: 'City', accessorKey: 'city' },
  { id: 'total', header: 'Total', accessorKey: 'total', type: 'number', priority: 1 },
  { id: 'note', header: 'Note', accessorKey: 'note', priority: 3 },
];
const data: Order[] = [
  { id: 1, customer: 'Ayşe', city: 'İzmir', total: 10, note: 'VIP' },
  { id: 2, customer: 'Ali', city: 'Ankara', total: 20, note: '' },
];
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
const make = () => createDataTable<Order>({ data, columns });
const expand = (name: string) => host.querySelector<HTMLButtonElement>(`.adt-expand[aria-label="Details of ${name}"]`)!;

describe('responsive modes', () => {
  it('marks the mode and keeps plain markup for cards and scroll', () => {
    renderTable(host, make());
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-responsive--cards')).toBe(true);
    expect(host.querySelector('.adt-expand-cell, .adt-expand')).toBeNull();
    expect(host.querySelector('tbody td:nth-child(3)')!.className).toBe('adt-num'); // numbers align right
    renderTable(host, make(), { responsive: 'scroll' });
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-responsive--scroll')).toBe(true);
    expect(() => renderTable(host, make(), { responsive: 'stack' as never })).toThrow('responsive must be one of');
  });

  it('collapse: priority classes, a details button and a details row', () => {
    const rowActions = [{ id: 'delete', label: 'Delete', onSelect: vi.fn() }];
    renderTable(host, make(), { responsive: 'collapse', selectable: true, rowActions });
    const table = host.querySelector('table')!;
    expect(table.classList.contains('adt-has-p2')).toBe(true);
    expect(table.classList.contains('adt-has-p3')).toBe(true);
    expect([...host.querySelectorAll('thead th')].map(th => th.className)).toEqual([
      'adt-select', 'adt-th adt-col--p1', 'adt-th adt-col--p2', 'adt-th adt-col--p1 adt-num', 'adt-th adt-col--p3', 'adt-th adt-actions adt-col--p2',
    ]);
    const button = expand('Ayşe');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.focus();
    button.click();
    expect(expand('Ayşe').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(expand('Ayşe')); // focus survives the re-render
    const detail = document.getElementById(expand('Ayşe').getAttribute('aria-controls')!)!;
    expect(detail.classList.contains('adt-detail')).toBe(true);
    expect([...detail.querySelectorAll('.adt-detail-item')].map(item => [item.className, item.textContent])).toEqual([
      ['adt-detail-item adt-col--p2', 'Cityİzmir'],
      ['adt-detail-item adt-col--p3', 'NoteVIP'],
      ['adt-detail-item adt-col--p2', 'ActionsDelete'],
    ]);
    detail.querySelector<HTMLButtonElement>('.adt-action')!.click();
    expect(rowActions[0]!.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));
    expand('Ayşe').click();
    expect(host.querySelector('.adt-detail')).toBeNull();
  });

  it('modal: opens every value of the row in a labelled dialog', () => {
    const table = make();
    renderTable(host, table, { responsive: 'modal', labels: labelsTr });
    const button = host.querySelector<HTMLButtonElement>('.adt-expand')!;
    expect(button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(button.getAttribute('aria-label')).toBe('Ayşe ayrıntıları');
    button.click();
    const dialog = host.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(document.getElementById(dialog.getAttribute('aria-labelledby')!)!.textContent).toBe('Ayşe ayrıntıları');
    expect([...dialog.querySelectorAll('dt')].map(dt => dt.textContent)).toEqual(['Customer', 'City', 'Total', 'Note']);
    table.setSorting([{ field: 'customer', direction: 'asc' }]); // still on the page: stays open
    expect(dialog.open).toBe(true);
    dialog.querySelector<HTMLButtonElement>('.adt-dialog-close')!.click();
    expect(dialog.open).toBe(false);
    button.click();
    table.setGlobalSearch('ali'); // its row left the page: closes
    expect(dialog.open).toBe(false);
  });
});

describe('sizes', () => {
  it('adds the size class to the table or the whole layout', () => {
    renderTable(host, make(), { size: 'sm' });
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-size--sm')).toBe(true);
    renderDataTable(host, make(), { size: 'lg' });
    expect(host.querySelector('.adt')!.classList.contains('adt-size--lg')).toBe(true);
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-size--lg')).toBe(false);
    renderDataTable(host, make());
    expect(host.querySelector('.adt')!.className).toBe('adt');
    expect(() => renderTable(host, make(), { size: 'xl' as never })).toThrow('size must be sm, md or lg');
  });
});

describe('sticky header', () => {
  it('sticks to the page or scrolls inside a fixed height', () => {
    renderTable(host, make(), { stickyHeader: true });
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-sticky-header')).toBe(true);
    renderDataTable(host, make(), { scrollY: '60vh' });
    const wrap = host.querySelector<HTMLElement>('.adt-table-wrap')!;
    expect(wrap.classList.contains('adt-scroll-y')).toBe(true);
    expect(wrap.style.getPropertyValue('--adt-scroll-y')).toBe('60vh');
    renderTable(host, make(), { scrollY: 480 });
    expect(host.querySelector<HTMLElement>('.adt-table-wrap')!.style.getPropertyValue('--adt-scroll-y')).toBe('480px');
    expect(() => renderTable(host, make(), { scrollY: 'calc(100vh - 10px)' })).toThrow('scrollY must be');
    expect(() => renderTable(host, make(), { scrollY: -1 })).toThrow('scrollY must be');
  });
});
