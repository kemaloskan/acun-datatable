import { existsSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// The Livewire tables of acunsoft/datatable-laravel in real browsers, served by
// `testbench serve` from packages/adapter-laravel/workbench. Each browser has its own
// SQLite copy (cookie adt_db), reset before every test.
test.skip(!existsSync('packages/adapter-laravel/vendor/autoload.php'), 'composer install in packages/adapter-laravel first');
test.describe.configure({ mode: 'serial' });

const BASE = 'http://127.0.0.1:8123';
test.beforeEach(async ({ page, browserName }) => {
  await page.context().addCookies([{ name: 'adt_db', value: browserName, url: BASE }]);
  await page.request.get(`${BASE}/reset`, { headers: { Cookie: `adt_db=${browserName}` } });
});
const open = async (page: Page, path: string) => {
  await page.goto(`${BASE}${path}`);
  await expect(page.locator('.adt-info')).toBeVisible();
};
const names = async (page: Page) => (await page.locator('tbody .adt-row td[data-label="Customer"]').allTextContents()).map(name => name.trim());

test('sorts, searches and pages over the server', async ({ page }) => {
  await open(page, '/tables/responsive');
  await expect(page.locator('.adt-info')).toHaveText('Showing 1 to 25 of 30 rows');
  await page.getByRole('button', { name: 'Customer' }).click();
  await expect(page.getByRole('columnheader', { name: 'Customer' })).toHaveAttribute('aria-sort', 'ascending');
  await expect.poll(async () => (await names(page))[0]).toBe('Ali Kaya');
  await page.getByRole('searchbox').fill('ayse');
  await expect(page.locator('.adt-info')).toHaveText('Showing 1 to 1 of 1 row');
  await expect.poll(() => names(page)).toEqual(['Ayşe Yılmaz']); // Turkish-insensitive search on the server
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: 'Page 2' }).click();
  await expect(page.locator('.adt-info')).toHaveText('Showing 26 to 30 of 30 rows');
});

test('the filters menu stays open while filtering and shows a chip', async ({ page }) => {
  await open(page, '/tables/filters');
  const menu = page.locator('details.adt-filters');
  await menu.locator('summary').click();
  await page.getByLabel('Total: Min').fill('100');
  await page.getByLabel('Total: Min').press('Enter');
  await expect(page.locator('.adt-chip')).toHaveCount(1);
  await expect(menu).toHaveAttribute('open', ''); // a Livewire update does not close it
  await expect(page.locator('.adt-info')).toHaveText('Showing 1 to 25 of 25 rows'); // 30 orders, 25 of them at least 100
});

test('edits a cell in place, shows a validation error, cancels with Escape', async ({ page }) => {
  await open(page, '/tables/edit');
  await page.getByRole('button', { name: 'Edit Customer: Ali Kaya' }).click();
  const field = page.getByRole('textbox', { name: 'Customer' });
  await expect(field).toBeFocused();
  await page.keyboard.type('Ali Can Kaya');
  await page.keyboard.press('Enter');
  await expect(page.locator('tbody').getByText('Ali Can Kaya')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Customer: Ali Can Kaya' })).toBeFocused();

  await page.getByRole('button', { name: 'Edit Total: Ayşe Yılmaz' }).click();
  await page.keyboard.type('abc');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'must be a number' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit Total: Ayşe Yılmaz' })).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('resizes and moves columns', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await open(page, '/tables/responsive?resize=1&reorder=1');
  const city = page.locator('th[data-column-id="city"]');
  const before = (await city.boundingBox())!.width;
  const handle = page.getByRole('separator', { name: 'Resize City' });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect.poll(async () => Math.round((await city.boundingBox())!.width)).toBe(Math.round(before + 70));
  await page.locator('details.adt-columns:not(.adt-menu) > summary').click();
  await page.getByRole('button', { name: 'Move Note up' }).click();
  await expect.poll(() => page.locator('thead th[data-column-id]').evaluateAll(cells => cells.map(cell => (cell as HTMLElement).dataset['columnId'])))
    .toEqual(['customer', 'city', 'note', 'total']);
});

test('auto responsive hides what does not fit and opens it below the row', async ({ page }) => {
  await page.setViewportSize({ width: 340, height: 800 });
  await open(page, '/tables/responsive?mode=auto');
  await expect(page.getByRole('columnheader', { name: 'Note' })).toBeHidden();
  await page.getByRole('button', { name: 'Details of Ayşe Yılmaz' }).click();
  await expect(page.locator('.adt-detail').getByText('VIP')).toBeVisible();
  await page.setViewportSize({ width: 1200, height: 800 });
  await expect(page.getByRole('columnheader', { name: 'Note' })).toBeVisible();
});

test('a child row is rendered on the server once opened', async ({ page }) => {
  await open(page, '/tables/responsive?detail=fixtures::order-lines');
  await expect(page.getByText('Lines of')).toHaveCount(0);
  await page.getByRole('button', { name: 'Details of Can Öztürk' }).click();
  await expect(page.getByText('Lines of Can Öztürk (#3)')).toBeVisible();
});

test('cursor paging reaches pages one after another', async ({ page }) => {
  await open(page, '/tables/cursor');
  await expect(page.getByRole('button', { name: 'Page 3' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Page 2' }).click();
  await expect(page.getByRole('button', { name: 'Page 3' })).toBeVisible();
});

test.describe('import (TableImport, the import protocol, the import dialog)', () => {
  test('the Laravel endpoint passes the conformance run of @acunsoft/datatable-import', async ({ page }) => {
    await open(page, '/tables/import');
    // Run in the page: its session cookie and CSRF token are those of a signed-in visitor.
    const result = await page.evaluate(async () => {
      const served = '/import/testing.js'; // the built test kit, served by the workbench
      const kit = await import(served) as typeof import('../packages/import/src/testing');
      const token = document.querySelector<HTMLMetaElement>('meta[name=csrf-token]')!.content;
      return kit.runImportConformance({
        url: `${location.origin}/import/orders`, headers: { 'X-CSRF-TOKEN': token },
        file: new File(['Customer,City,Total\nConformance A,Bursa,1\n,Nowhere,2\n'], 'orders.csv', { type: 'text/csv' }),
      });
    });
    expect(result.checks.filter(check => !check.ok)).toEqual([]);
    expect(result.ok).toBe(true);
  });

  test('"Import…" in the tools menu opens the dialog; the Livewire table refreshes', async ({ page }) => {
    await open(page, '/tables/import');
    await expect(page.locator('.adt-info')).toHaveText('Showing 1 to 25 of 30 rows');
    await page.locator('summary', { hasText: 'Tools' }).click();
    await page.getByRole('button', { name: 'Import…' }).click();
    const dialog = page.getByRole('dialog', { name: 'Import' });
    await expect(dialog.locator('.adt-import-hint')).toHaveText('Accepted: .xlsx, .csv · Up to 64 KB · up to 500 rows');
    await dialog.locator('input[type=file]').setInputFiles({
      name: 'orders.csv', mimeType: 'text/csv', buffer: Buffer.from('Customer,City,Total\nAli Kaya,Bursa,10.5\nNew Customer,Bursa,12.5\n,Nowhere,1\n'),
    });
    await expect(dialog.getByRole('combobox', { name: 'Customer: Imported as' })).toHaveValue('customer');
    await expect(dialog.getByRole('combobox', { name: 'Rows that already exist' })).toHaveValue('upsert');
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Import finished' })).toBeVisible();
    await expect(dialog.locator('.adt-import-counts dd')).toHaveText(['1', '1', '0', '1']);
    await expect(dialog.locator('.adt-import-problems li')).toHaveText(['Line 4 · customer: required value is empty']);
    await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
    await expect(page.locator('.adt-info')).toHaveText('Showing 1 to 25 of 31 rows'); // $wire.$refresh()
    await page.getByRole('searchbox').fill('new customer');
    await expect.poll(() => names(page)).toEqual(['New Customer']);
  });
});
