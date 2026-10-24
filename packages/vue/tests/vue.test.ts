import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, createSSRApp, defineComponent, h, nextTick, ref, shallowRef, type App, type Component } from 'vue';
import { renderToString } from 'vue/server-renderer';
import { createDataTable, type ColumnDef, type Row } from '@acunsoft/datatable-core';
import {
  AcunBulkActions, AcunColumnToggle, AcunDataTable, AcunDataTableLayout, AcunFilterChips, AcunFilters, AcunPageInfo, AcunPageSize, AcunPagination, AcunSearch, AcunTools, labelsTr, useDataTable, type BulkSelection,
} from '../src/index';

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
let app: App | undefined;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => { app?.unmount(); app = undefined; vi.useRealTimers(); });
const mount = async (render: () => ReturnType<typeof h>): Promise<void> => {
  app = createApp(defineComponent({ setup: () => render }) as Component);
  app.mount(host);
  await nextTick();
};
const make = (pageSize = 10) => createDataTable<Order>({ data: orders, columns, initialState: { pageSize } });
const texts = (selector: string) => [...host.querySelectorAll(selector)].map(node => node.textContent);

describe('AcunDataTable', () => {
  it('renders the same accessible markup as the DOM renderer and follows the table', async () => {
    const table = make();
    await mount(() => h(AcunDataTable, { table, caption: 'Siparişler', locale: 'tr', selectable: true }));
    expect(host.querySelector('caption')!.textContent).toBe('Siparişler');
    expect(texts('thead th.adt-th')).toEqual(['Müşteri', 'Tutar']);
    expect(texts('tbody tr:first-child td:not(.adt-select)')).toEqual(['Ayşe', '1.250,50']);
    expect(host.querySelector('tbody td')!.querySelector('input')!.getAttribute('aria-label')).toBe('Select Ayşe');

    host.querySelector<HTMLButtonElement>('th button')!.click();
    await nextTick();
    expect(table.getState().sorting).toEqual([{ field: 'customer', direction: 'asc' }]);
    expect(host.querySelector('th[aria-sort]')!.getAttribute('aria-sort')).toBe('ascending');
    expect(texts('tbody td:nth-child(2)')).toEqual(['Ali', 'Ayşe', 'Can']);

    const totalButton = host.querySelectorAll<HTMLButtonElement>('th button')[1]!;
    totalButton.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    await nextTick();
    expect(texts('.adt-sort-mark')).toEqual(['▲1', '▲2']);
  });

  it('selects rows and the page, with an indeterminate page checkbox', async () => {
    const table = make();
    await mount(() => h(AcunDataTable, { table, selectable: true }));
    const boxes = () => [...host.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')];
    boxes()[2]!.click();
    await nextTick();
    expect(table.getState().selectedIds).toEqual(['2']);
    expect(boxes()[0]!.indeterminate).toBe(true);
    expect(host.querySelector('tr.adt-row--selected')!.getAttribute('data-row-id')).toBe('2');
    boxes()[0]!.click();
    await nextTick();
    expect(table.getState().selectedIds).toEqual(['2', '1', '3']);
    expect(boxes()[0]!.checked).toBe(true);
  });

  it('renders custom cells through slots and keeps values as text', async () => {
    const table = createDataTable<Order>({ data: [{ id: 1, customer: '<img src=x onerror=alert(1)>', total: '1' }], columns });
    await mount(() => h(AcunDataTable, { table }, {
      'cell-total': ({ text }: { text: string }) => h('strong', `${text} ₺`),
      empty: () => 'boş',
    }));
    expect(host.querySelector('td strong')!.textContent).toBe('1 ₺');
    expect(host.querySelector('img')).toBeNull();
    expect(host.querySelector('td')!.textContent).toBe('<img src=x onerror=alert(1)>');
    table.setGlobalSearch('nobody');
    await nextTick();
    expect(host.querySelector('.adt-empty td')!.textContent).toBe('boş');
  });

  it('adds row actions named after the row, hidden or disabled per row', async () => {
    const remove = vi.fn();
    await mount(() => h(AcunDataTable, {
      table: make(), labels: labelsTr,
      rowActions: [{ id: 'delete', label: 'Sil', onSelect: remove, disabled: (row: Row<Order>) => row.original.locked === true }],
    }));
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('.adt-action')];
    expect(buttons.map(button => button.getAttribute('aria-label'))).toEqual(['Ayşe: Sil', 'Ali: Sil', 'Can: Sil']);
    expect(texts('thead th')).toContain('İşlemler');
    buttons[1]!.click();
    expect(remove).not.toHaveBeenCalled();
    buttons[0]!.click();
    expect(remove.mock.calls[0]![0].original).toBe(orders[0]);
  });

  it('shows loading and error states from a status source', async () => {
    let listener: (state: { status: string }) => void = () => undefined;
    let current = 'loading';
    const retry = vi.fn();
    const status = { getState: () => ({ status: current as 'loading' }), subscribe: (fn: typeof listener) => { listener = fn; return () => undefined; }, retry };
    await mount(() => h(AcunDataTable, { table: make(), status }));
    expect(host.querySelector('.adt-table-wrap')!.getAttribute('aria-busy')).toBe('true');
    expect(host.querySelector('[role="status"]')!.textContent).toBe('Loading…');
    current = 'error';
    listener({ status: 'error' });
    await nextTick();
    expect(host.querySelector('[role="alert"]')!.textContent).toContain('The data could not be loaded.');
    host.querySelector<HTMLButtonElement>('.adt-retry')!.click();
    expect(retry).toHaveBeenCalled();
  });
});

describe('controls', () => {
  it('numbers the pages with aria-disabled ends', async () => {
    const table = make(2);
    await mount(() => h(AcunPagination, { table, labels: labelsTr, firstLast: true }));
    const numbers = () => [...host.querySelectorAll('.adt-page-numbers > *')].map(node => node.textContent);
    expect(numbers()).toEqual(['1', '2']);
    expect(host.querySelector('[aria-current="page"]')!.getAttribute('aria-label')).toBe('Sayfa 1');
    expect(host.querySelector('.adt-previous')!.getAttribute('aria-disabled')).toBe('true');
    host.querySelector<HTMLButtonElement>('.adt-page[aria-label="Sayfa 2"]')!.click();
    await nextTick();
    expect(table.getState().page).toBe(2);
    expect(host.querySelector('.adt-next')!.getAttribute('aria-disabled')).toBe('true');
    host.querySelector<HTMLButtonElement>('.adt-first')!.click();
    await nextTick();
    expect(table.getState().page).toBe(1);
  });

  it('keeps a fixed number of page buttons on long tables', async () => {
    const table = createDataTable<Order>({ data: Array.from({ length: 200 }, (_, i) => ({ id: i + 1, customer: `R${i}`, total: '1.00' })), columns, initialState: { pageSize: 10 } });
    await mount(() => h(AcunPagination, { table }));
    table.setPage(10);
    await nextTick();
    expect([...host.querySelectorAll('.adt-page-numbers > *')].map(node => node.textContent)).toEqual(['1', '…', '9', '10', '11', '…', '20']);
  });

  it('changes the page size and shows the range', async () => {
    const table = make(2);
    await mount(() => h('div', [h(AcunPageSize, { table, pageSizes: [2, 10], labels: labelsTr }), h(AcunPageInfo, { table, labels: labelsTr })]));
    expect(host.querySelector('.adt-info')!.textContent).toBe('Toplam: 3 kaydın 1 ile 2 arasını gösteriyor');
    expect(host.querySelector('.adt-length .adt-sr-only')!.textContent).toBe('Sayfa başına satır');
    const select = host.querySelector('select')!;
    select.value = '10';
    select.dispatchEvent(new Event('change'));
    await nextTick();
    expect(table.getState()).toMatchObject({ page: 1, pageSize: 10 });
    expect(host.querySelector('.adt-info')!.textContent).toBe('Toplam: 3 kaydın 1 ile 3 arasını gösteriyor');
  });

  it('debounces search and follows external changes', async () => {
    vi.useFakeTimers();
    const table = make();
    await mount(() => h(AcunSearch, { table, debounceMs: 100, labels: labelsTr }));
    const input = host.querySelector('input')!;
    expect(host.querySelector('label .adt-sr-only')!.textContent).toBe('Ara');
    expect(input.placeholder).toBe('Ara…');
    input.value = 'ay';
    input.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(99);
    expect(table.getState().globalSearch).toBe('');
    vi.advanceTimersByTime(1);
    expect(table.getState().globalSearch).toBe('ay');
    table.setGlobalSearch('ali');
    await nextTick();
    expect(input.value).toBe('ali');
  });

  it('toggles columns and runs bulk actions', async () => {
    const table = make();
    const archive = vi.fn();
    await mount(() => h('div', [
      h(AcunColumnToggle, { table }),
      h(AcunBulkActions, { table, actions: [{ id: 'archive', label: 'Archive', onSelect: archive, disabled: (selection: BulkSelection<Order>) => selection.rows.length > 5 }] }),
      h(AcunDataTable, { table }),
    ]));
    expect(host.querySelector<HTMLElement>('.adt-selection')!.hidden).toBe(true);
    const box = host.querySelector<HTMLInputElement>('input[value="total"]')!;
    box.checked = false;
    box.dispatchEvent(new Event('change'));
    await nextTick();
    expect(texts('thead th')).toEqual(['Müşteri']);
    expect(host.querySelector<HTMLInputElement>('input[value="customer"]')!.disabled).toBe(true); // last visible

    table.selectRows(['1', '3']);
    await nextTick();
    expect(host.querySelector('.adt-selection-count')!.textContent).toBe('2 selected');
    host.querySelector<HTMLButtonElement>('.adt-bulk-action')!.click();
    expect(archive.mock.calls[0]![0].ids).toEqual(['1', '3']);
  });
});

describe('useDataTable', () => {
  it('creates a table that follows a data ref and is destroyed with the component', async () => {
    const data = ref<Order[]>(orders.slice(0, 1));
    let binding!: ReturnType<typeof useDataTable<Order>>;
    app = createApp(defineComponent({
      setup() {
        binding = useDataTable<Order>({ data, columns }); // composables run in setup
        return () => h('p', String(binding.page.value.totalRows));
      },
    }));
    app.mount(host);
    await nextTick();
    expect(host.textContent).toBe('1');
    data.value = orders;
    await nextTick();
    await nextTick();
    expect(host.textContent).toBe('3');
    const listener = vi.fn();
    binding.table.subscribe(listener);
    app!.unmount();
    app = undefined;
    binding.table.setPage(1);
    binding.table.setGlobalSearch('x');
    expect(listener).not.toHaveBeenCalled(); // destroyed
  });
});

describe('responsive modes and sizes', () => {
  const wide: readonly ColumnDef<Order>[] = [
    { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableSorting: true },
    { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', priority: 3 },
  ];
  const makeWide = () => createDataTable<Order>({ data: orders, columns: wide });

  it('collapse opens the hidden values below the row', async () => {
    const edit = vi.fn();
    await mount(() => h(AcunDataTable, { table: makeWide(), responsive: 'collapse', size: 'sm', rowActions: [{ id: 'edit', label: 'Edit', onSelect: edit }] }));
    expect(host.querySelector('.adt-table-wrap')!.className).toBe('adt-table-wrap adt-responsive--collapse adt-size--sm');
    expect(host.querySelector('table')!.className).toBe('adt-table adt-has-p2 adt-has-p3');
    const button = host.querySelector<HTMLButtonElement>('.adt-expand[aria-label="Details of Ayşe"]')!;
    button.click();
    await nextTick();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const detail = document.getElementById(button.getAttribute('aria-controls')!)!;
    expect([...detail.querySelectorAll('dt')].map(dt => dt.textContent)).toEqual(['Tutar', 'Actions']);
    detail.querySelector<HTMLButtonElement>('.adt-action')!.click();
    expect(edit).toHaveBeenCalledOnce();
  });

  it('modal shows every value of the row in a dialog', async () => {
    await mount(() => h(AcunDataTable, { table: makeWide(), responsive: 'modal', labels: labelsTr }));
    host.querySelector<HTMLButtonElement>('.adt-expand')!.click();
    await nextTick();
    await nextTick();
    const dialog = host.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('h2')!.textContent).toBe('Ayşe ayrıntıları');
    expect([...dialog.querySelectorAll('dt')].map(dt => dt.textContent)).toEqual(['Müşteri', 'Tutar']);
  });
});

describe('filters', () => {
  it('renders the filter menu and chips from the DOM renderer', async () => {
    const table = createDataTable<Order>({ data: orders, columns: [
      { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableFiltering: true },
      { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', enableFiltering: true, filter: true },
    ] });
    await mount(() => h('div', [h(AcunFilters, { table, labels: labelsTr }), h(AcunFilterChips, { table, labels: labelsTr, locale: 'tr' })]));
    expect(host.querySelector('.adt-filters summary')!.textContent).toContain('Filtreler');
    table.setFilters([{ field: 'total', operator: 'gte', value: '100' }]);
    expect(host.querySelector('.adt-chip')!.textContent).toBe('Tutar: ≥ 100');
    app!.unmount();
    app = undefined;
    table.setFilters([]); // listeners are gone with the component
  });
});

describe('tools', () => {
  it('renders a tools menu from items', async () => {
    const onSelect = vi.fn();
    await mount(() => h(AcunTools, { items: [{ id: 'print', label: 'Yazdır', onSelect }], labels: labelsTr }));
    expect(host.querySelector('.adt-tools summary')!.textContent).toBe('Araçlar');
    host.querySelector<HTMLButtonElement>('[data-action="print"]')!.click();
    expect(onSelect).toHaveBeenCalledOnce();
  });
});

describe('AcunDataTableLayout', () => {
  it('arranges every control around the table and passes cell slots', async () => {
    const table = createDataTable<Order>({ data: orders, columns: [
      { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableFiltering: true },
      { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', enableFiltering: true, filter: true },
    ] });
    await mount(() => h(AcunDataTableLayout, { table, labels: labelsTr, locale: 'tr', size: 'sm', caption: 'Siparişler', tools: [{ id: 'x', label: 'X', onSelect: () => undefined }] }, {
      'cell-customer': ({ text }: { text: string }) => h('strong', text),
      'top-start': () => h('button', { class: 'mine' }, 'Yeni'),
    }));
    const root = host.querySelector('.adt')!;
    expect(root.className).toBe('adt adt-size--sm');
    expect(root.querySelector('.adt-top .adt-bar-start .adt-length')).not.toBeNull();
    expect(root.querySelector('.adt-top .adt-bar-start .mine')).not.toBeNull();
    expect(root.querySelector('.adt-top .adt-bar-end .adt-filters')).not.toBeNull();
    expect(root.querySelector('.adt-top .adt-bar-end .adt-tools')).not.toBeNull();
    expect(root.querySelector('caption')!.textContent).toBe('Siparişler');
    expect(root.querySelector('tbody strong')!.textContent).toBe('Ayşe');
    expect(root.querySelector('.adt-bottom .adt-info')!.textContent).toBe('Toplam: 3 kaydın 1 ile 3 arasını gösteriyor');
    expect(root.querySelector('.adt-bottom .adt-paging')).not.toBeNull();
  });
});

describe('row action menu', () => {
  it('keeps the first actions in the row and the rest in ⋮, with confirm', async () => {
    const remove = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await mount(() => h(AcunDataTable, { table: make(), maxInlineActions: 1, rowActions: [
      { id: 'view', label: 'View', icon: 'view', iconOnly: true, onSelect: () => undefined },
      { id: 'edit', label: 'Edit', onSelect: () => undefined },
      { id: 'delete', label: 'Delete', danger: true, confirm: 'Sure?', onSelect: remove },
    ] }));
    expect(host.querySelector('[data-action="view"]')!.className).toBe('adt-action adt-action--icon');
    expect([...host.querySelectorAll('tbody tr:first-child .adt-row-menu .adt-menu-item')].map(item => item.textContent)).toEqual(['Edit', 'Delete']);
    host.querySelector<HTMLButtonElement>('tbody tr:first-child .adt-row-menu [data-action="delete"]')!.click();
    expect(confirm).toHaveBeenCalledWith('Sure?');
    expect(remove).toHaveBeenCalledOnce();
  });
});

describe('footer totals', () => {
  it('shows the sum of every matching row', async () => {
    const table = createDataTable<Order>({ data: orders, locale: 'tr', initialState: { pageSize: 1 }, columns: [
      { id: 'customer', header: 'Müşteri', accessorKey: 'customer' },
      { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', aggregate: 'sum' },
    ] });
    await mount(() => h(AcunDataTable, { table, locale: 'tr', labels: labelsTr }));
    expect([...host.querySelectorAll('tfoot tr > *')].map(cell => cell.textContent)).toEqual(['Toplam', '1.740,50']);
  });
});

describe('detail slot', () => {
  it('opens a child row under the row, rendered only while open', async () => {
    const detail = vi.fn(({ row }: { row: Row<Order> }) => h('p', { class: 'lines' }, `${row.original.customer}: 3 lines`));
    await mount(() => h(AcunDataTable, { table: make() }, { detail }));
    expect(host.querySelector('table')!.classList.contains('adt-has-detail')).toBe(true);
    expect(host.querySelectorAll('tbody .adt-expand')).toHaveLength(3);
    expect(detail).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>('.adt-expand[aria-label="Details of Ayşe"]')!.click();
    await nextTick();
    const button = host.querySelector<HTMLButtonElement>('.adt-expand[aria-label="Details of Ayşe"]')!;
    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(host.querySelector('.adt-detail')!.id).toBe(button.getAttribute('aria-controls'));
    expect(host.querySelector('.adt-detail .adt-detail-content')!.textContent).toBe('Ayşe: 3 lines');
    expect(host.querySelector('.adt-detail td')!.getAttribute('colspan')).toBe('3');
    button.click();
    await nextTick();
    expect(host.querySelector('.adt-detail')).toBeNull();
  });

  it('passes through AcunDataTableLayout', async () => {
    await mount(() => h(AcunDataTableLayout, { table: make() }, { detail: () => 'x' }));
    expect(host.querySelectorAll('tbody .adt-expand')).toHaveLength(3);
  });
});

describe('skeleton', () => {
  it('shows placeholder rows while the first rows load', async () => {
    let listener: (state: { status: string }) => void = () => undefined;
    let current = 'loading';
    const status = { getState: () => ({ status: current as 'loading' }), subscribe: (fn: typeof listener) => { listener = fn; return () => undefined; } };
    const table = createDataTable<Order>({ data: [], columns, initialState: { pageSize: 3 } });
    await mount(() => h(AcunDataTable, { table, status, selectable: true }));
    expect(host.querySelectorAll('tbody .adt-skeleton-row')).toHaveLength(3);
    expect(host.querySelectorAll('tbody .adt-skeleton-row:first-child td')).toHaveLength(3);
    expect(host.querySelector('tbody')!.getAttribute('aria-hidden')).toBe('true');
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-skeleton-on')).toBe(true);
    table.setData(orders);
    current = 'success';
    listener({ status: 'success' });
    await nextTick();
    expect(host.querySelector('.adt-skeleton')).toBeNull();
    expect(host.querySelectorAll('tbody .adt-row')).toHaveLength(3);
  });
});

describe('fixed columns', () => {
  it('pins the first and last cells', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) { return { width: /^T[HD]$/.test(this.tagName) ? 80 : 2000 } as DOMRect; });
    await mount(() => h(AcunDataTable, { table: make(), selectable: true, fixedColumns: { start: 1, end: 1 } }));
    const cells = [...host.querySelectorAll<HTMLElement>('tbody tr:first-child > td')];
    expect(cells.map(cell => cell.classList.contains('adt-pin'))).toEqual([true, true, true]);
    expect(cells.map(cell => cell.style.left || cell.style.right)).toEqual(['0px', '80px', '0px']);
    vi.restoreAllMocks();
  });
});

describe('resizable and movable columns', () => {
  it('renders handles and widths, and moves columns from the menu', async () => {
    const table = make();
    await mount(() => h(AcunDataTableLayout, { table, resizableColumns: true, reorderableColumns: true }));
    expect(host.querySelectorAll('thead .adt-resize')).toHaveLength(2);
    expect(host.querySelector('thead th[data-column-id="customer"]')!.getAttribute('draggable')).toBe('true');
    table.setColumnWidth('total', 180);
    await nextTick();
    expect(host.querySelector<HTMLElement>('thead th[data-column-id="total"]')!.style.width).toBe('180px');
    expect(host.querySelector('table')!.classList.contains('adt-fixed-layout')).toBe(true);
    host.querySelector<HTMLButtonElement>('.adt-move[aria-label="Move Tutar up"]')!.click();
    await nextTick();
    expect([...host.querySelectorAll<HTMLElement>('thead th[data-column-id]')].map(th => th.dataset['columnId'])).toEqual(['total', 'customer']);
    host.querySelector<HTMLButtonElement>('.adt-columns-reset')!.click();
    await nextTick();
    expect(table.getState().columnWidths).toEqual({});
    expect([...host.querySelectorAll<HTMLElement>('thead th[data-column-id]')].map(th => th.dataset['columnId'])).toEqual(['customer', 'total']);
  });

  it('resizes with the keyboard through the shared column tools', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ width: 120, left: 0 } as DOMRect));
    const table = make();
    await mount(() => h(AcunDataTable, { table, resizableColumns: true }));
    const handle = host.querySelector<HTMLElement>('.adt-resize[data-column-id="total"]')!;
    handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
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
    await mount(() => h(AcunDataTable, { table, onEdit }));
    expect(host.querySelectorAll('.adt-edit')).toHaveLength(3);
    host.querySelector<HTMLButtonElement>('.adt-edit[aria-label="Edit Müşteri: Ayşe"]')!.click();
    await nextTick();
    const input = host.querySelector<HTMLInputElement>('td.adt-editing .adt-edit-control')!;
    expect(input.value).toBe('Ayşe');
    expect(document.activeElement).toBe(input);
    input.value = 'Ayşe Yılmaz';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await vi.waitFor(() => expect(host.querySelector('.adt-editor')).toBeNull());
    expect(onEdit).toHaveBeenCalledOnce();
    expect(host.querySelector('tbody tr:first-child td')!.textContent).toBe('Ayşe Yılmaz');
    await nextTick();
    expect(document.activeElement).toBe(host.querySelector('.adt-edit[aria-label="Edit Müşteri: Ayşe Yılmaz"]'));
  });
});

describe('virtual scrolling', () => {
  it('draws only the rows in view and follows the scroll', async () => {
    const many = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1, customer: `C${i + 1}`, total: '1.00' }));
    const table = createDataTable<Order>({ data: many, columns });
    await mount(() => h(AcunDataTableLayout, { table, virtual: { rowHeight: 40, overscan: 2 }, selectable: true }));
    expect(host.querySelectorAll('tbody .adt-row').length).toBeLessThan(20);
    expect(host.querySelector('table')!.getAttribute('aria-rowcount')).toBe('5001');
    expect(host.querySelector('.adt-paging, .adt-length')).toBeNull();
    expect(host.querySelector('.adt-info')!.textContent).toBe('Showing 1 to 5,000 of 5,000 rows');
    const scroller = host.querySelector<HTMLElement>('.adt-scroll')!;
    scroller.scrollTop = 40_000;
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise(resolve => setTimeout(resolve, 40));
    await nextTick();
    expect(host.querySelector('tbody .adt-row td:nth-child(2)')!.textContent).toBe('C999');
    host.querySelector<HTMLInputElement>('thead .adt-select input')!.click();
    expect(table.getState().selectedIds).toHaveLength(5000);
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
    scroller.dispatchEvent(new Event('scroll'));
    await new Promise(resolve => setTimeout(resolve, 40));
    await nextTick();
    await nextTick();
  };

  it('scrolls sideways on narrow screens unless responsive is given', async () => {
    const table = createDataTable<Order>({ data: orders, columns });
    const mode = shallowRef<'cards' | undefined>(undefined);
    await mount(() => h(AcunDataTable, { table, virtual: true, ...(mode.value ? { responsive: mode.value } : {}) }));
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-responsive--scroll')).toBe(true);
    mode.value = 'cards';
    await nextTick();
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-responsive--cards')).toBe(true);
  });

  it('edits a row past the first page and keeps the editor while it is scrolled out of view', async () => {
    const table = createDataTable<Order>({ data: many, columns: editable, initialState: { pageSize: 10 } });
    await mount(() => h(AcunDataTable, { table, virtual: { rowHeight: 40, overscan: 2 }, onEdit: () => undefined }));
    await scrollTo(4000);
    host.querySelector<HTMLButtonElement>('.adt-edit[aria-label="Edit Müşteri: C99"]')!.click();
    await nextTick();
    await nextTick();
    const editor = host.querySelector('td.adt-editing .adt-editor');
    expect(editor).not.toBeNull();
    await scrollTo(12_000);
    expect(host.querySelector('.adt-editor')).toBeNull();
    await scrollTo(4000);
    expect(host.querySelector('td.adt-editing .adt-editor')).toBe(editor);
    table.setGlobalSearch('C1'); // C99 no longer matches: the edit ends
    await nextTick();
    await nextTick();
    table.setGlobalSearch('');
    await nextTick();
    await nextTick();
    expect(host.querySelector('td.adt-editing')).toBeNull();
  });

  it('closes the dialog only when its row stops matching', async () => {
    const table = createDataTable<Order>({ data: many, columns, initialState: { pageSize: 10 } });
    await mount(() => h(AcunDataTable, { table, virtual: { rowHeight: 40, overscan: 2 }, responsive: 'modal', selectable: true }));
    await scrollTo(4000);
    host.querySelector<HTMLButtonElement>('.adt-expand')!.click();
    await nextTick();
    await nextTick();
    const dialog = host.querySelector('dialog')!;
    expect(dialog.open).toBe(true);
    table.selectRow('1');
    await nextTick();
    expect(dialog.open).toBe(true);
    table.setGlobalSearch('nobody');
    await nextTick();
    expect(dialog.open).toBe(false);
  });

  it('keeps the editor of a row on the first page when its cell is drawn again', async () => {
    const table = createDataTable<Order>({ data: many, columns: editable, initialState: { pageSize: 10 } });
    await mount(() => h(AcunDataTable, { table, virtual: { rowHeight: 40, overscan: 2 }, onEdit: () => undefined }));
    host.querySelector<HTMLButtonElement>('.adt-edit[aria-label="Edit Müşteri: C1"]')!.click();
    await nextTick();
    await nextTick();
    const editor = host.querySelector('td.adt-editing .adt-editor');
    expect(editor).not.toBeNull();
    await scrollTo(8000);
    await scrollTo(0);
    expect(host.querySelector('td.adt-editing .adt-editor')).toBe(editor);
  });

  it('measures the row height once mounted', async () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({ height: 20, width: 100, left: 0 } as DOMRect));
    await mount(() => h(AcunDataTable, { table: createDataTable<Order>({ data: many, columns }), virtual: { overscan: 0 } }));
    await nextTick();
    expect(host.querySelectorAll('tbody .adt-row')).toHaveLength(24); // 480px of 20px rows
    vi.restoreAllMocks();
  });

  it('measures the viewport once mounted and follows resizes', async () => {
    let height = 1200;
    let resized: (() => void) | undefined;
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(() => height);
    (window as { ResizeObserver?: unknown }).ResizeObserver = class {
      constructor(callback: () => void) { resized = callback; }
      observe(): void { /* the test calls the callback */ }
      disconnect(): void { resized = undefined; }
    };
    try {
      await mount(() => h(AcunDataTable, { table: createDataTable<Order>({ data: many, columns }), virtual: { rowHeight: 40, overscan: 0 } }));
      await nextTick();
      expect(host.querySelectorAll('tbody .adt-row')).toHaveLength(30); // 1200px of 40px rows
      height = 400;
      resized!();
      await nextTick();
      expect(host.querySelectorAll('tbody .adt-row')).toHaveLength(10);
    } finally {
      delete (window as { ResizeObserver?: unknown }).ResizeObserver;
      vi.restoreAllMocks();
    }
  });
});

describe('changing props', () => {
  it('follows a new table', async () => {
    const first = createDataTable<Order>({ data: orders.slice(0, 1), columns });
    const second = createDataTable<Order>({ data: orders, columns, initialState: { pageSize: 2 } });
    const table = shallowRef(first);
    await mount(() => h('div', [h(AcunDataTable, { table: table.value }), h(AcunPageInfo, { table: table.value }), h(AcunPagination, { table: table.value })]));
    table.value = second;
    await nextTick();
    expect(texts('tbody tr td:first-child')).toEqual(['Ayşe', 'Ali']);
    second.setGlobalSearch('Can');
    await nextTick();
    expect(texts('tbody tr td:first-child')).toEqual(['Can']);
    expect(host.querySelector('.adt-info')!.textContent).toBe('Showing 1 to 1 of 1 row');
    first.setGlobalSearch('nobody');
    await nextTick();
    expect(texts('tbody tr td:first-child')).toEqual(['Can']); // the old table is no longer followed
  });

  it('keeps bulk actions and tools mounted across parent re-renders, calling the latest callbacks', async () => {
    const table = make();
    const count = shallowRef(0);
    const calls: number[] = [];
    await mount(() => h('div', { 'data-count': count.value }, [
      h(AcunBulkActions, { table, actions: [{ id: 'archive', label: 'Archive', onSelect: () => calls.push(count.value) }] }),
      h(AcunTools, { items: [{ id: 'print', label: 'Print', onSelect: () => calls.push(-count.value) }] }),
    ]));
    table.selectRow('1');
    await nextTick();
    const bar = host.querySelector('.adt-selection');
    const menu = host.querySelector<HTMLDetailsElement>('.adt-tools')!;
    menu.open = true;
    count.value = 1;
    await nextTick();
    expect(host.querySelector('.adt-selection')).toBe(bar);
    expect(host.querySelector('.adt-tools')).toBe(menu);
    expect(menu.open).toBe(true);
    host.querySelector<HTMLButtonElement>('.adt-bulk-action')!.click();
    host.querySelector<HTMLButtonElement>('[data-action="print"]')!.click();
    expect(calls).toEqual([1, -1]);
  });

  it('re-mounts filters and chips for new labels and locale', async () => {
    const table = createDataTable<Order>({ data: orders, columns: [
      { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableFiltering: true },
      { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', enableFiltering: true, filter: true },
    ] });
    table.setFilters([{ field: 'total', operator: 'gte', value: '1000.5' }]);
    const turkish = shallowRef(false);
    await mount(() => h('div', [
      h(AcunFilters, { table, ...(turkish.value ? { labels: labelsTr, locale: 'tr' } : {}) }),
      h(AcunFilterChips, { table, ...(turkish.value ? { labels: labelsTr, locale: 'tr' } : {}) }),
    ]));
    expect(host.querySelector('.adt-filters summary')!.textContent).toContain('Filters');
    expect(host.querySelector('.adt-chip')!.textContent).toBe('Tutar: ≥ 1,000.5');
    turkish.value = true;
    await nextTick();
    expect(host.querySelector('.adt-filters summary')!.textContent).toContain('Filtreler');
    expect(host.querySelector('.adt-chip')!.textContent).toBe('Tutar: ≥ 1.000,5');
  });
});

describe('server rendering', () => {
  it('gives the same element ids on every render, so hydration matches', async () => {
    const html = () => renderToString(createSSRApp({
      render: () => h(AcunDataTable, { table: make(), responsive: 'collapse' }),
    }));
    const ids = (markup: string) => markup.match(/aria-controls="[^"]+"/g);
    const first = await html();
    expect(ids(first)).toHaveLength(3);
    expect(ids(await html())).toEqual(ids(first));
  });
});
