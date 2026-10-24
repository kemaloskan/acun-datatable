import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { labelsTr, renderPageInfo, renderPageSize, renderPagination, renderSearch } from '../src/index';

type Item = { id: number; name: string };
const columns: readonly ColumnDef<Item>[] = [{ id: 'name', header: 'Name', accessorKey: 'name', enableFiltering: true }];
const data = Array.from({ length: 23 }, (_, index) => ({ id: index + 1, name: index % 2 ? `Ali ${index}` : `Ayşe ${index}` }));
let host: HTMLElement;
beforeEach(() => {
  document.body.replaceChildren();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(() => vi.useRealTimers());
const make = (pageSize = 10) => createDataTable<Item>({ data, columns, initialState: { pageSize } });

describe('renderPagination', () => {
  const nav = () => host.querySelector('nav')!;
  const previous = () => host.querySelector<HTMLButtonElement>('.adt-previous')!;
  const next = () => host.querySelector<HTMLButtonElement>('.adt-next')!;
  const numbers = () => [...host.querySelectorAll('.adt-page-numbers > *')].map(node => node.textContent);
  const current = () => host.querySelector('[aria-current="page"]')!;
  const pageButton = (label: string) => host.querySelector<HTMLButtonElement>(`.adt-page[aria-label="${label}"]`)!;
  const big = () => createDataTable<Item>({
    data: Array.from({ length: 200 }, (_, index) => ({ id: index + 1, name: `Row ${index}` })), columns, initialState: { pageSize: 10 },
  });

  it('renders a labelled nav with numbered pages and icon arrows', () => {
    renderPagination(host, make());
    expect(nav().getAttribute('aria-label')).toBe('Pagination');
    expect(numbers()).toEqual(['1', '2', '3']);
    expect(current().textContent).toBe('1');
    expect(previous().getAttribute('aria-label')).toBe('Previous');
    expect(previous().querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(previous().getAttribute('aria-disabled')).toBe('true');
    expect(next().hasAttribute('aria-disabled')).toBe(false);
    expect(host.querySelector('.adt-first')).toBeNull(); // firstLast is off by default
  });

  it('moves between pages and stops at the ends', () => {
    const table = make();
    renderPagination(host, table, { labels: labelsTr });
    next().click();
    pageButton('Sayfa 3').click();
    expect(current().textContent).toBe('3');
    expect(next().getAttribute('aria-disabled')).toBe('true');
    next().click(); // disabled: ignored
    expect(table.getState().page).toBe(3);
    previous().click();
    expect(table.getState().page).toBe(2);
  });

  it('keeps a fixed number of buttons with gaps on long tables', () => {
    const table = big();
    renderPagination(host, table, { locale: 'tr' });
    expect(numbers()).toEqual(['1', '2', '3', '4', '5', '…', '20']);
    table.setPage(10);
    expect(numbers()).toEqual(['1', '…', '9', '10', '11', '…', '20']);
    expect(host.querySelector('.adt-page-gap')!.getAttribute('aria-hidden')).toBe('true');
    table.setPage(20);
    expect(numbers()).toEqual(['1', '…', '16', '17', '18', '19', '20']);
  });

  it('supports first/last buttons, wider windows and grouped digits', () => {
    const table = createDataTable<Item>({
      data: Array.from({ length: 12_000 }, (_, index) => ({ id: index + 1, name: `R${index}` })), columns, initialState: { pageSize: 10 },
    });
    renderPagination(host, table, { firstLast: true, siblings: 2, locale: 'tr' });
    expect(numbers()).toEqual(['1', '2', '3', '4', '5', '6', '7', '…', '1.200']);
    host.querySelector<HTMLButtonElement>('.adt-last')!.click();
    expect(table.getState().page).toBe(1200);
    expect(host.querySelector('.adt-last')!.getAttribute('aria-disabled')).toBe('true');
    host.querySelector<HTMLButtonElement>('.adt-first')!.click();
    expect(table.getState().page).toBe(1);
  });

  it('keeps focus on the page number that was clicked', () => {
    const table = big();
    renderPagination(host, table);
    pageButton('Page 5').focus();
    pageButton('Page 5').click();
    expect(document.activeElement).toBe(pageButton('Page 5'));
    expect(numbers()).toEqual(['1', '…', '4', '5', '6', '…', '20']);
    next().focus();
    table.setPage(20);
    expect(document.activeElement).toBe(next()); // aria-disabled, not disabled: focus stays
  });

  it('validates options and stops on destroy', () => {
    expect(() => renderPagination(host, make(), { siblings: -1 })).toThrow('siblings must be');
    expect(() => renderPagination(host, make(), { boundaries: 11 })).toThrow('boundaries must be');
    const table = make();
    renderPagination(host, table).destroy();
    expect(host.children).toHaveLength(0);
    table.setPage(2);
    expect(host.children).toHaveLength(0);
  });
});

describe('renderPageSize', () => {
  const select = () => host.querySelector('select')!;

  it('changes the page size and lists a custom current size', () => {
    const table = make(7);
    renderPageSize(host, table, { pageSizes: [10, 20], labels: labelsTr });
    expect(host.querySelector('.adt-length .adt-sr-only')!.textContent).toBe('Sayfa başına satır');
    expect([...select().options].map(option => option.value)).toEqual(['7', '10', '20']);
    expect(select().value).toBe('7');
    select().value = '20';
    select().dispatchEvent(new Event('change'));
    expect(table.getState()).toMatchObject({ pageSize: 20, page: 1 });
  });

  it('validates page sizes', () => {
    expect(() => renderPageSize(host, make(), { pageSizes: [] })).toThrow('pageSizes must be');
    expect(() => renderPageSize(host, make(), { pageSizes: [10, 10] })).toThrow('pageSizes must be');
    expect(() => renderPageSize(host, make(), { pageSizes: [0] })).toThrow('pageSizes must be');
  });
});

describe('renderPageInfo', () => {
  const info = () => host.querySelector('.adt-info')!;

  it('shows the visible range and the total in one live region', () => {
    const table = make();
    renderPageInfo(host, table);
    expect(info().getAttribute('aria-live')).toBe('polite');
    expect(info().textContent).toBe('Showing 1 to 10 of 23 rows');
    table.setPage(3);
    expect(info().textContent).toBe('Showing 21 to 23 of 23 rows');
    table.setGlobalSearch('nothing matches this');
    expect(info().textContent).toBe('No rows to show');
  });

  it('speaks the chosen language', () => {
    const table = createDataTable<Item>({
      data: Array.from({ length: 1600 }, (_, index) => ({ id: index + 1, name: `R${index}` })), columns, initialState: { pageSize: 25 },
    });
    renderPageInfo(host, table, { labels: labelsTr });
    expect(info().textContent).toBe('Toplam: 1.600 kaydın 1 ile 25 arasını gösteriyor');
  });
});

describe('renderSearch', () => {
  const input = () => host.querySelector('input')!;

  it('is a labelled search input with the current search text', () => {
    const table = make();
    table.setGlobalSearch('ali');
    renderSearch(host, table, { placeholder: 'Müşteri ara…', labels: labelsTr });
    expect(host.querySelector('label > .adt-sr-only')!.textContent).toBe('Ara');
    expect(input().type).toBe('search');
    expect(input().value).toBe('ali');
    expect(input().placeholder).toBe('Müşteri ara…');
    host.replaceChildren();
    renderSearch(host, table, { labels: labelsTr });
    expect(input().placeholder).toBe('Ara…'); // default: the label with an ellipsis
  });

  it('debounces typing and applies Enter immediately', () => {
    vi.useFakeTimers();
    const table = make();
    renderSearch(host, table, { debounceMs: 200 });
    input().value = 'ay';
    input().dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(199);
    expect(table.getState().globalSearch).toBe('');
    vi.advanceTimersByTime(1);
    expect(table.getState().globalSearch).toBe('ay');
    input().value = 'ali';
    input().dispatchEvent(new Event('input'));
    input().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(table.getState().globalSearch).toBe('ali');
    vi.advanceTimersByTime(500);
    expect(table.getState().globalSearch).toBe('ali');
  });

  it('follows external changes unless the user is typing', () => {
    const table = make();
    renderSearch(host, table);
    table.setGlobalSearch('external');
    expect(input().value).toBe('external');
    input().focus();
    input().value = 'typing';
    table.setGlobalSearch('other');
    expect(input().value).toBe('typing');
  });

  it('validates options and cancels pending input on destroy', () => {
    expect(() => renderSearch(host, make(), { debounceMs: -1 })).toThrow('debounceMs must be');
    vi.useFakeTimers();
    const table = make();
    const rendered = renderSearch(host, table);
    input().value = 'late';
    input().dispatchEvent(new Event('input'));
    rendered.destroy();
    vi.advanceTimersByTime(1000);
    expect(table.getState().globalSearch).toBe('');
    expect(host.children).toHaveLength(0);
  });
});

describe('paging with an unknown server total', () => {
  it('numbers only the known pages and shows the range without a total', () => {
    const table = createDataTable<Item>({ mode: 'server', columns, initialState: { pageSize: 2 } });
    const pager = host.appendChild(document.createElement('div'));
    const info = host.appendChild(document.createElement('div'));
    renderPagination(pager, table, { labels: labelsTr, firstLast: true });
    renderPageInfo(info, table, { labels: labelsTr });
    table.setPageResult({ rows: [{ id: 1, name: 'A' }, { id: 2, name: 'B' }] }); // full page, no total
    expect(info.textContent).toBe('1 ile 2 arasındaki kayıtları gösteriyor');
    expect([...pager.querySelectorAll('.adt-page-numbers > *')].map(node => node.textContent)).toEqual(['1']);
    expect(pager.querySelector('.adt-next')!.hasAttribute('aria-disabled')).toBe(false); // more may follow
    expect(pager.querySelector<HTMLElement>('.adt-last')!.hidden).toBe(true); // the last page is unknown
    table.setPageResult({ rows: [{ id: 1, name: 'A' }], totalRows: 1 });
    expect(info.textContent).toBe('Toplam: 1 kaydın 1 ile 1 arasını gösteriyor');
    expect(pager.querySelector<HTMLElement>('.adt-last')!.hidden).toBe(false);
  });
});
