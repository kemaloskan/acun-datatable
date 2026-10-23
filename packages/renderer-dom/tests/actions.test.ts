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
