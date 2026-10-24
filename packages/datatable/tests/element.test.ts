import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineAcunDataTableElement, type AcunDataTableElement } from '../src/index';

defineAcunDataTableElement();
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
beforeEach(() => document.body.replaceChildren());
afterEach(() => vi.unstubAllGlobals());

describe('<acun-datatable>', () => {
  it('turns its own <table> into the full table, with attributes for options', async () => {
    document.body.innerHTML = `<acun-datatable language="tr" page-size="10" size="sm"><table><thead><tr><th>Ad</th><th data-type="number">Yaş</th></tr></thead>
      <tbody><tr><td>Ayşe</td><td>31</td></tr><tr><td>Ali</td><td>27</td></tr></tbody></table></acun-datatable>`;
    const element = document.querySelector<AcunDataTableElement>('acun-datatable')!;
    const ready = new Promise(resolve => element.addEventListener('adt-ready', resolve, { once: true }));
    await tick();
    await ready;
    expect(element.querySelector('.adt-info')!.textContent).toBe('Toplam: 2 kaydın 1 ile 2 arasını gösteriyor');
    expect(element.querySelector('.adt')!.classList.contains('adt-size--sm')).toBe(true);
    const changes = vi.fn();
    element.addEventListener('adt-change', changes);
    element.table!.search('ali');
    expect(changes).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ event: { type: 'globalSearch', globalSearch: 'ali' } }) }));
    element.setAttribute('language', 'en'); // re-renders from the original table
    await tick();
    await element.table!.ready;
    expect(element.querySelector('.adt-info')!.textContent).toBe('Showing 1 to 2 of 2 rows');
    element.remove();
    await tick();
    expect(element.table).toBeUndefined();
  });

  it('loads a server table from src and takes the rest as properties', async () => {
    const fetch = vi.fn(async (_url: string) => new Response(JSON.stringify({ rows: [{ id: 1, name: 'Kalem' }], totalRows: 1 })));
    vi.stubGlobal('fetch', fetch);
    const element = document.createElement('acun-datatable') as AcunDataTableElement;
    element.setAttribute('src', '/api/products');
    element.setAttribute('server-side', '');
    element.columns = [{ data: 'name', title: 'Ürün' }];
    element.options = { buttons: ['csv'] };
    document.body.append(element);
    await tick();
    await element.table!.ready;
    expect(String(fetch.mock.calls[0]![0])).toContain('/api/products?page=1');
    expect(element.querySelector('thead')!.textContent).toContain('Ürün');
    expect(element.querySelector('.adt-tools')).not.toBeNull();
  });
});
