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
