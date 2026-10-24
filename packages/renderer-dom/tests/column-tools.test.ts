import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { labelsTr, renderColumnToggle, renderDataTable, renderTable } from '../src/index';

type Order = { id: number; customer: string; city: string; total: number };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true },
  { id: 'city', header: 'City', accessorKey: 'city' },
  { id: 'total', header: 'Total', accessorKey: 'total', type: 'number' },
];
const data: Order[] = [{ id: 1, customer: 'Ayşe', city: 'İzmir', total: 10 }];
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
  // jsdom has no layout: headers are 150px wide, starting at x = 0, 150, 300.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    const index = this.parentElement ? [...this.parentElement.children].indexOf(this) : 0;
    return { width: 150, left: index * 150 } as DOMRect;
  });
});
const make = () => createDataTable<Order>({ data, columns });
const handle = (id: string) => host.querySelector<HTMLElement>(`.adt-resize[data-column-id="${id}"]`)!;
const th = (id: string) => host.querySelector<HTMLElement>(`thead th[data-column-id="${id}"]`)!;
const order = () => [...host.querySelectorAll<HTMLElement>('thead th[data-column-id]')].map(cell => cell.dataset['columnId']);
const pointer = (target: EventTarget, type: string, clientX: number) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, clientX, button: 0 }));
const drag = (target: EventTarget, type: string, clientX: number) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, clientX }));

describe('resizable columns', () => {
  it('renders a labelled separator per header', () => {
    renderTable(host, make(), { resizableColumns: true, labels: labelsTr });
    const customer = handle('customer');
    expect(customer.getAttribute('role')).toBe('separator');
    expect(customer.getAttribute('aria-orientation')).toBe('vertical');
    expect(customer.getAttribute('aria-label')).toBe('Customer kolon genişliği');
    expect(customer.tabIndex).toBe(0);
    expect(host.querySelector('table')!.classList.contains('adt-fixed-layout')).toBe(false);
  });

  it('drags a handle: every column is fixed first, then only the dragged one changes', () => {
    const table = make();
    renderTable(host, table, { resizableColumns: true });
    pointer(handle('city'), 'pointerdown', 300);
    expect(table.getState().columnWidths).toEqual({ customer: 150, city: 150, total: 150 });
    expect(host.querySelector('table')!.classList.contains('adt-fixed-layout')).toBe(true);
    pointer(document, 'pointermove', 340);
    expect(th('city').style.width).toBe('190px'); // live, before the state changes
    expect(table.getState().columnWidths.city).toBe(150);
    pointer(document, 'pointerup', 340);
    expect(table.getState().columnWidths).toEqual({ customer: 150, city: 190, total: 150 });
    expect(th('city').style.width).toBe('190px');
    expect(handle('city').getAttribute('aria-valuenow')).toBe('190');
  });

  it('Escape cancels a drag; the keyboard resizes and Delete resets', () => {
    const table = make();
    renderTable(host, table, { resizableColumns: true });
    pointer(handle('total'), 'pointerdown', 450);
    pointer(document, 'pointermove', 380);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(th('total').style.width).toBe('150px');
    pointer(document, 'pointerup', 380); // already over: no change
    expect(table.getState().columnWidths.total).toBe(150);

    handle('total').focus();
    handle('total').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(table.getState().columnWidths.total).toBe(166);
    expect(document.activeElement).toBe(handle('total')); // focus survives the re-render
    handle('total').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', shiftKey: true, bubbles: true }));
    expect(table.getState().columnWidths.total).toBe(102);
    // Delete and double-click go back to the width the content takes (150px here), measured
    // with the automatic layout, so the fixed layout cannot squeeze the column to nothing.
    handle('total').dispatchEvent(new KeyboardEvent('keydown', { key: 'Delete', bubbles: true }));
    expect(table.getState().columnWidths.total).toBe(150);
    expect(host.querySelector('table')!.classList.contains('adt-fixed-layout')).toBe(true);
    handle('city').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    handle('city').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(table.getState().columnWidths.city).toBe(150);
  });
});

describe('reorderable columns', () => {
  it('drags a header before or after another', () => {
    const table = make();
    renderTable(host, table, { reorderableColumns: true });
    expect(th('customer').getAttribute('draggable')).toBe('true');
    drag(th('total'), 'dragstart', 400);
    expect(th('total').classList.contains('adt-dragging')).toBe(true);
    drag(th('customer'), 'dragover', 20); // left half of Customer
    expect(th('customer').classList.contains('adt-drop-before')).toBe(true);
    drag(th('customer'), 'drop', 20);
    expect(order()).toEqual(['total', 'customer', 'city']);
    expect(host.querySelector('.adt-dragging, .adt-drop-before, .adt-drop-after')).toBeNull();

    drag(th('total'), 'dragstart', 50);
    drag(th('city'), 'dragover', 440); // right half of City (the third header)
    expect(th('city').classList.contains('adt-drop-after')).toBe(true);
    drag(th('city'), 'drop', 440);
    expect(order()).toEqual(['customer', 'city', 'total']);
  });

  it('moves with the column menu buttons and resets order and widths', () => {
    const table = make();
    renderColumnToggle(host, table, { reorderable: true, labels: labelsTr });
    const up = (name: string) => host.querySelector<HTMLButtonElement>(`.adt-move[aria-label="${name} kolonunu yukarı taşı"]`)!;
    expect(up('Customer').getAttribute('aria-disabled')).toBe('true');
    expect(host.querySelector('.adt-columns-reset')).toBeNull();
    host.querySelector('details')!.open = true;
    up('Total').focus();
    up('Total').click();
    expect(table.getState().columnOrder).toEqual(['customer', 'total', 'city']);
    expect(host.querySelector('details')!.open).toBe(true); // the re-rendered button still counts as inside
    expect([...host.querySelectorAll('label span')].map(span => span.textContent)).toEqual(['Customer', 'Total', 'City']);
    expect(document.activeElement).toBe(up('Total')); // focus follows the moved column
    table.setColumnWidth('city', 300);
    host.querySelector<HTMLButtonElement>('.adt-columns-reset')!.click();
    expect(table.getState().columnOrder).toEqual(['customer', 'city', 'total']);
    expect(table.getState().columnWidths).toEqual({});
    expect(host.querySelector('.adt-columns-reset')).toBeNull();
  });

  it('is wired through renderDataTable', () => {
    renderDataTable(host, make(), { resizableColumns: true, reorderableColumns: true });
    expect(host.querySelectorAll('.adt-resize')).toHaveLength(3);
    expect(host.querySelectorAll('.adt-columns .adt-move')).toHaveLength(6);
  });
});

describe('review fixes', () => {
  it('leaves a column hidden by the responsive layout without a frozen width', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return { width: this.dataset['columnId'] === 'city' ? 0 : 150, left: 0 } as DOMRect; // city: display none
    });
    const table = make();
    renderTable(host, table, { resizableColumns: true });
    handle('total').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(table.getState().columnWidths.city).toBeUndefined();
    expect(th('city').classList.contains('adt-th--auto')).toBe(true); // 10rem when it shows again
  });
});
