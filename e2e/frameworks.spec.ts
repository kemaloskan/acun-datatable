// React, Vue and the <script> build against a real Node back end
// (@acunsoft/datatable-server over SQLite, e2e/orders-api.mjs): the
// requests each front end sends and the answers the server package gives.
import { expect, test, type Page } from '@playwright/test';

const api = async (page: Page, query: string) => (await page.request.get(`/e2e/api/orders?${query}`)).json() as Promise<{ rows: { customer: string; total: number }[]; totalRows: number; nextCursor?: string }>;
const info = (page: Page) => page.locator('.adt-info');
const firstCustomer = (page: Page) => page.locator('#orders tbody tr').first().locator('td').filter({ hasText: /\S/ }).first();

for (const app of ['react', 'vue']) {
  test.describe(`${app} with the Node server package`, () => {
    test('pages, sorts, searches Turkish text and filters through the server', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', error => errors.push(error.message));
      await page.goto(`/e2e/fixtures/${app}.html`);
      await expect(info(page)).toHaveText('Showing 1 to 10 of 500 rows');
      await expect(page.locator('#orders tbody tr.adt-row')).toHaveCount(10);

      await page.getByRole('button', { name: 'Total', exact: true }).click();
      await page.getByRole('button', { name: 'Total', exact: true }).click();
      const top = await api(page, 'pageSize=1&sort=total:desc');
      await expect(page.locator('#orders tbody tr.adt-row').first()).toContainText(top.rows[0]!.customer);

      await page.getByRole('button', { name: 'Next' }).click();
      await expect(info(page)).toHaveText('Showing 11 to 20 of 500 rows');

      await page.getByRole('searchbox', { name: 'Search' }).fill('ayse');
      const found = await api(page, 'pageSize=1&search=ayse');
      await expect(info(page)).toHaveText(`Showing 1 to 10 of ${found.totalRows} rows`); // "ayse" finds "Ayşe", back on page 1
      await expect(page.locator('#orders tbody tr.adt-row').first()).toContainText('Ayşe');
      expect(errors).toEqual([]);
    });

    test('shows a lower bound when the back end stopped counting, and no total when it did not count', async ({ page }) => {
      await page.goto(`/e2e/fixtures/${app}.html?limited`);
      await expect(info(page)).toHaveText('Showing 1 to 10 of 100+ rows'); // the server counted up to 100
      await expect(page.getByRole('button', { name: 'Page 11' })).toBeVisible(); // 101 rows are known to exist
      await expect(page.getByRole('button', { name: 'Page 12' })).toHaveCount(0);
      await page.getByRole('button', { name: 'Page 11' }).click();
      await expect(info(page)).toHaveText('Showing 101 to 110 of 100+ rows');
      await page.getByRole('searchbox', { name: 'Search' }).fill('ayse');
      const found = await api(page, 'pageSize=1&search=ayse');
      await expect(info(page)).toHaveText(`Showing 1 to 10 of ${found.totalRows} rows`); // under the limit: exact
    });

    test('keeps the column widths while virtual rows scroll by', async ({ page }) => {
      await page.setViewportSize({ width: 1100, height: 800 });
      await page.goto(`/e2e/fixtures/${app}.html?virtual`);
      const scroller = page.locator('.adt-scroll');
      await expect(page.locator('tbody .adt-row').first()).toBeVisible();
      const widths = () => page.locator('thead th').evaluateAll(cells => cells.map(cell => Math.round(cell.getBoundingClientRect().width)).join(','));
      const first = () => page.locator('tbody .adt-row').first().textContent();
      await expect.poll(widths).not.toBe(''); // measured and locked after the first rows
      const before = await widths();
      for (const top of [3_000, 250_000, 600_000, 0]) {
        const text = await first();
        await scroller.evaluate((node, y) => { node.scrollTop = y; }, top);
        await expect.poll(first).not.toBe(text);
        expect(await widths()).toBe(before);
      }
    });

    test('follows keyset cursors page after page', async ({ page }) => {
      await page.goto(`/e2e/fixtures/${app}.html?cursor`);
      await expect(info(page)).toHaveText('Showing 1 to 10 of 500 rows');
      const first = await api(page, 'pageSize=10&paging=cursor');
      const second = await api(page, `pageSize=10&paging=cursor&cursor=${first.nextCursor}`);
      await page.getByRole('button', { name: 'Next' }).click();
      await expect(info(page)).toHaveText('Showing 11 to 20 of 500 rows');
      await expect(page.locator('#orders tbody tr.adt-row').first()).toContainText(second.rows[0]!.customer);
    });
  });
}

test.describe('the <script> build with the Node server package', () => {
  for (const variant of ['', '?post', '?protocol=datatables', '?cursor']) {
    test(`answers ${variant || 'GET'} requests`, async ({ page }) => {
      await page.goto(`/e2e/fixtures/node.html${variant}`);
      await expect(info(page)).toHaveText('Showing 1 to 10 of 500 rows');
      await page.getByRole('button', { name: 'Total', exact: true }).click();
      const low = await api(page, 'pageSize=1&sort=total:asc');
      await expect(page.locator('.adt-table tbody tr.adt-row').first()).toContainText(low.rows[0]!.customer);
      await page.getByRole('button', { name: 'Next' }).click();
      await expect(info(page)).toHaveText('Showing 11 to 20 of 500 rows');
    });
  }

  test('shows the lower bound of a limited count', async ({ page }) => {
    await page.goto('/e2e/fixtures/node.html?limited');
    await expect(info(page)).toHaveText('Showing 1 to 10 of 100+ rows');
    const answer = await (await page.request.get('/e2e/api/orders-limited?pageSize=10')).json();
    expect(answer).toMatchObject({ totalRowsAtLeast: 101 });
    expect(answer).not.toHaveProperty('totalRows');
  });

  test('refuses what the allowlist does not allow: 422, or DataTables\' error with a 200', async ({ page }) => {
    const refused = await page.request.get('/e2e/api/orders?filters[0][field]=total&filters[0][op]=contains&filters[0][value]=1');
    expect(refused.status()).toBe(422);
    expect((await refused.json()).errors).toEqual({ 'filters.0.op': '"contains" does not apply to the decimal column "total"' });
    const datatables = await page.request.get('/e2e/api/orders?draw=4&columns[0][data]=secret&order[0][column]=0&order[0][dir]=asc');
    expect(datatables.status()).toBe(200);
    expect(await datatables.json()).toMatchObject({ draw: 4, error: 'unknown column "secret"', data: [] });
    const rows = (await api(page, 'pageSize=100')).rows;
    expect(Object.keys(rows[0]!)).not.toContain('secret'); // only the selected columns leave the server
  });

  test('shows the server\'s refusal (422, or DataTables\' error) as an error, not as no rows', async ({ page }) => {
    for (const variant of ['', '?protocol=datatables']) {
      await page.goto(`/e2e/fixtures/node.html${variant}`);
      await expect(info(page)).toHaveText('Showing 1 to 10 of 500 rows');
      await page.evaluate(() => (window as unknown as { dt: { table: { setFilters(rules: unknown[]): void } } }).dt.table.setFilters([{ field: 'total', operator: 'contains', value: '1' }]));
      await expect(page.getByRole('alert')).toContainText('The data could not be loaded.');
      await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible();
    }
  });
});
