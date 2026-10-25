import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// The live demo (site/demo) with the <script> build copied in by `npm run demo`.
test.skip(!existsSync('site/demo/acun-datatable.min.js'), 'npm run demo first');

test('server side: paging, folded search and filters through the fake API', async ({ page }) => {
  await page.goto('/site/demo/index.html');
  await expect(page.locator('#server .adt-info')).toHaveText('Toplam: 5.000 kaydın 1 ile 25 arasını gösteriyor');
  await page.locator('#server').getByRole('searchbox').fill('ayse');
  await expect(page.locator('#server tbody .adt-row').first()).toContainText('Ayşe');
  await expect(page.locator('[data-code="server"]')).toContainText("serverSide: true");
});

test('columns: move one with the column menu, and the order is kept', async ({ page }) => {
  await page.goto('/site/demo/index.html#/columns');
  const headers = () => page.locator('#columns thead th[data-column-id]').allTextContents();
  await expect(page.locator('#columns .adt-info')).toContainText('300');
  expect((await headers())[0]).toMatch(/Ürün/);
  await page.locator('#columns summary', { hasText: 'Kolonlar' }).click();
  await page.locator('#columns').getByRole('button', { name: 'Kod kolonunu aşağı taşı' }).click();
  await expect.poll(async () => (await headers()).map(text => text.replace(/[^\p{L} ]/gu, '').trim()).slice(1, 3)).toEqual(['Kategori', 'Kod']);
  await page.reload();
  await expect.poll(async () => (await headers()).map(text => text.replace(/[^\p{L} ]/gu, '').trim()).slice(1, 3)).toEqual(['Kategori', 'Kod']);
});

test('editing: a refused save keeps the editor open with the message', async ({ page }) => {
  await page.goto('/site/demo/index.html#/edit');
  await page.getByRole('button', { name: /^Stok düzenle:/ }).first().click();
  await page.keyboard.type('-5');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Stok eksi olamaz.' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('virtual scrolling: 100,000 rows, only those in view drawn', async ({ page }) => {
  await page.goto('/site/demo/index.html');
  await page.getByRole('tab', { name: /Sanal/ }).click();
  await expect(page).toHaveURL(/#\/virtual$/);
  await expect(page.locator('#virtual .adt-info')).toHaveText('Toplam: 100.000 kaydın 1 ile 100.000 arasını gösteriyor');
  expect(await page.locator('#virtual tbody .adt-row').count()).toBeLessThan(40);
});

test('mobile: one phone-sized frame in the chosen mode, with that mode\'s code beside it', async ({ page }) => {
  await page.goto('/site/demo/index.html#/mobile');
  const phone = page.frameLocator('iframe[data-phone]');
  await expect(phone.locator('.adt-table-wrap')).toHaveClass(/adt-responsive--collapse/);
  await expect(phone.locator('tbody .adt-expand').first()).toBeVisible(); // ⊕ opens the hidden columns
  await expect(page.locator('[data-code="mobile"]')).toContainText("responsive: 'collapse'");
  await page.getByRole('radio', { name: /Pencere \(modal\)/ }).click();
  await expect(page.locator('[data-code="mobile"]')).toContainText("responsive: 'modal'");
  await expect(phone.locator('.adt-table-wrap')).toHaveClass(/adt-responsive--modal/);
  await phone.locator('tbody .adt-expand').first().click();
  await expect(phone.getByRole('dialog')).toBeVisible();
  await page.getByRole('radio', { name: /Kart/ }).click();
  await expect(phone.locator('.adt-table-wrap')).toHaveClass(/adt-responsive--cards/);
});

test('frameworks: the same orders in plain JavaScript, the element, Vue and React', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/site/demo/index.html#/frameworks');
  for (const [name, code] of [['JavaScript', 'new AcunDataTable'], ['Web Component', '<acun-datatable'], ['Vue', 'useDataTable'], ['React', 'DataTableLayout']] as const) {
    await page.locator('.fw-tabs').getByRole('tab', { name }).click();
    await expect(page.locator('#frameworks .adt-info')).toHaveText('Toplam: 120 kaydın 1 ile 8 arasını gösteriyor');
    await expect(page.locator('[data-fw-code]')).toContainText(code);
    await page.locator('#frameworks').getByRole('searchbox').fill('ayse');
    await expect(page.locator('#frameworks tbody .adt-row').first()).toContainText('Ayşe');
  }
  await page.locator('.fw-tabs').getByRole('tab', { name: 'Livewire' }).click();
  await expect(page.locator('#frameworks .fw-note')).toContainText('Livewire sunucuda çalışır');
  await expect(page.locator('[data-fw-code]')).toContainText('use WithDataTable;');
  expect(errors).toEqual([]);
});

test('one language for the whole page: texts, tables, frameworks and the phone', async ({ page }) => {
  await page.goto('/site/demo/index.html#/server');
  await page.locator('#language').selectOption('en');
  await expect(page).toHaveTitle('Live demo · Acun DataTable');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.locator('h1')).toHaveText('Live demo');
  await expect(page.locator('#server .adt-info')).toHaveText('Showing 1 to 25 of 5,000 rows');
  await expect(page.locator('#server thead')).toContainText('Customer');
  await expect(page.locator('[data-code="server"]')).toContainText("language: 'en'");
  await page.getByRole('tab', { name: /Frameworks/ }).click();
  await page.locator('.fw-tabs').getByRole('tab', { name: 'React' }).click();
  await expect(page.locator('#frameworks .adt-info')).toHaveText('Showing 1 to 8 of 120 rows');
  await expect(page.locator('[data-fw-code]')).toContainText('labelsEn');
  await page.getByRole('tab', { name: /Mobile/ }).click();
  await expect(page.frameLocator('iframe[data-phone]').locator('h1')).toHaveText('Orders');
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Live demo'); // the choice is remembered
});
