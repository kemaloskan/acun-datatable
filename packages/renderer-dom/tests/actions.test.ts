import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef, type Row } from '@acunsoft/datatable-core';
import { labelsTr, renderBulkActions, renderTable, type RowAction } from '../src/index';

type Order = { id: number; customer: string; locked?: boolean };
const columns: readonly ColumnDef<Order>[] = [{ id: 'customer', header: 'Customer', accessorKey: 'customer', enableSorting: true, enableFiltering: true }];
const orders: Order[] = [
  { id: 1, customer: 'Ayşe' },
  { id: 2, customer: 'Ali', locked: true },
  { id: 3, customer: 'Can' },
];
let host: HTMLElement;
let bar: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  bar = document.createElement('div');
  document.body.append(bar, host);
});
const make = (pageSize = 10) => createDataTable<Order>({ data: orders, columns, initialState: { pageSize } });
const actionButtons = (row: number) => [...host.querySelectorAll('tbody tr')[row]!.querySelectorAll<HTMLButtonElement>('.adt-action')];

describe('row actions', () => {
  it('adds an actions column whose buttons name the row', () => {
    const edit = vi.fn();
    renderTable(host, make(), { rowActions: [{ id: 'edit', label: 'Edit', onSelect: edit }] });
    const headers = [...host.querySelectorAll('thead th')].map(th => th.textContent);
    expect(headers).toEqual(['Customer', 'Actions']);
    const [button] = actionButtons(1);
    expect(button!.textContent).toBe('Edit');
    expect(button!.getAttribute('aria-label')).toBe('Edit: Ali');
    expect(button!.type).toBe('button');
    expect(button!.closest('td')!.getAttribute('data-label')).toBe('Actions');
    button!.click();
    expect(edit).toHaveBeenCalledTimes(1);
    expect((edit.mock.calls[0]![0] as Row<Order>).original).toBe(orders[1]); // the caller's object, not a copy
  });

  it('hides or disables buttons per row and keeps disabled buttons focusable', () => {
    const remove = vi.fn();
    const actions: RowAction<Order>[] = [
      { id: 'edit', label: 'Edit', onSelect: vi.fn(), hidden: row => row.original.customer === 'Can' },
      { id: 'delete', label: 'Delete', onSelect: remove, disabled: row => row.original.locked === true },
    ];
    renderTable(host, make(), { rowActions: actions, labels: labelsTr });
    expect(actionButtons(2).map(b => b.textContent)).toEqual(['Delete']);
    const locked = actionButtons(1)[1]!;
    expect(locked.getAttribute('aria-label')).toBe('Ali: Delete');
    expect(locked.getAttribute('aria-disabled')).toBe('true');
    expect(locked.disabled).toBe(false);
    locked.click();
    expect(remove).not.toHaveBeenCalled();
    actionButtons(0)[1]!.click();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it('keeps focus on the same action after a re-render and widens the empty row', () => {
    const table = make();
    renderTable(host, table, { selectable: true, rowActions: [{ id: 'edit', label: 'Edit', onSelect: () => undefined }] });
    actionButtons(2)[0]!.focus();
    table.setSorting([{ field: 'customer', direction: 'desc' }]); // Can moves to the first row
    expect(document.activeElement!.getAttribute('aria-label')).toBe('Edit: Can');
    table.setGlobalSearch('nobody');
    expect(host.querySelector('.adt-empty td')!.getAttribute('colspan')).toBe('3');
  });

  it('validates action definitions', () => {
    const table = make();
    const bad = (rowActions: unknown) => () => renderTable(host, table, { rowActions: rowActions as RowAction<Order>[] });
    expect(bad({})).toThrow('rowActions must be an array');
    expect(bad([{ id: '1x', label: 'A', onSelect: () => 0 }])).toThrow('id must start with a letter');
    expect(bad([{ id: 'a', label: ' ', onSelect: () => 0 }])).toThrow('needs a label');
    expect(bad([{ id: 'a', label: 'A' }])).toThrow('needs onSelect');
    expect(bad([{ id: 'a', label: 'A', onSelect: () => 0, hidden: true }])).toThrow('hidden of action "a" must be a function');
    expect(bad([{ id: 'a', label: 'A', onSelect: () => 0 }, { id: 'a', label: 'B', onSelect: () => 0 }])).toThrow('duplicate action id');
  });
});

describe('renderBulkActions', () => {
  const button = (action: string) => bar.querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;

  it('is hidden until rows are selected, then shows the count and acts on the selection', () => {
    const table = make(2);
    const archive = vi.fn();
    renderBulkActions(bar, table, { actions: [{ id: 'archive', label: 'Archive', onSelect: archive }] });
    const root = bar.querySelector<HTMLElement>('.adt-selection')!;
    expect(root.hidden).toBe(true);
    expect(root.getAttribute('role')).toBe('group');
    table.selectRows(['1', '2']);
    table.setPage(2);
    table.selectRow('3');
    expect(root.hidden).toBe(false);
    expect(bar.querySelector('[role="status"]')!.textContent).toBe('3 selected');
    button('archive').click();
    const selection = archive.mock.calls[0]![0] as { ids: string[]; rows: Row<Order>[] };
    expect(selection.ids).toEqual(['1', '2', '3']); // across pages
    expect(selection.rows.map(row => row.original.customer)).toEqual(['Ayşe', 'Ali', 'Can']);
  });

  it('disables actions for a selection and clears the selection', () => {
    const table = make();
    const remove = vi.fn();
    renderBulkActions(bar, table, {
      labels: labelsTr,
      actions: [{ id: 'delete', label: 'Sil', onSelect: remove, disabled: ({ rows }) => rows.some(row => row.original.locked) }],
    });
    table.selectRows(['1', '2']);
    expect(bar.querySelector('[role="status"]')!.textContent).toBe('2 seçili');
    expect(button('delete').getAttribute('aria-disabled')).toBe('true');
    button('delete').click();
    expect(remove).not.toHaveBeenCalled();
    table.deselectRow('2');
    expect(button('delete').hasAttribute('aria-disabled')).toBe(false);
    bar.querySelector<HTMLButtonElement>('.adt-clear-selection')!.click();
    expect(table.getState().selectedIds).toEqual([]);
    expect(bar.querySelector<HTMLElement>('.adt-selection')!.hidden).toBe(true);
  });

  it('validates options and stops on destroy', () => {
    const table = make();
    expect(() => renderBulkActions(bar, table, {} as never)).toThrow('bulk actions must be an array');
    const rendered = renderBulkActions(bar, table, { actions: [] });
    rendered.destroy();
    expect(bar.children).toHaveLength(0);
    table.selectRow('1');
    expect(bar.children).toHaveLength(0);
  });
});

describe('row action icons, danger, confirm and the overflow menu', () => {
  it('shows icons, keeps the first actions in the row and moves the rest into a ⋮ menu', async () => {
    const { createDataTable } = await import('@acunsoft/datatable-core');
    const { renderTable } = await import('../src/index');
    const host = document.body.appendChild(document.createElement('div'));
    const remove = vi.fn();
    const archive = vi.fn();
    const table = createDataTable({ data: [{ id: 1, name: 'Ayşe' }], columns: [{ id: 'name', header: 'Name', accessorKey: 'name' }] });
    renderTable(host, table, {
      maxInlineActions: 1,
      rowActions: [
        { id: 'view', label: 'View', icon: 'view', iconOnly: true, onSelect: vi.fn() },
        { id: 'archive', label: 'Archive', icon: { path: 'M1 1h22' }, onSelect: archive },
        { id: 'delete', label: 'Delete', icon: 'delete', danger: true, confirm: row => `Delete ${String((row.original as { name: string }).name)}?`, onSelect: remove },
      ],
    });
    const view = host.querySelector<HTMLButtonElement>('[data-action="view"]')!;
    expect(view.className).toBe('adt-action adt-action--icon');
    expect(view.getAttribute('title')).toBe('View');
    expect(view.textContent).toBe('');
    const more = host.querySelector('.adt-row-menu summary')!;
    expect(more.getAttribute('aria-label')).toBe('More actions: Ayşe');
    expect([...host.querySelectorAll('.adt-row-menu .adt-menu-item')].map(item => item.textContent)).toEqual(['Archive', 'Delete']);
    expect(host.querySelector('.adt-row-menu [data-action="delete"]')!.className).toBe('adt-menu-item adt-menu-item--danger');

    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true);
    host.querySelector<HTMLButtonElement>('.adt-row-menu [data-action="delete"]')!.click();
    expect(confirm).toHaveBeenLastCalledWith('Delete Ayşe?');
    expect(remove).not.toHaveBeenCalled();
    host.querySelector<HTMLButtonElement>('.adt-row-menu [data-action="delete"]')!.click();
    expect(remove).toHaveBeenCalledOnce();
    host.querySelector<HTMLDetailsElement>('.adt-row-menu')!.open = true;
    document.body.click();
    expect(host.querySelector<HTMLDetailsElement>('.adt-row-menu')!.open).toBe(false); // a click outside closes it
  });
});

describe('range selection and every matching row', () => {
  it('selects a range with Shift+click and offers every matching row', async () => {
    const { createDataTable } = await import('@acunsoft/datatable-core');
    const { renderBulkActions, renderTable, labelsTr } = await import('../src/index');
    const host = document.body.appendChild(document.createElement('div'));
    const bar = document.body.appendChild(document.createElement('div'));
    const rows = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, name: `R${i + 1}` }));
    const table = createDataTable({ data: rows, columns: [{ id: 'name', header: 'Name', accessorKey: 'name', enableFiltering: true }], initialState: { pageSize: 10 } });
    renderTable(host, table, { selectable: true });
    renderBulkActions(bar, table, { actions: [{ id: 'go', label: 'Go', onSelect: () => undefined }], labels: labelsTr });
    const boxes = () => [...host.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')];
    boxes()[1]!.click();
    boxes()[5]!.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true, cancelable: true }));
    expect(table.getState().selectedIds).toEqual(['2', '3', '4', '5', '6']);
    boxes()[3]!.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true, cancelable: true })); // unticks 6 → 4
    expect(table.getState().selectedIds).toEqual(['2', '3']);

    host.querySelector<HTMLInputElement>('thead input[type="checkbox"]')!.click(); // the whole page
    const matching = bar.querySelector<HTMLButtonElement>('.adt-select-matching')!;
    expect(matching.hidden).toBe(false);
    expect(matching.textContent).toBe('Eşleşen 30 kaydın tümünü seç');
    matching.click(); // local: selects them
    expect(table.getState().selectedIds).toHaveLength(30);
    expect(matching.hidden).toBe(true);
  });

  it('passes allMatching and the query to bulk actions in server mode', async () => {
    const { createDataTable } = await import('@acunsoft/datatable-core');
    const { renderBulkActions, labelsTr } = await import('../src/index');
    const bar = document.body.appendChild(document.createElement('div'));
    const table = createDataTable<{ id: number }>({ mode: 'server', columns: [{ id: 'id', header: 'ID', accessorKey: 'id', enableFiltering: true }], initialState: { pageSize: 2 } });
    table.setPageResult({ rows: [{ id: 1 }, { id: 2 }], totalRows: 500 });
    const onSelect = vi.fn();
    renderBulkActions(bar, table, { actions: [{ id: 'go', label: 'Go', onSelect }], labels: labelsTr });
    table.selectRows(['1', '2']);
    bar.querySelector<HTMLButtonElement>('.adt-select-matching')!.click();
    expect(bar.querySelector('.adt-selection-count')!.textContent).toBe('Eşleşen 500 kaydın tümü seçili');
    bar.querySelector<HTMLButtonElement>('[data-action="go"]')!.click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ allMatching: true, ids: ['1', '2'], query: expect.objectContaining({ page: 1 }) }));
    table.setGlobalSearch('x'); // a new query ends it
    expect(bar.querySelector('.adt-selection-count')!.textContent).not.toContain('tümü seçili');
  });
});
