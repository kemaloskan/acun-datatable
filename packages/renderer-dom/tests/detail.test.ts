import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { el, labelsTr, renderDataTable, renderTable } from '../src/index';

type Order = { id: number; customer: string; total: number; note: string };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
  { id: 'total', header: 'Total', accessorKey: 'total', type: 'number' },
  { id: 'note', header: 'Note', accessorKey: 'note', priority: 3 },
];
const data: Order[] = [
  { id: 1, customer: 'Ayşe', total: 10, note: 'VIP' },
  { id: 2, customer: 'Ali', total: 20, note: '' },
];
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
const make = () => createDataTable<Order>({ data, columns });
const expand = (name: string) => host.querySelector<HTMLButtonElement>(`.adt-expand[aria-label="Details of ${name}"]`)!;
const content = () => [...host.querySelectorAll('.adt-detail .adt-detail-content')].map(node => node.textContent);

describe('detail (child rows)', () => {
  it('adds a toggle to every row and shows the returned node below it', () => {
    const detail = vi.fn((row: { original: Order }) => el('p', { class: 'lines' }, `${row.original.customer}: 3 lines`));
    renderTable(host, make(), { detail });
    const table = host.querySelector('table')!;
    expect(table.classList.contains('adt-has-detail')).toBe(true);
    expect(host.querySelectorAll('tbody .adt-expand')).toHaveLength(2); // cards mode too, not only collapse
    expect(detail).not.toHaveBeenCalled(); // nothing is built before a row opens
    const button = expand('Ayşe');
    expect(button.getAttribute('aria-expanded')).toBe('false');
    button.focus();
    button.click();
    expect(expand('Ayşe').getAttribute('aria-expanded')).toBe('true');
    expect(expand('Ayşe').getAttribute('aria-controls')).toBe(host.querySelector('.adt-detail')!.id);
    expect(content()).toEqual(['Ayşe: 3 lines']);
    expect(host.querySelector('.adt-detail td')!.getAttribute('colspan')).toBe('4');
    expect(host.querySelector('.adt-detail .adt-detail-list')).toBeNull(); // no hidden-column list outside collapse
    expect(document.activeElement).toBe(expand('Ayşe')); // focus stays on the toggle
    expand('Ayşe').click();
    expect(host.querySelector('.adt-detail')).toBeNull();
  });

  it('keeps the content while open and builds it again for changed rows', () => {
    const table = make();
    const detail = vi.fn((row: { original: Order }) => `Note: ${row.original.note}`);
    renderTable(host, table, { detail });
    expand('Ayşe').click();
    table.setSorting([{ field: 'customer', direction: 'asc' }]);
    expect(content()).toEqual(['Note: VIP']);
    expect(detail).toHaveBeenCalledOnce();
    table.setData([{ ...data[0]!, note: 'Gold' }, data[1]!]);
    expect(content()).toEqual(['Note: Gold']);
  });

  it('shows loading, then the loaded content or an error', async () => {
    let resolve!: (node: Node) => void;
    const detail = vi.fn((row: { original: Order }) => row.original.id === 1
      ? new Promise<Node>(done => { resolve = done; })
      : Promise.reject(new Error('offline')));
    renderTable(host, make(), { detail, labels: labelsTr });
    host.querySelector<HTMLButtonElement>('.adt-expand[aria-label="Ayşe ayrıntıları"]')!.click();
    expect(content()).toEqual(['Yükleniyor…']);
    expect(host.querySelector('.adt-detail-content')!.getAttribute('aria-busy')).toBe('true');
    resolve(el('strong', {}, 'Yüklendi'));
    await vi.waitFor(() => expect(content()).toEqual(['Yüklendi']));
    host.querySelector<HTMLButtonElement>('.adt-expand[aria-label="Ali ayrıntıları"]')!.click();
    await vi.waitFor(() => expect(host.querySelector('.adt-detail-content[role="alert"]')).not.toBeNull());
  });

  it('collapse: hidden columns first, then the detail', () => {
    renderTable(host, make(), { responsive: 'collapse', detail: row => `#${row.id}` });
    expand('Ayşe').click();
    const cell = host.querySelector('.adt-detail td')!;
    expect(cell.querySelector('.adt-detail-list')).not.toBeNull();
    expect(cell.lastElementChild!.textContent).toBe('#1');
  });

  it('modal: the dialog shows every value and the detail', () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    renderTable(host, make(), { responsive: 'modal', detail: row => el('em', {}, `lines of ${row.original.customer}`) });
    expect(host.querySelectorAll('tbody .adt-expand')).toHaveLength(2);
    expand('Ali').click();
    const dialog = host.querySelector('dialog')!;
    expect(dialog.querySelectorAll('.adt-detail-item').length).toBeGreaterThan(0);
    expect(dialog.querySelector('.adt-detail-content')!.textContent).toBe('lines of Ali');
    expect(host.querySelector('tbody .adt-detail')).toBeNull();
  });

  it('works through renderDataTable and checks its input', () => {
    renderDataTable(host, make(), { detail: () => 'x' });
    expect(host.querySelectorAll('tbody .adt-expand')).toHaveLength(2);
    expect(() => renderTable(host, make(), { detail: 'x' as never })).toThrow('detail must be a function');
  });
});
