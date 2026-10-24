import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { editText, labelsTr, parseEdit, renderTable, type CellEdit } from '../src/index';

type Order = { id: number; customer: string; total: string; qty: number; day: string; paid: boolean; status: string };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Customer', accessorKey: 'customer', editable: true, enableSorting: true },
  { id: 'total', header: 'Total', accessorKey: 'total', type: 'decimal', editable: true },
  { id: 'qty', header: 'Qty', accessorKey: 'qty', type: 'number' },
  { id: 'day', header: 'Day', accessorKey: 'day', type: 'date', editable: true },
  { id: 'paid', header: 'Paid', accessorKey: 'paid', type: 'boolean', editable: true },
  { id: 'status', header: 'Status', accessorKey: 'status', editable: { options: [{ value: 'new', label: 'New' }, { value: 'paid', label: 'Paid' }] } },
];
const data: Order[] = [
  { id: 1, customer: 'Ayşe', total: '1250.50', qty: 2, day: '2026-10-24', paid: false, status: 'new' },
  { id: 2, customer: 'Ali', total: '90.00', qty: 1, day: '2026-10-20', paid: true, status: 'paid' },
];
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
const editButton = (label: string) => host.querySelector<HTMLButtonElement>(`.adt-edit[aria-label="${label}"]`)!;
const control = () => host.querySelector<HTMLInputElement | HTMLSelectElement>('.adt-edit-control')!;
const key = (target: Element, name: string) => target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('editing helpers', () => {
  it('reads typed input as the column type', () => {
    const [text, decimal, number, day, paid, status] = columns as readonly ColumnDef<unknown>[];
    expect(parseEdit(text!, ' Ayşe ')).toEqual({ ok: true, value: ' Ayşe ' });
    expect(parseEdit(decimal!, '12,5')).toEqual({ ok: true, value: '12.5' });
    expect(parseEdit(decimal!, '1.250,50')).toEqual({ ok: false });
    expect(parseEdit(number!, '')).toEqual({ ok: true, value: null });
    expect(parseEdit(number!, 'abc')).toEqual({ ok: false });
    expect(parseEdit(day!, '2026-02-30')).toEqual({ ok: false });
    expect(parseEdit(day!, '2026-02-28')).toEqual({ ok: true, value: '2026-02-28' });
    expect(parseEdit(paid!, true)).toEqual({ ok: true, value: true });
    expect(parseEdit(status!, 'paid')).toEqual({ ok: true, value: 'paid' });
    expect(parseEdit(status!, 'gone')).toEqual({ ok: false });
    expect(editText(decimal!, '1250.50')).toBe('1250.50');
    expect(editText(day!, '2026-10-24T13:00:00')).toBe('2026-10-24');
  });
});

describe('editing in place', () => {
  it('opens an editor for the column type, saves on Enter and restores focus', async () => {
    const table = createDataTable<Order>({ data, columns });
    const onEdit = vi.fn(async (edit: CellEdit<Order>) => {
      table.setData(table.getCoreRows().map(row => row.id === edit.row.id ? { ...row.original, [edit.column.id]: edit.value } : row.original));
    });
    renderTable(host, table, { onEdit, labels: labelsTr });
    expect(host.querySelectorAll('tbody tr:first-child .adt-edit')).toHaveLength(5); // not Qty
    editButton('Total düzenle: Ayşe').click();
    expect(control().value).toBe('1250.50');
    expect(document.activeElement).toBe(control());
    expect(host.querySelector('td.adt-editing')!.getAttribute('data-label')).toBe('Total');
    control().value = '1300,75';
    key(control(), 'Enter');
    expect(host.querySelector('.adt-edit-message')!.textContent).toBe('Kaydediliyor…');
    expect(control().getAttribute('aria-busy')).toBe('true');
    await flush();
    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ value: '1300.75', previous: '1250.50' }));
    expect(onEdit.mock.calls[0]![0].row.id).toBe('1');
    expect(host.querySelector('.adt-editor')).toBeNull();
    expect(host.querySelector('tbody tr:first-child td:nth-child(2)')!.textContent).toBe('1,300.75');
    expect(document.activeElement).toBe(editButton('Total düzenle: Ayşe'));
  });

  it('keeps the editor open on bad input or a failed save; Escape cancels', async () => {
    const onEdit = vi.fn(async () => { throw new Error('Tutar onaylı siparişte değişmez'); });
    renderTable(host, createDataTable<Order>({ data, columns }), { onEdit, labels: labelsTr });
    editButton('Total düzenle: Ali').click();
    control().value = 'çok';
    key(control(), 'Enter');
    expect(control().getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('.adt-edit-message[role="alert"]')!.textContent).toBe('Geçerli bir değer girin.');
    expect(onEdit).not.toHaveBeenCalled();
    control().value = '95';
    key(control(), 'Enter');
    await flush();
    expect(host.querySelector('.adt-edit-message[role="alert"]')!.textContent).toBe('Tutar onaylı siparişte değişmez');
    expect(document.activeElement).toBe(control());
    key(control(), 'Escape');
    expect(host.querySelector('.adt-editor')).toBeNull();
    expect(document.activeElement).toBe(editButton('Total düzenle: Ali'));
  });

  it('closes without saving when nothing changed, and survives a re-render', async () => {
    const table = createDataTable<Order>({ data, columns });
    const onEdit = vi.fn();
    renderTable(host, table, { onEdit });
    editButton('Edit Customer: Ayşe').click();
    control().value = 'Ayşe Y';
    table.setSorting([{ field: 'customer', direction: 'desc' }]); // a re-render while typing
    expect(control().value).toBe('Ayşe Y');
    expect(document.activeElement).toBe(control());
    control().value = 'Ayşe';
    key(control(), 'Enter');
    expect(onEdit).not.toHaveBeenCalled();
    expect(host.querySelector('.adt-editor')).toBeNull();
  });

  it('uses a list for options and booleans, and a date field for dates', async () => {
    const onEdit = vi.fn();
    renderTable(host, createDataTable<Order>({ data, columns }), { onEdit });
    editButton('Edit Status: Ayşe').click();
    expect([...(control() as HTMLSelectElement).options].map(option => option.textContent)).toEqual(['—', 'New', 'Paid']);
    control().value = 'paid';
    key(control(), 'Enter');
    await flush();
    expect(onEdit).toHaveBeenLastCalledWith(expect.objectContaining({ value: 'paid', previous: 'new' }));
    editButton('Edit Paid: Ayşe').click();
    expect((control() as HTMLSelectElement).value).toBe('false');
    key(control(), 'Escape');
    editButton('Edit Day: Ayşe').click();
    expect((control() as HTMLInputElement).type).toBe('date');
    expect(control().value).toBe('2026-10-24');
  });

  it('needs editable columns and onEdit', () => {
    renderTable(host, createDataTable<Order>({ data, columns }));
    expect(host.querySelector('.adt-edit')).toBeNull();
    expect(() => renderTable(host, createDataTable<Order>({ data, columns }), { onEdit: 'x' as never })).toThrow('onEdit must be a function');
  });
});
