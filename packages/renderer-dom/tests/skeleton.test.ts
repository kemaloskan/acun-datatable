import { beforeEach, describe, expect, it } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { labelsTr, renderTable, type StatusSource } from '../src/index';

type Order = { id: number; customer: string; total: number };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Müşteri', accessorKey: 'customer' },
  { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'number' },
];
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
type Phase = 'idle' | 'loading' | 'success' | 'error';
const source = (initial: Phase) => {
  let state: { status: Phase } = { status: initial };
  const listeners = new Set<(s: { status: Phase }) => void>();
  const status: StatusSource = { getState: () => state, subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); } };
  return { status, set: (phase: Phase) => { state = { status: phase }; listeners.forEach(listener => listener(state)); } };
};

describe('skeleton rows', () => {
  it('fills the first load with placeholder rows instead of the empty text', () => {
    const table = createDataTable<Order>({ data: [], columns, initialState: { pageSize: 5 } });
    const { status, set } = source('loading');
    renderTable(host, table, { status, labels: labelsTr, selectable: true, rowActions: [{ id: 'edit', label: 'Düzenle', onSelect: () => undefined }] });
    const rows = host.querySelectorAll('tbody tr.adt-skeleton-row');
    expect(rows).toHaveLength(5);
    expect(rows[0]!.querySelectorAll('td')).toHaveLength(4); // select, two columns, actions: same layout as a row
    expect(rows[0]!.querySelectorAll('.adt-skeleton')).toHaveLength(2);
    expect(rows[0]!.querySelector('td.adt-num')).not.toBeNull();
    expect(host.querySelector('tbody')!.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-skeleton-on')).toBe(true);
    expect(host.querySelector('.adt-notice')!.textContent).toBe('Yükleniyor…'); // still announced
    expect(host.querySelector('.adt-empty')).toBeNull();

    table.setData([{ id: 1, customer: 'Ayşe', total: 10 }]);
    set('success');
    expect(host.querySelector('.adt-skeleton')).toBeNull();
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-skeleton-on')).toBe(false);
    expect(host.querySelector('tbody')!.hasAttribute('aria-hidden')).toBe(false);
  });

  it('keeps current rows on later loads and shows the empty text when nothing came', () => {
    const table = createDataTable<Order>({ data: [{ id: 1, customer: 'Ayşe', total: 10 }], columns });
    const { status, set } = source('success');
    renderTable(host, table, { status });
    set('loading');
    expect(host.querySelector('.adt-skeleton')).toBeNull(); // the rows stay, dimmed
    table.setData([]);
    expect(host.querySelectorAll('.adt-skeleton-row').length).toBeGreaterThan(0);
    set('success');
    expect(host.querySelector('.adt-empty')!.textContent).toBe('No matching rows');
  });

  it('caps the placeholders at ten rows and can be turned off', () => {
    const table = createDataTable<Order>({ data: [], columns, initialState: { pageSize: 50 } });
    renderTable(host, table, { status: source('loading').status });
    expect(host.querySelectorAll('.adt-skeleton-row')).toHaveLength(10);
    renderTable(host, table, { status: source('loading').status, skeleton: false });
    expect(host.querySelector('.adt-skeleton-row')).toBeNull();
    expect(host.querySelector('.adt-empty')).not.toBeNull();
  });
});
