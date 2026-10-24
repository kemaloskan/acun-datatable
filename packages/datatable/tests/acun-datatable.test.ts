import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AcunDataTable } from '../src/index';

let host: HTMLElement;
beforeEach(() => {
  document.head.replaceChildren();
  document.body.replaceChildren();
  host = document.createElement('div');
  host.id = 'orders';
  document.body.append(host);
});
afterEach(() => vi.unstubAllGlobals());

const orders = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, customer: i % 2 ? `Ali ${i + 1}` : `Ayşe ${i + 1}`, total: (i + 1) * 10 }));
const json = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
const info = () => document.querySelector('.adt-info')?.textContent;
const headers = () => [...document.querySelectorAll('thead th.adt-th')].map(th => th.textContent?.replace(/[▲▼\d]/g, ''));

describe('AcunDataTable', () => {
  it('turns an existing <table> into a full table and puts it back on destroy', async () => {
    document.body.innerHTML = `<table id="t"><thead><tr><th data-column="name">Ad</th><th>Şehir</th></tr></thead>
      <tbody><tr><td>Ayşe</td><td>İzmir</td></tr><tr><td>Ali</td><td>Ankara</td></tr></tbody></table>`;
    const original = document.getElementById('t');
    const dt = new AcunDataTable('#t', { language: 'tr' });
    await dt.ready;
    expect(document.getElementById('t')).toBeNull();
    expect(headers()).toEqual(['Ad', 'Şehir']);
    expect(dt.table!.getColumns().map(column => column.id)).toEqual(['name', 'sehir']);
    expect(info()).toBe('Toplam: 2 kaydın 1 ile 2 arasını gösteriyor');
    dt.search('ankara');
    expect([...document.querySelectorAll('tbody td')].map(td => td.textContent)).toEqual(['Ali', 'Ankara']);
    dt.destroy();
    expect(document.getElementById('t')).toBe(original);
  });

  it('applies the DataTables-style options', async () => {
    const dt = new AcunDataTable('#orders', {
      data: orders,
      columns: [{ data: 'customer', title: 'Müşteri' }, { data: 'total', type: 'number' }, { data: 'id', visible: false, sortable: false }],
      pagination: { pageSize: 10, pageSizes: [10, 20], firstLast: true },
      sorting: { multiSort: false, initial: [{ field: 'customer', direction: 'desc' }] },
      searching: { debounce: 0, placeholder: 'Müşteri ara…' },
      fixedHeader: true,
      language: 'tr',
    });
    await dt.ready;
    expect(headers()).toEqual(['Müşteri', 'Total']); // id starts hidden
    expect(document.querySelectorAll('.adt-sort')).toHaveLength(2);
    expect(document.querySelector('.adt-table-wrap')!.classList.contains('adt-sticky-header')).toBe(true);
    expect([...document.querySelectorAll<HTMLOptionElement>('.adt-length option')].map(option => option.value)).toEqual(['10', '20']);
    expect(document.querySelector<HTMLInputElement>('.adt-search input')!.placeholder).toBe('Müşteri ara…');
    expect(document.querySelector('.adt-first')).not.toBeNull();
    expect(info()).toBe('Toplam: 30 kaydın 1 ile 10 arasını gösteriyor');
    expect(dt.table!.getState().sorting).toEqual([{ field: 'customer', direction: 'desc' }]);
    const total = document.querySelectorAll<HTMLButtonElement>('.adt-sort')[1]!;
    total.dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(dt.table!.getState().sorting).toEqual([{ field: 'total', direction: 'asc' }]); // multiSort off: Shift replaces
  });

  it('turns parts off', async () => {
    const dt = new AcunDataTable('#orders', { data: orders, pagination: false, searching: false, sorting: false, columnToggle: false });
    await dt.ready;
    expect(document.querySelector('.adt-paging, .adt-length, .adt-search, .adt-columns, .adt-sort')).toBeNull();
    expect(document.querySelectorAll('tbody tr')).toHaveLength(30); // every row on one page
    expect(headers()).toEqual(['Id', 'Customer', 'Total']); // fields of the first row
  });

  it('loads every row once from ajax and works in the browser', async () => {
    const fetch = json({ data: orders });
    vi.stubGlobal('fetch', fetch);
    const dt = new AcunDataTable('#orders', { ajax: '/orders.json', columns: [{ data: 'customer' }, { data: 'total' }] });
    expect(document.querySelector('.adt-notice')!.textContent).toBe('Loading…'); // processing
    await dt.ready;
    expect(fetch).toHaveBeenCalledOnce();
    expect(info()).toBe('Showing 1 to 25 of 30 rows');
    dt.page(2);
    expect(fetch).toHaveBeenCalledOnce(); // paging stays in the browser
    expect(info()).toBe('Showing 26 to 30 of 30 rows');
  });

  it('runs server side with POST, the CSRF token and columns from the first row', async () => {
    document.head.innerHTML = '<meta name="csrf-token" content="t0ken">';
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = new URLSearchParams(String(init?.body));
      const page = Number(body.get('page'));
      const size = Number(body.get('pageSize'));
      return new Response(JSON.stringify({ data: orders.slice((page - 1) * size, page * size), recordsFiltered: 30 }));
    });
    vi.stubGlobal('fetch', fetch);
    const dt = new AcunDataTable('#orders', { fixedHeader: true, serverSide: true, ajax: { url: '/api/products', method: 'POST' } });
    await dt.ready;
    const [url, init] = fetch.mock.calls.at(-1)!;
    expect(url).toBe('/api/products');
    expect(init).toMatchObject({ method: 'POST' });
    expect(new Headers(init!.headers).get('x-csrf-token')).toBe('t0ken');
    expect(headers()).toEqual(['Id', 'Customer', 'Total']);
    expect(info()).toBe('Showing 1 to 25 of 30 rows');
    dt.page(2);
    await vi.waitFor(() => expect(info()).toBe('Showing 26 to 30 of 30 rows'));
    expect(new URLSearchParams(String(fetch.mock.calls.at(-1)![1]!.body)).get('page')).toBe('2');
    dt.destroy();
  });

  it('reports load errors and refuses impossible options', async () => {
    vi.stubGlobal('fetch', json({ message: 'nope' }, 500));
    const dt = new AcunDataTable('#orders', { ajax: '/broken.json', columns: [{ data: 'customer' }] });
    await expect(dt.ready).rejects.toThrow('answered 500');
    expect(document.querySelector('[role="alert"]')!.textContent).toContain('The data could not be loaded.');
    expect(() => new AcunDataTable('#missing')).toThrow('no element matches #missing');
    expect(() => new AcunDataTable('#orders', { serverSide: true })).toThrow('serverSide needs ajax');
    expect(() => new AcunDataTable('#orders', { serverSide: true, ajax: '/x', pagination: false })).toThrow('pagination cannot be turned off');
  });
});

describe('filters', () => {
  it('adds the filter panel and chips for columns with filter', async () => {
    const dt = new AcunDataTable('#orders', {
      data: orders,
      language: 'tr',
      columns: [
        { data: 'customer', title: 'Müşteri', filter: true },
        { data: 'total', title: 'Tutar', type: 'number', filter: true },
        { data: 'id', title: 'No', filter: [{ value: 1, label: 'Bir' }, { value: 2, label: 'İki' }] },
      ],
    });
    await dt.ready;
    expect([...document.querySelectorAll('.adt-filter legend')].map(legend => legend.textContent)).toEqual(['Müşteri', 'Tutar', 'No']);
    dt.table!.setFilters([{ field: 'total', operator: 'gte', value: 250 }]);
    expect(document.querySelector('.adt-chip')!.textContent).toBe('Tutar: ≥ 250');
    expect(info()).toBe('Toplam: 6 kaydın 1 ile 6 arasını gösteriyor');
  });
});
