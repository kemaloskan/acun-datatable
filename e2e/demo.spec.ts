import { existsSync } from 'node:fs';
import { expect, test } from '@playwright/test';

// The live demo (site/demo) with the <script> build copied in by `npm run demo`.
test.skip(!existsSync('site/demo/acun-datatable.min.js'), 'npm run demo first');

test('the live demo: server side with totals, editing, virtual scrolling', async ({ page }) => {
  await page.goto('/site/demo/index.html');
  await expect(page.locator('#server .adt-info')).toHaveText('Toplam: 5.000 kaydın 1 ile 25 arasını gösteriyor');
  await expect(page.locator('#server tfoot')).toContainText('₺');
  await page.locator('#server').getByRole('searchbox').fill('ayse');
  await expect(page.locator('#server tbody .adt-row').first()).toContainText('Ayşe');

  await page.getByRole('tab', { name: /Yerel/ }).click();
  await page.getByRole('button', { name: /^Stok düzenle:/ }).first().click();
  await page.keyboard.type('-5');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Stok eksi olamaz.' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.getByRole('tab', { name: /Sanal/ }).click();
  await expect(page.locator('#virtual .adt-info')).toHaveText('Toplam: 100.000 kaydın 1 ile 100.000 arasını gösteriyor');
  expect(await page.locator('#virtual tbody .adt-row').count()).toBeLessThan(40);
});
