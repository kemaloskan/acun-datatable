import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import {
  describeFilter, filterControls, filterRules, labelsTr, readFilter, renderDataTable, renderFilterChips, renderFilters,
} from '../src/index';

type Order = { id: number; customer: string; total: number; city: string; active: boolean; at: string };
const columns: readonly ColumnDef<Order>[] = [
  { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableFiltering: true, filter: true },
  { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'number', enableFiltering: true, filter: true },
  { id: 'city', header: 'Şehir', accessorKey: 'city', enableFiltering: true, filter: { options: [{ value: 'İzmir', label: 'İzmir' }, { value: 'Ankara', label: 'Ankara' }] } },
  { id: 'active', header: 'Aktif', accessorKey: 'active', type: 'boolean', enableFiltering: true, filter: true },
  { id: 'at', header: 'Tarih', accessorKey: 'at', type: 'date', enableFiltering: true, filter: true },
];
const data: Order[] = [
  { id: 1, customer: 'Ayşe', total: 100, city: 'İzmir', active: true, at: '2026-10-01' },
  { id: 2, customer: 'Ali', total: 250, city: 'Ankara', active: false, at: '2026-10-15' },
  { id: 3, customer: 'Can', total: 400, city: 'İzmir', active: true, at: '2026-10-30' },
];
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => vi.useRealTimers());
const make = () => createDataTable<Order>({ data, columns });
const ids = (table: ReturnType<typeof make>) => table.getPage().rows.map(row => row.original.id);
const change = (node: Element, value?: string) => {
  if (value !== undefined) (node as HTMLInputElement).value = value;
  node.dispatchEvent(new Event('change', { bubbles: true }));
};

describe('filter controls', () => {
  it('pick a control per column type and turn values into rules and back', () => {
    const controls = filterControls(columns);
    expect(controls.map(control => control.kind)).toEqual(['text', 'range', 'options', 'boolean', 'dates']);
    const [text, range, options, flag, dates] = controls as [never, never, never, never, never];
    expect(filterRules(text, { text: ' ay ' })).toEqual([{ field: 'customer', operator: 'contains', value: 'ay' }]);
    expect(filterRules(range, { min: '100', max: '' })).toEqual([{ field: 'total', operator: 'gte', value: '100' }]);
    expect(filterRules(range, { min: '', max: '300' })).toEqual([{ field: 'total', operator: 'lte', value: '300' }]);
    expect(filterRules(range, { min: '100', max: '300' })).toEqual([{ field: 'total', operator: 'between', value: ['100', '300'] }]);
    expect(filterRules(options, { selected: ['Ankara'] })).toEqual([{ field: 'city', operator: 'in', value: ['Ankara'] }]);
    expect(filterRules(flag, { flag: 'false' })).toEqual([{ field: 'active', operator: 'eq', value: false }]);
    expect(filterRules(dates, { min: '', max: '' })).toEqual([]);
    expect(readFilter(range, [{ field: 'total', operator: 'between', value: [5, 9] }])).toEqual({ min: '5', max: '9' });
    expect(readFilter(options, [{ field: 'city', operator: 'eq', value: 'İzmir' }])).toEqual({ selected: ['İzmir'] });
    expect(describeFilter(range, { min: '1000', max: '' }, labelsTr, 'tr')).toBe('Tutar: ≥ 1.000');
    expect(describeFilter(dates, { min: '2026-10-01', max: '2026-10-15' }, labelsTr, 'tr')).toBe('Tarih: 1 Eki 2026 – 15 Eki 2026');
    expect(describeFilter(options, { selected: ['İzmir', 'Ankara'] }, labelsTr)).toBe('Şehir: İzmir, Ankara');
  });
});

describe('renderFilters', () => {
  it('filters the table from the panel and shows how many are active', () => {
    vi.useFakeTimers();
    const table = make();
    renderFilters(host, table, { labels: labelsTr, debounceMs: 100 });
    expect(host.querySelector('summary')!.textContent).toContain('Filtreler');
    const sets = [...host.querySelectorAll('fieldset')];
    expect(sets.map(set => set.querySelector('legend')!.textContent)).toEqual(['Müşteri', 'Tutar', 'Şehir', 'Aktif', 'Tarih']);

    const [min] = sets[1]!.querySelectorAll('input');
    min!.value = '200';
    min!.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(100);
    expect(ids(table)).toEqual([2, 3]);
    const izmir = sets[2]!.querySelector<HTMLInputElement>('input[value="İzmir"]')!;
    izmir.checked = true;
    change(izmir);
    expect(ids(table)).toEqual([3]);
    expect(host.querySelector('.adt-badge')!.textContent).toBe('2');
    expect(host.querySelector('summary .adt-sr-only')!.textContent).toBe('2 filtre etkin');

    host.querySelector<HTMLButtonElement>('.adt-filter-clear')!.click();
    expect(ids(table)).toEqual([1, 2, 3]);
    expect(min!.value).toBe(''); // controls follow the state
    expect(host.querySelector<HTMLElement>('.adt-badge')!.hidden).toBe(true);
  });

  it('follows rules set elsewhere and renders nothing without filter columns', () => {
    const table = make();
    renderFilters(host, table);
    table.setFilters([{ field: 'active', operator: 'eq', value: false }, { field: 'at', operator: 'gte', value: '2026-10-10' }]);
    expect(host.querySelector<HTMLInputElement>('fieldset[data-field="active"] input[value="false"]')!.checked).toBe(true);
    expect(host.querySelector<HTMLInputElement>('fieldset[data-field="at"] input')!.value).toBe('2026-10-10');
    const plain = createDataTable<Order>({ data, columns: [{ id: 'customer', header: 'Müşteri', accessorKey: 'customer' }] });
    host.replaceChildren();
    renderFilters(host, plain);
    expect(host.children).toHaveLength(0);
  });
});

describe('renderFilterChips', () => {
  it('lists active filters as removable chips', () => {
    const table = make();
    renderFilterChips(host, table, { labels: labelsTr, locale: 'tr' });
    const root = host.querySelector<HTMLElement>('.adt-filter-chips')!;
    expect(root.hidden).toBe(true);
    table.setFilters([{ field: 'city', operator: 'in', value: ['İzmir'] }, { field: 'total', operator: 'lte', value: 300 }]);
    expect([...root.querySelectorAll('.adt-chip')].map(chip => chip.textContent)).toEqual(['Tutar: ≤ 300', 'Şehir: İzmir']);
    root.querySelector<HTMLButtonElement>('.adt-chip-remove[aria-label="Filtreyi kaldır: Şehir"]')!.click();
    expect(table.getState().filters).toEqual([{ field: 'total', operator: 'lte', value: 300 }]);
    root.querySelector<HTMLButtonElement>('.adt-chip-clear')!.click();
    expect(table.getState().filters).toEqual([]);
    expect(root.hidden).toBe(true);
  });

  it('is part of renderDataTable when columns have filters', () => {
    renderDataTable(host, make(), { locale: 'tr' });
    expect(host.querySelector('.adt-top .adt-bar-end .adt-filters')).not.toBeNull();
    expect(host.querySelector('.adt > .adt-feature--chips .adt-filter-chips')).not.toBeNull();
  });
});
