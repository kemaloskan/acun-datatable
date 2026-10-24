import { beforeEach, describe, expect, it } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { labelsTr, renderTable } from '../src/index';

type R = { id: number; customer: string; total: string; qty: number };
const columns: readonly ColumnDef<R>[] = [
  { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableFiltering: true },
  { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', aggregate: 'sum' },
  { id: 'qty', header: 'Adet', accessorKey: 'qty', type: 'number', aggregate: 'avg' },
];
const data: R[] = [
  { id: 1, customer: 'Ayşe', total: '1250.50', qty: 2 },
  { id: 2, customer: 'Ali', total: '99.90', qty: 3 },
  { id: 3, customer: 'Can', total: '0.10', qty: 4 },
];
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});

describe('footer totals', () => {
  it('shows the totals of every matching row in a tfoot', () => {
    const table = createDataTable<R>({ data, columns, locale: 'tr', initialState: { pageSize: 1 } });
    renderTable(host, table, { locale: 'tr', labels: labelsTr, selectable: true });
    const cells = () => [...host.querySelectorAll('tfoot tr > *')].map(cell => cell.textContent);
    expect(cells()).toEqual(['', 'Toplam', '1.350,50', '3']); // all three rows, not the page of one
    expect(host.querySelector('tfoot th')!.getAttribute('scope')).toBe('row');
    expect(host.querySelector('tfoot td.adt-num')!.getAttribute('title')).toBe('Toplam');
    table.setGlobalSearch('ali');
    expect(cells()).toEqual(['', 'Toplam', '99,90', '3']);
  });

  it('leaves out the footer without aggregate columns', () => {
    renderTable(host, createDataTable<R>({ data, columns: [columns[0]!] }));
    expect(host.querySelector('tfoot')).toBeNull();
  });
});
