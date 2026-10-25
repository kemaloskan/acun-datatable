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
  await phone.locator('html').evaluate(() => { (window as unknown as { kept: boolean }).kept = true; });
  await page.getByRole('radio', { name: /Kart/ }).click();
  await expect(phone.locator('.adt-table-wrap')).toHaveClass(/adt-responsive--cards/);
  await page.locator('#theme').click();
  await expect(phone.locator('html')).toHaveAttribute('data-theme', 'dark');
  // Rebuilt in place, not reloaded: a reload would flash a blank screen.
  expect(await phone.locator('html').evaluate(() => (window as unknown as { kept?: boolean }).kept)).toBe(true);
});

test('phone: the menu buttons are icons with their names kept, and an open menu stays inside the window', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('/site/demo/phone.html?mode=auto&lang=en');
  await expect(page.locator('tbody .adt-row').first()).toBeVisible();
  const summary = page.locator('.adt-columns > summary').first();
  await expect(summary).toHaveAccessibleName('Columns');
  await expect.poll(async () => { const box = (await summary.boundingBox())!; return Math.round(box.width) === Math.round(box.height); }).toBe(true); // square: the icon only
  const button = (await summary.boundingBox())!;
  const search = (await page.getByRole('searchbox').boundingBox())!;
  expect(button.y).toBeGreaterThanOrEqual(search.y + search.height); // a row of their own under the search
  await summary.click();
  const panel = page.locator('.adt-columns[open] > fieldset');
  await expect.poll(async () => { const box = (await panel.boundingBox())!; return box.x >= 7 && box.x + box.width <= 375 - 7; }).toBe(true);
  await expect(page.getByRole('checkbox', { name: 'Customer' })).toBeVisible();
});

test('phone cards: no column names above the cards, but "select all" stays with its text', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('/site/demo/phone.html?mode=cards&lang=en');
  await expect(page.locator('tbody .adt-row').first()).toBeVisible();
  await expect(page.locator('thead th[data-column-id]').first()).toBeHidden();
  await expect(page.locator('thead .adt-select-all-text')).toHaveText('Select all rows on this page');
  await expect(page.locator('thead .adt-select-all-text')).toBeVisible();
  await page.locator('thead .adt-select-all-text').click(); // the text is part of the label
  await expect(page.getByRole('checkbox', { name: 'Select all rows on this page' })).toBeChecked();
  expect(await page.locator('tbody .adt-row--selected').count()).toBe(await page.locator('tbody .adt-row').count());
});

test('phone: the selection bar stays in sight at the bottom, its choices in one select', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 760 });
  await page.goto('/site/demo/index.html#/server');
  await expect(page.locator('#server .adt-info')).toContainText('5.000');
  await page.locator('#server tbody .adt-row').nth(8).scrollIntoViewIfNeeded();
  await page.locator('#server thead .adt-select input').click();
  // One line on a phone: the count and a select with the choices instead of the buttons.
  const menu = page.locator('#server .adt-selection').getByRole('combobox', { name: 'Seçili satırlar' });
  await expect(menu).toBeInViewport();
  await expect(page.locator('#server .adt-selection .adt-bulk-action')).toBeHidden();
  await expect(menu.locator('option')).toHaveText(['İşlemler', 'Kargoya ver', 'Eşleşen 5.000 kaydın tümünü seç', 'Seçimi temizle']);
  await menu.selectOption('__matching');
  await expect(page.locator('#server .adt-selection-count')).toContainText('5.000');
  await expect(menu).toHaveValue('');
  await menu.selectOption('__clear');
  await expect(page.locator('#server .adt-selection')).toBeHidden();
});

test('dark mode from the first paint: no light flash on the page or in the phone frame', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  // The theme as the <body> starts, before any of the page's own scripts at the end run.
  await page.addInitScript(() => {
    new MutationObserver((_, observer) => {
      if (!document.body) return;
      (window as unknown as { themeAtBody: string | null }).themeAtBody = document.documentElement.getAttribute('data-theme');
      observer.disconnect();
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto('/site/demo/index.html#/mobile');
  expect(await page.evaluate(() => (window as unknown as { themeAtBody: string | null }).themeAtBody)).toBe('dark');
  const frame = page.locator('iframe[data-phone]');
  expect(await frame.evaluate(node => getComputedStyle(node).backgroundColor)).toBe('rgb(11, 13, 18)'); // the page, not white, while it loads
  await expect(page.frameLocator('iframe[data-phone]').locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.goto('/site/index.html');
  expect(await page.evaluate(() => (window as unknown as { themeAtBody: string | null }).themeAtBody)).toBeNull(); // the docs follow the system in CSS
  await page.evaluate(() => localStorage.setItem('adt-theme', 'dark'));
  await page.emulateMedia({ colorScheme: 'light' });
  await page.reload();
  expect(await page.evaluate(() => (window as unknown as { themeAtBody: string | null }).themeAtBody)).toBe('dark'); // a chosen theme before the first paint
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

test('print: only the table, every matching row as shown, not the page', async ({ page }) => {
  await page.goto('/site/demo/index.html#/server');
  await expect(page.locator('#server .adt-info')).toContainText('5.000');
  await page.locator('#server').getByRole('searchbox').fill('ayse istanbul');
  await expect(page.locator('#server .adt-info')).not.toContainText('5.000');
  const matches = Number((await page.locator('#server .adt-info').textContent())!.match(/Toplam: ([\d.]+)/)![1]!.replace('.', ''));
  // Catch the frame's print() instead of opening the browser's dialog.
  await page.evaluate(() => {
    new MutationObserver(records => {
      for (const node of records.flatMap(record => [...record.addedNodes])) {
        if (node instanceof HTMLIFrameElement) {
          node.contentWindow!.print = () => {
            const doc = node.contentDocument!;
            (window as unknown as { printed: unknown }).printed = {
              title: doc.querySelector('h1')?.textContent, headers: [...doc.querySelectorAll('th')].map(th => th.textContent),
              rows: doc.querySelectorAll('tbody tr').length, first: doc.querySelector('tbody tr')?.textContent, badge: !!doc.querySelector('tbody .badge'),
              page: !!doc.querySelector('.tabs, header, .controls'),
            };
          };
        }
      }
    }).observe(document.body, { childList: true });
  });
  await page.locator('#server').getByText('Araçlar').click();
  await page.locator('#server .adt-menu-item[data-action="print"]').click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { printed?: unknown }).printed)).toBeTruthy();
  const printed = await page.evaluate(() => (window as unknown as { printed: { title: string; headers: string[]; rows: number; first: string; badge: boolean; page: boolean } }).printed);
  expect(printed.title).toBe('Canlı demo · Acun DataTable');
  expect(printed.headers).toEqual(['Müşteri', 'Şehir', 'Tutar', 'Durum', 'Sipariş tarihi']);
  expect(printed.rows).toBe(matches); // every match, not the page of 25
  expect(printed.first).toContain('Ayşe');
  expect(printed.first).toContain('₺');
  expect(printed.badge).toBe(true);
  expect(printed.page).toBe(false); // not the demo page around it
});
