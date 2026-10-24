import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { renderTable } from '../src/index';

type R = { id: number; name: string };
const columns: readonly ColumnDef<R>[] = [
  { id: 'name', header: 'Name', accessorKey: 'name', editable: true, enableSorting: true },
  { id: 'id', header: 'No', accessorKey: 'id', type: 'number', priority: 3 },
];
const data: R[] = Array.from({ length: 500 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => vi.restoreAllMocks());
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const control = () => host.querySelector<HTMLInputElement>('.adt-edit-control');

describe('editing', () => {
  it('lets the click that closed an editor reach its control', async () => {
    const table = createDataTable<R>({ data: data.slice(0, 5), columns });
    renderTable(host, table, { onEdit: () => undefined });
    host.querySelector<HTMLButtonElement>('.adt-edit')!.click();
    expect(control()).not.toBeNull();
    const sort = host.querySelector<HTMLButtonElement>('.adt-sort')!;
    sort.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    control()!.blur(); // the press moves focus away: the unchanged editor closes
    await flush();
    expect(sort.isConnected).toBe(true); // not redrawn under the pointer
    document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    sort.click();
    expect(table.getState().sorting).toEqual([{ field: 'name', direction: 'asc' }]);
    await flush();
    expect(control()).toBeNull();
  });

  it('keeps an edit when its row is only scrolled out of a virtual table', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    const onEdit = vi.fn();
    const table = createDataTable<R>({ data, columns });
    renderTable(host, table, { virtual: { rowHeight: 40 }, onEdit });
    expect(host.querySelector('.adt-table-wrap')!.classList.contains('adt-responsive--scroll')).toBe(true); // virtual: scroll by default
    host.querySelector<HTMLButtonElement>('.adt-edit')!.click();
    control()!.value = 'typed';
    const scroller = host.querySelector<HTMLElement>('.adt-scroll')!;
    const scrollTo = async (top: number) => { scroller.scrollTop = top; scroller.dispatchEvent(new Event('scroll')); await new Promise(resolve => setTimeout(resolve, 40)); };
    await scrollTo(8000);
    expect(control()).toBeNull();
    await scrollTo(0);
    expect(control()!.value).toBe('typed');
    expect(onEdit).not.toHaveBeenCalled();
    table.setGlobalSearch('Row 499'); // the row no longer matches: the edit ends
    expect(control()).toBeNull();
  });
});

describe('modal dialog', () => {
  it('keeps focus in the dialog when the table draws again', async () => {
    HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
    const table = createDataTable<R>({ data: data.slice(0, 3), columns });
    let resolve!: (value: string) => void;
    renderTable(host, table, { responsive: 'modal', detail: () => new Promise<string>(done => { resolve = done; }) });
    host.querySelector<HTMLButtonElement>('tbody .adt-expand')!.click();
    const close = host.querySelector<HTMLButtonElement>('dialog .adt-dialog-close')!;
    close.focus();
    resolve('lines');
    await flush();
    expect(host.querySelector('dialog .adt-detail-content')!.textContent).toBe('lines');
    expect(document.activeElement).toBe(host.querySelector('dialog .adt-dialog-close'));
  });
});

describe('selection', () => {
  it('clears a large selection quickly', () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
    const many = Array.from({ length: 30_000 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
    const table = createDataTable<R>({ data: many, columns });
    renderTable(host, table, { virtual: { rowHeight: 40 }, selectable: true });
    const all = host.querySelector<HTMLInputElement>('thead .adt-select input')!;
    all.click();
    expect(table.getState().selectedIds).toHaveLength(30_000);
    const started = performance.now();
    host.querySelector<HTMLInputElement>('thead .adt-select input')!.click();
    expect(table.getState().selectedIds).toHaveLength(0);
    expect(performance.now() - started).toBeLessThan(300);
  });
});
