import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement as h, StrictMode, useState, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { createDataTable, type ColumnDef, type Row } from '@acunsoft/datatable-core';
import {
  BulkActions, ColumnToggle, DataTable, DataTableLayout, FilterChips, Filters, PageInfo, PageSize, Pagination, Search, Tools, labelsTr, useDataTable, type BulkSelection,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Order = { id: number; customer: string; total: string; locked?: boolean };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
  { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', enableSorting: true },
];
const orders: Order[] = [
  { id: 1, customer: 'Ayşe', total: '1250.50' },
  { id: 2, customer: 'Ali', total: '90.00', locked: true },
  { id: 3, customer: 'Can', total: '400.00' },
];

let host: HTMLElement;
let root: Root | undefined;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => { act(() => root?.unmount()); root = undefined; vi.useRealTimers(); });
const render = (element: ReactElement): void => {
  root ??= createRoot(host);
  act(() => root!.render(element));
};
const make = (pageSize = 10) => createDataTable<Order>({ data: orders, columns, initialState: { pageSize } });
const texts = (selector: string) => [...host.querySelectorAll(selector)].map(node => node.textContent);
const click = (node: Element | null, init: MouseEventInit = {}) =>
  act(() => { node!.dispatchEvent(new MouseEvent('click', { bubbles: true, ...init })); });

describe('DataTable', () => {
  it('renders the DOM renderer markup and follows sorting and multi-sort', () => {
    const table = make();
    render(h(DataTable<Order>, { table, caption: 'Siparişler', locale: 'tr', selectable: true }));
    expect(host.querySelector('caption')!.textContent).toBe('Siparişler');
    expect(texts('thead th.adt-th')).toEqual(['Müşteri', 'Tutar']);
    expect(texts('tbody tr:first-child td:not(.adt-select)')).toEqual(['Ayşe', '1.250,50']);
    click(host.querySelector('th button'));
    expect(host.querySelector('th[aria-sort]')!.getAttribute('aria-sort')).toBe('ascending');
    expect(texts('tbody td:nth-child(2)')).toEqual(['Ali', 'Ayşe', 'Can']);
    click(host.querySelectorAll('th button')[1]!, { shiftKey: true });
    expect(texts('.adt-sort-mark')).toEqual(['▲1', '▲2']);
  });

  it('selects rows and the page with an indeterminate page checkbox', () => {
    const table = make();
    render(h(DataTable<Order>, { table, selectable: true }));
    const boxes = () => [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    click(boxes()[2]!);
    expect(table.getState().selectedIds).toEqual(['2']);
    expect(boxes()[0]!.indeterminate).toBe(true);
    expect(boxes()[2]!.getAttribute('aria-label')).toBe('Select Ali');
    click(boxes()[0]!);
    expect(table.getState().selectedIds).toEqual(['2', '1', '3']);
    expect(boxes()[0]!.checked).toBe(true);
    expect(boxes()[0]!.indeterminate).toBe(false);
  });

  it('renders custom cells, the empty state and keeps values as text', () => {
    const table = createDataTable<Order>({ data: [{ id: 1, customer: '<img src=x onerror=alert(1)>', total: '1' }], columns });
    render(h(DataTable<Order>, {
      table, empty: 'boş',
      cells: { total: ({ text }) => h('strong', null, `${text} ₺`) },
    }));
    expect(host.querySelector('td strong')!.textContent).toBe('1 ₺');
    expect(host.querySelector('img')).toBeNull();
    act(() => table.setGlobalSearch('nobody'));
    expect(host.querySelector('.adt-empty td')!.textContent).toBe('boş');
  });

  it('adds row actions named after the row', () => {
    const remove = vi.fn();
    render(h(DataTable<Order>, {
      table: make(), labels: labelsTr,
      rowActions: [{ id: 'delete', label: 'Sil', onSelect: remove, disabled: (row: Row<Order>) => row.original.locked === true }],
    }));
    const buttons = [...host.querySelectorAll('.adt-action')];
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['Ayşe: Sil', 'Ali: Sil', 'Can: Sil']);
    click(buttons[1]!);
    expect(remove).not.toHaveBeenCalled();
    click(buttons[0]!);
    expect((remove.mock.calls[0]![0] as Row<Order>).original).toBe(orders[0]);
  });

  it('shows server-mode loading and error states', () => {
    let phase: 'loading' | 'error' = 'loading';
    const listeners = new Set<(state: { status: string }) => void>();
    const retry = vi.fn();
    const status = {
      getState: () => ({ status: phase }), // a new object every call: only the phase is read
      subscribe: (fn: (state: { status: string }) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
      retry,
    };
    render(h(DataTable<Order>, { table: make(), status }));
    expect(host.querySelector('.adt-table-wrap')!.getAttribute('aria-busy')).toBe('true');
    act(() => { phase = 'error'; listeners.forEach(fn => fn({ status: phase })); });
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('The data could not be loaded.');
    click(host.querySelector('.adt-retry'));
    expect(retry).toHaveBeenCalled();
  });
});

describe('controls', () => {
  it('numbers the pages with aria-disabled ends', () => {
    const table = make(2);
    render(h(Pagination, { table, labels: labelsTr, firstLast: true }));
    const numbers = () => [...host.querySelectorAll('.adt-page-numbers > *')].map(node => node.textContent);
    expect(numbers()).toEqual(['1', '2']);
    expect(host.querySelector('[aria-current="page"]')!.getAttribute('aria-label')).toBe('Sayfa 1');
    expect(host.querySelector('.adt-previous')!.getAttribute('aria-disabled')).toBe('true');
    click(host.querySelector('.adt-page[aria-label="Sayfa 2"]'));
    expect(table.getState().page).toBe(2);
    expect(host.querySelector('.adt-next')!.getAttribute('aria-disabled')).toBe('true');
    click(host.querySelector('.adt-first'));
    expect(table.getState().page).toBe(1);
  });

  it('keeps a fixed number of page buttons on long tables', () => {
    const table = createDataTable<Order>({ data: Array.from({ length: 200 }, (_, i) => ({ id: i + 1, customer: `R${i}`, total: '1.00' })), columns, initialState: { pageSize: 10 } });
    render(h(Pagination, { table }));
    act(() => table.setPage(10));
    expect([...host.querySelectorAll('.adt-page-numbers > *')].map(node => node.textContent)).toEqual(['1', '…', '9', '10', '11', '…', '20']);
  });

  it('changes the page size and shows the range', () => {
    const table = make(2);
    render(h('div', null, h(PageSize, { table, pageSizes: [2, 10], labels: labelsTr }), h(PageInfo, { table, labels: labelsTr })));
    expect(host.querySelector('.adt-info')!.textContent).toBe('Toplam: 3 kaydın 1 ile 2 arasını gösteriyor');
    expect(() => render(h(PageSize, { table, pageSizes: [] }))).toThrow('pageSizes must be');
    render(h('div', null, h(PageSize, { table, pageSizes: [2, 10], labels: labelsTr }), h(PageInfo, { table, labels: labelsTr })));
    const select = host.querySelector('select')!;
    act(() => {
      select.value = '10';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(table.getState()).toMatchObject({ page: 1, pageSize: 10 });
    expect(host.querySelector('.adt-info')!.textContent).toBe('Toplam: 3 kaydın 1 ile 3 arasını gösteriyor');
  });

  it('debounces search and follows external changes', () => {
    vi.useFakeTimers();
    const table = make();
    render(h(Search, { table, debounceMs: 100 }));
    const input = host.querySelector('input')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, 'ay'); // React tracks the native value setter
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { vi.advanceTimersByTime(99); });
    expect(table.getState().globalSearch).toBe('');
    act(() => { vi.advanceTimersByTime(1); });
    expect(table.getState().globalSearch).toBe('ay');
    act(() => table.setGlobalSearch('ali'));
    expect(input.value).toBe('ali');
  });

  it('toggles columns and runs bulk actions', () => {
    const table = make();
    const archive = vi.fn();
    render(h('div', null,
      h(ColumnToggle, { table }),
      h(BulkActions<Order>, { table, actions: [{ id: 'archive', label: 'Archive', onSelect: archive, disabled: (s: BulkSelection<Order>) => s.rows.length > 5 }] }),
      h(DataTable<Order>, { table })));
    expect(host.querySelector<HTMLElement>('.adt-selection')!.hidden).toBe(true);
    click(host.querySelector('input[value="total"]'));
    expect(texts('thead th')).toEqual(['Müşteri']);
    expect(host.querySelector<HTMLInputElement>('input[value="customer"]')!.disabled).toBe(true);
    act(() => table.selectRows(['1', '3']));
    expect(host.querySelector('.adt-selection-count')!.textContent).toBe('2 selected');
    click(host.querySelector('.adt-bulk-action'));
    expect((archive.mock.calls[0]![0] as BulkSelection<Order>).ids).toEqual(['1', '3']);
  });
});

describe('useDataTable', () => {
  it('creates one table, follows new data arrays and survives Strict Mode', () => {
    let setRows!: (rows: Order[]) => void;
    const seen = new Set<unknown>();
    function Orders(): ReactElement {
      const [rows, set] = useState(orders.slice(0, 1));
      setRows = set;
      const { table, page } = useDataTable<Order>({ data: rows, columns });
      seen.add(table);
      return h('p', null, String(page.totalRows));
    }
    render(h(StrictMode, null, h(Orders)));
    expect(host.textContent).toBe('1');
    act(() => setRows(orders));
    expect(host.textContent).toBe('3');
    act(() => setRows([]));
    expect(host.textContent).toBe('0');
    const live = [...seen].filter(table => (table as { getState(): unknown }).getState() !== undefined);
    expect(live.length).toBeGreaterThan(0);
  });
});

describe('responsive modes and sizes', () => {
  const wide: readonly ColumnDef<Order>[] = [
    { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableSorting: true },
    { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', priority: 3 },
  ];
  const makeWide = () => createDataTable<Order>({ data: orders, columns: wide });

  it('collapse opens the hidden values below the row', () => {
    const edit = vi.fn();
    render(h(DataTable<Order>, { table: makeWide(), responsive: 'collapse', size: 'lg', rowActions: [{ id: 'edit', label: 'Edit', onSelect: edit }] }));
    expect(host.querySelector('.adt-table-wrap')!.className).toBe('adt-table-wrap adt-responsive--collapse adt-size--lg');
    expect(host.querySelector('table')!.className).toBe('adt-table adt-has-p2 adt-has-p3');
    click(host.querySelector('.adt-expand[aria-label="Details of Ayşe"]'));
    const button = host.querySelector('.adt-expand[aria-label="Details of Ayşe"]')!;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const detail = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect([...detail.querySelectorAll('dt')].map(dt => dt.textContent)).toEqual(['Tutar', 'Actions']);
    click(detail.querySelector('.adt-action'));
    expect(edit).toHaveBeenCalledOnce();
    expect(() => render(h(DataTable<Order>, { table: makeWide(), size: 'xl' as never }))).toThrow('size must be sm, md or lg');
  });

  it('modal shows every value of the row in a dialog', () => {
    render(h(DataTable<Order>, { table: makeWide(), responsive: 'modal', labels: labelsTr }));
    click(host.querySelector('.adt-expand'));
    const dialog = host.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('h2')!.textContent).toBe('Ayşe ayrıntıları');
    expect([...dialog.querySelectorAll('dt')].map(dt => dt.textContent)).toEqual(['Müşteri', 'Tutar']);
    click(dialog.querySelector('.adt-dialog-close'));
    expect(dialog.open).toBe(false);
  });
});

describe('filters', () => {
  it('renders the filter menu and chips from the DOM renderer', () => {
    const table = createDataTable<Order>({ data: orders, columns: [
      { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableFiltering: true },
      { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', enableFiltering: true, filter: true },
    ] });
    render(h('div', null, h(Filters, { table, labels: labelsTr }), h(FilterChips, { table, labels: labelsTr, locale: 'tr' })));
    expect(host.querySelector('.adt-filters summary')!.textContent).toContain('Filtreler');
    act(() => table.setFilters([{ field: 'total', operator: 'gte', value: '100' }]));
    expect(host.querySelector('.adt-chip')!.textContent).toBe('Tutar: ≥ 100');
    expect(table.getPage().rows.map(row => row.original.customer)).toEqual(['Ayşe', 'Can']);
  });
});

describe('tools', () => {
  it('renders a tools menu from items', () => {
    const onSelect = vi.fn();
    render(h(Tools, { items: [{ id: 'print', label: 'Yazdır', onSelect }], labels: labelsTr }));
    expect(host.querySelector('.adt-tools summary')!.textContent).toBe('Araçlar');
    click(host.querySelector('[data-action="print"]'));
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe('DataTableLayout', () => {
  it('arranges every control around the table', () => {
    const table = createDataTable<Order>({ data: orders, columns: [
      { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableFiltering: true },
      { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', enableFiltering: true, filter: true },
    ] });
    render(h(DataTableLayout<Order>, {
      table, labels: labelsTr, locale: 'tr', size: 'lg', caption: 'Siparişler', topEnd: h('button', { className: 'mine' }, 'Yeni'),
      cells: { customer: ({ text }) => h('strong', null, text) },
    }));
    const root = host.querySelector('.adt')!;
    expect(root.className).toBe('adt adt-size--lg');
    expect(root.querySelector('.adt-top .adt-bar-end .mine')).not.toBeNull();
    expect(root.querySelector('.adt-top .adt-bar-end .adt-filters')).not.toBeNull();
    expect(root.querySelector('tbody strong')!.textContent).toBe('Ayşe');
    expect(root.querySelector('.adt-bottom .adt-info')!.textContent).toBe('Toplam: 3 kaydın 1 ile 3 arasını gösteriyor');
  });
});
