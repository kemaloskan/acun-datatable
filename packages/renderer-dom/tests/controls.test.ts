import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDataTable, type ColumnDef } from '@acunsoft/datatable-core';
import { labelsTr, renderPagination, renderSearch } from '../src/index';

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
  const status = () => host.querySelector('.adt-status')!;
  const select = () => host.querySelector('select')!;

  it('renders a labelled nav with a live status', () => {
    renderPagination(host, make());
    expect(nav().getAttribute('aria-label')).toBe('Pagination');
    expect(status().getAttribute('aria-live')).toBe('polite');
    expect(status().textContent).toBe('Page 1 of 3 · 23 rows');
    expect(previous().getAttribute('aria-disabled')).toBe('true');
    expect(next().hasAttribute('aria-disabled')).toBe(false);
  });

  it('moves between pages and stops at the ends', () => {
    const table = make();
    renderPagination(host, table, { labels: labelsTr });
    next().click();
    next().click();
    expect(status().textContent).toBe('Sayfa 3 / 3 · 23 kayıt');
    expect(next().getAttribute('aria-disabled')).toBe('true');
    next().click(); // disabled: ignored
    expect(table.getState().page).toBe(3);
    previous().click();
    expect(table.getState().page).toBe(2);
  });

  it('keeps the same live region and focus while updating', () => {
    const table = make();
    renderPagination(host, table);
    const region = status();
    next().focus();
    next().click();
    next().click(); // reaches the last page
    expect(status()).toBe(region);
    expect(document.activeElement).toBe(next()); // aria-disabled, not disabled: focus stays
  });

  it('changes the page size and lists a custom current size', () => {
    const table = make(7);
    renderPagination(host, table, { pageSizes: [10, 20] });
    expect([...select().options].map(option => option.value)).toEqual(['7', '10', '20']);
    expect(select().value).toBe('7');
    select().value = '20';
    select().dispatchEvent(new Event('change'));
    expect(table.getState()).toMatchObject({ pageSize: 20, page: 1 });
    expect(status().textContent).toBe('Page 1 of 2 · 23 rows');
  });

  it('validates page sizes and stops on destroy', () => {
    expect(() => renderPagination(host, make(), { pageSizes: [] })).toThrow('pageSizes must be');
    expect(() => renderPagination(host, make(), { pageSizes: [10, 10] })).toThrow('pageSizes must be');
    expect(() => renderPagination(host, make(), { pageSizes: [0] })).toThrow('pageSizes must be');
    const table = make();
    renderPagination(host, table).destroy();
    expect(host.children).toHaveLength(0);
    table.setPage(2);
    expect(host.children).toHaveLength(0);
  });
});

describe('renderSearch', () => {
  const input = () => host.querySelector('input')!;

  it('is a labelled search input with the current search text', () => {
    const table = make();
    table.setGlobalSearch('ali');
    renderSearch(host, table, { placeholder: 'Ara…', labels: labelsTr });
    expect(host.querySelector('label > span')!.textContent).toBe('Ara');
    expect(input().type).toBe('search');
    expect(input().value).toBe('ali');
    expect(input().placeholder).toBe('Ara…');
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
