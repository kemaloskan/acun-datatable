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

describe('row action menu', () => {
  it('keeps the first actions in the row and the rest in ⋮, with confirm', () => {
    const remove = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(h(DataTable<Order>, { table: make(), maxInlineActions: 1, rowActions: [
      { id: 'view', label: 'View', icon: 'view', iconOnly: true, onSelect: () => undefined },
      { id: 'edit', label: 'Edit', onSelect: () => undefined },
      { id: 'delete', label: 'Delete', danger: true, confirm: 'Sure?', onSelect: remove },
    ] }));
    expect(host.querySelector('[data-action="view"]')!.className).toBe('adt-action adt-action--icon');
    expect([...host.querySelectorAll('tbody tr:first-child .adt-row-menu .adt-menu-item')].map(item => item.textContent)).toEqual(['Edit', 'Delete']);
    click(host.querySelector('tbody tr:first-child .adt-row-menu [data-action="delete"]'));
    expect(confirm).toHaveBeenCalledWith('Sure?');
    expect(remove).not.toHaveBeenCalled(); // answered no
  });
});

describe('footer totals', () => {
  it('shows the sum of every matching row', () => {
    const table = createDataTable<Order>({ data: orders, locale: 'tr', initialState: { pageSize: 1 }, columns: [
      { id: 'customer', header: 'Müşteri', accessorKey: 'customer' },
      { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', aggregate: 'sum' },
    ] });
    render(h(DataTable<Order>, { table, locale: 'tr', labels: labelsTr }));
    expect([...host.querySelectorAll('tfoot tr > *')].map(cell => cell.textContent)).toEqual(['Toplam', '1.740,50']);
  });
});

describe('detail', () => {
  it('opens a child row under the row, rendered only while open', () => {
    const detail = vi.fn((row: Row<Order>) => h('p', { className: 'lines' }, `${row.original.customer}: 3 lines`));
    render(h(DataTable<Order>, { table: make(), detail }));
    expect(host.querySelector('table')!.classList.contains('adt-has-detail')).toBe(true);
    expect(host.querySelectorAll('tbody .adt-expand')).toHaveLength(3);
    expect(detail).not.toHaveBeenCalled();
    click(host.querySelector('.adt-expand[aria-label="Details of Ayşe"]'));
    const button = host.querySelector('.adt-expand[aria-label="Details of Ayşe"]')!;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.adt-detail')!.id).toBe(button.getAttribute('aria-controls'));
    expect(texts('.adt-detail .adt-detail-content')).toEqual(['Ayşe: 3 lines']);
    expect(host.querySelector('.adt-detail td')!.getAttribute('colspan')).toBe('3');
    click(button);
    expect(host.querySelector('.adt-detail')).toBeNull();
  });

  it('passes through DataTableLayout', () => {
    render(h(DataTableLayout<Order>, { table: make(), detail: () => 'x' }));
    expect(host.querySelectorAll('tbody .adt-expand')).toHaveLength(3);
  });
});

describe('skeleton', () => {
  it('shows placeholder rows while the first rows load', () => {
    let phase = 'loading';
    const listeners = new Set<(state: { status: string }) => void>();
    const status = {
      getState: () => ({ status: phase as 'loading' }),
      subscribe: (fn: (state: { status: string }) => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; },
    };
    const table = createDataTable<Order>({ data: [], columns, initialState: { pageSize: 3 } });
    render(h(DataTable<Order>, { table, status, selectable: true }));
    expect(host.querySelectorAll('tbody .adt-skeleton-row')).toHaveLength(3);
    expect(host.querySelectorAll('tbody .adt-skeleton-row:first-child td')).toHaveLength(3);
    expect(host.querySelector('tbody')!.getAttribute('aria-hidden')).toBe('true');
    act(() => {
      table.setData(orders);
      phase = 'success';
      listeners.forEach(listener => listener({ status: 'success' }));
    });
    expect(host.querySelector('.adt-skeleton')).toBeNull();
    expect(host.querySelectorAll('tbody .adt-row')).toHaveLength(3);
  });
});

describe('fixed columns', () => {
  it('pins the first and last cells', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return { width: /^T[HD]$/.test(this.tagName) ? 80 : 2000 } as DOMRect; });
    render(h(DataTable<Order>, { table: make(), selectable: true, fixedColumns: { start: 1, end: 1 } }));
    const cells = [...host.querySelectorAll<HTMLElement>('tbody tr:first-child > td')];
    expect(cells.map(cell => cell.classList.contains('adt-pin'))).toEqual([true, true, true]);
    expect(cells.map(cell => cell.style.left || cell.style.right)).toEqual(['0px', '80px', '0px']);
    vi.restoreAllMocks();
  });
});

describe('resizable and movable columns', () => {
  it('renders handles and widths, and moves columns from the menu', () => {
    const table = make();
    render(h(DataTableLayout<Order>, { table, resizableColumns: true, reorderableColumns: true }));
    expect(host.querySelectorAll('thead .adt-resize')).toHaveLength(2);
    expect(host.querySelector('thead th[data-column-id="customer"]')!.getAttribute('draggable')).toBe('true');
    act(() => table.setColumnWidth('total', 180));
    expect(host.querySelector<HTMLElement>('thead th[data-column-id="total"]')!.style.width).toBe('180px');
    expect(host.querySelector('table')!.classList.contains('adt-fixed-layout')).toBe(true);
    click(host.querySelector('.adt-move[aria-label="Move Tutar up"]'));
    expect([...host.querySelectorAll<HTMLElement>('thead th[data-column-id]')].map(th => th.dataset['columnId'])).toEqual(['total', 'customer']);
    click(host.querySelector('.adt-columns-reset'));
    expect(table.getState().columnWidths).toEqual({});
  });

  it('resizes with the keyboard through the shared column tools', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: 120, left: 0 } as DOMRect));
    const table = make();
    render(h(DataTable<Order>, { table, resizableColumns: true }));
    const handle = host.querySelector<HTMLElement>('.adt-resize[data-column-id="total"]')!;
    act(() => { handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); });
    expect(table.getState().columnWidths).toEqual({ customer: 120, total: 136 });
    vi.restoreAllMocks();
  });
});

describe('editing in place', () => {
  it('mounts the shared editor in the cell and saves through onEdit', async () => {
    const table = createDataTable<Order>({ data: orders, initialState: { pageSize: 10 }, columns: [
      { id: 'customer', header: 'Müşteri', accessorKey: 'customer', editable: true },
      { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal' },
    ] });
    const onEdit = vi.fn(async ({ row, value }: { row: Row<Order>; value: unknown }) => {
      table.setData(orders.map(order => (String(order.id) === row.id ? { ...order, customer: String(value) } : order)));
    });
    render(h(DataTable<Order>, { table, onEdit }));
    expect(host.querySelectorAll('.adt-edit')).toHaveLength(3);
    click(host.querySelector('.adt-edit[aria-label="Edit Müşteri: Ayşe"]'));
    const input = host.querySelector<HTMLInputElement>('td.adt-editing .adt-edit-control')!;
    expect(input.value).toBe('Ayşe');
    expect(document.activeElement).toBe(input);
    input.value = 'Ayşe Yılmaz';
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    expect(host.querySelector('.adt-editor')).toBeNull();
    expect(onEdit).toHaveBeenCalledOnce();
    expect(host.querySelector('tbody tr:first-child td')!.textContent).toBe('Ayşe Yılmaz');
    expect(document.activeElement).toBe(host.querySelector('.adt-edit[aria-label="Edit Müşteri: Ayşe Yılmaz"]'));
  });
});

describe('virtual scrolling', () => {
  it('draws only the rows in view and follows the scroll', async () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, customer: `C${i + 1}`, total: '1.00' }));
    const table = createDataTable<Order>({ data: many, columns });
    render(h(DataTableLayout<Order>, { table, virtual: { rowHeight: 40, overscan: 2 }, selectable: true }));
    expect(host.querySelectorAll('tbody .adt-row').length).toBeLessThan(20);
    expect(host.querySelector('table')!.getAttribute('aria-rowcount')).toBe('5001');
    expect(host.querySelector('.adt-paging, .adt-length')).toBeNull();
    const scroller = host.querySelector<HTMLElement>('.adt-scroll')!;
    scroller.scrollTop = 40_000;
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 40));
    });
    expect(host.querySelector('tbody .adt-row td:nth-child(2)')!.textContent).toBe('C999');
  });
});

describe('virtual scrolling and editing', () => {
  const editable: readonly ColumnDef<Order>[] = [
    { id: 'customer', header: 'Müşteri', accessorKey: 'customer', editable: true },
    { id: 'total', header: 'Tutar', accessorKey: 'total' },
  ];
  const many = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, customer: `C${i + 1}`, total: '1.00' }));
  const scrollTo = async (top: number): Promise<void> => {
    const scroller = host.querySelector<HTMLElement>('.adt-scroll')!;
    scroller.scrollTop = top;
    await act(async () => {
      scroller.dispatchEvent(new Event('scroll', { bubbles: true }));
      await new Promise(resolve => setTimeout(resolve, 40));
    });
  };

  it('scrolls sideways on narrow screens unless responsive is given', () => {
    const table = createDataTable<Order>({ data: orders, columns });
    render(h(DataTable<Order>, { table, virtual: true }));
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-responsive--scroll')).toBe(true);
    render(h(DataTable<Order>, { table, virtual: true, responsive: 'cards' }));
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-responsive--cards')).toBe(true);
  });

  it('edits a row past the first page and keeps the editor while it is scrolled out of view', async () => {
    const table = createDataTable<Order>({ data: many, columns: editable, initialState: { pageSize: 10 } });
    render(h(DataTable<Order>, { table, virtual: { rowHeight: 40, overscan: 2 }, onEdit: () => undefined }));
    await scrollTo(4000);
    click(host.querySelector('.adt-edit[aria-label="Edit Müşteri: C99"]'));
    const editor = host.querySelector('td.adt-editing .adt-editor');
    expect(editor).not.toBeNull();
    await scrollTo(12_000);
    expect(host.querySelector('.adt-editor')).toBeNull();
    await scrollTo(4000);
    expect(host.querySelector('td.adt-editing .adt-editor')).toBe(editor);
    act(() => table.setGlobalSearch('C1')); // C99 no longer matches: the edit ends
    act(() => table.setGlobalSearch(''));
    expect(host.querySelector('td.adt-editing')).toBeNull();
  });

  it('keeps the editor of a row on the first page when its cell is drawn again', async () => {
    const table = createDataTable<Order>({ data: many, columns: editable, initialState: { pageSize: 10 } });
    render(h(DataTable<Order>, { table, virtual: { rowHeight: 40, overscan: 2 }, onEdit: () => undefined }));
    click(host.querySelector('.adt-edit[aria-label="Edit Müşteri: C1"]'));
    const editor = host.querySelector('td.adt-editing .adt-editor');
    expect(editor).not.toBeNull();
    await scrollTo(8000);
    await scrollTo(0);
    expect(host.querySelector('td.adt-editing .adt-editor')).toBe(editor);
  });

  it('measures the viewport once mounted and follows resizes', () => {
    let height = 1200;
    let resized: (() => void) | undefined;
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height);
    (window as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(callback: () => void) { resized = callback; }
      observe(): void { /* the test calls the callback */ }
      disconnect(): void { resized = undefined; }
    };
    try {
      render(h(DataTable<Order>, { table: createDataTable<Order>({ data: many, columns }), virtual: { rowHeight: 40, overscan: 0 } }));
      expect(host.querySelectorAll('tbody .adt-row')).toHaveLength(30); // 1200px of 40px rows
      height = 400;
      act(() => resized!());
      expect(host.querySelectorAll('tbody .adt-row')).toHaveLength(10);
    } finally {
      delete (window as { ResizeObserver?: unknown }).ResizeObserver;
      vi.restoreAllMocks();
    }
  });
});

describe('changing props', () => {
  it('keeps bulk actions and tools mounted across parent re-renders, calling the latest callbacks', () => {
    const table = make();
    const calls: number[] = [];
    const view = (count: number): ReactElement => h('div', { 'data-count': count },
      h(BulkActions<Order>, { table, actions: [{ id: 'archive', label: 'Archive', onSelect: () => calls.push(count) }] }),
      h(Tools, { items: [{ id: 'print', label: 'Print', onSelect: () => calls.push(-count) }] }));
    render(view(0));
    act(() => table.selectRow('1'));
    const bar = host.querySelector('.adt-selection');
    const menu = host.querySelector<HTMLDetailsElement>('.adt-tools')!;
    menu.open = true;
    render(view(1));
    expect(host.querySelector('.adt-selection')).toBe(bar);
    expect(host.querySelector('.adt-tools')).toBe(menu);
    expect(menu.open).toBe(true);
    click(host.querySelector('.adt-bulk-action'));
    click(host.querySelector('[data-action="print"]'));
    expect(calls).toEqual([1, -1]);
  });
});
