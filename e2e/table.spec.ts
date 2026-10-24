import { expect, test, type Locator, type Page } from '@playwright/test';

type TableHandle = { getState(): { page: number; sorting: unknown[]; selectedIds: string[]; globalSearch: string }; setPageSize(size: number): void; setPage(page: number): void };
type TestWindow = Window & { __table: TableHandle; __xss?: number; __payloads: string[] };

/**
 * Safari only moves Tab between text fields unless "full keyboard access" is
 * on; Option+Tab reaches every control, which is what keyboard users rely on.
 */
async function tabKey(page: Page): Promise<string> {
  const mac = await page.evaluate(() => /Mac/.test(navigator.platform));
  return mac && test.info().project.name === 'webkit' ? 'Alt+Tab' : 'Tab';
}

/** Press Tab (or Shift+Tab) until `target` has focus, as a keyboard user would. */
async function tabTo(page: Page, target: Locator, direction: 'forward' | 'backward' = 'forward', limit = 40): Promise<void> {
  const key = direction === 'forward' ? await tabKey(page) : `Shift+${await tabKey(page)}`;
  const handle = await target.elementHandle();
  for (let i = 0; i < limit; i++) {
    await page.keyboard.press(key);
    if (await page.evaluate(element => document.activeElement === element, handle)) return;
  }
  throw new Error(`could not reach ${target} with ${key} in ${limit} presses`);
}

const state = (page: Page) => page.evaluate(() => (window as unknown as TestWindow).__table.getState());
const firstCells = (page: Page) => page.locator('#orders tbody tr td:nth-child(2)').allTextContents();

test.beforeEach(async ({ page }) => {
  await page.goto('/e2e/fixtures/table.html');
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
});

test.describe('keyboard only (SPEC M3)', () => {
  test('search with the keyboard', async ({ page }) => {
    const search = page.getByRole('searchbox', { name: 'Search' });
    await tabTo(page, search);
    await page.keyboard.type('ali');
    await page.keyboard.press('Enter');
    await expect(page.locator('#orders tbody tr')).toHaveCount(1);
    expect(await firstCells(page)).toEqual(['Ali']);
    for (let i = 0; i < 3; i++) await page.keyboard.press('Backspace');
    await page.keyboard.press('Enter');
    await expect(page.locator('#orders tbody tr')).toHaveCount(5);
  });

  test('sort with Enter and Space and keep focus on the header button', async ({ page }) => {
    const total = page.getByRole('button', { name: 'Total' });
    const header = page.locator('#orders th', { has: total });
    await tabTo(page, total);
    await page.keyboard.press('Enter');
    await expect(header).toHaveAttribute('aria-sort', 'ascending');
    await expect(total).toBeFocused();
    await page.keyboard.press('Space');
    await expect(header).toHaveAttribute('aria-sort', 'descending');
    await expect(total).toBeFocused();
    expect((await state(page)).sorting).toEqual([{ field: 'total', direction: 'desc' }]);
    await page.keyboard.press('Enter');
    await expect(header).not.toHaveAttribute('aria-sort', /.*/);
  });

  test('select rows with Space and use the tri-state select-all', async ({ page }) => {
    const row = page.getByRole('checkbox', { name: 'Select Ali' }); // row 2
    const all = page.getByRole('checkbox', { name: 'Select all rows on this page' });
    await tabTo(page, row);
    await page.keyboard.press('Space');
    await expect(row).toBeChecked();
    await expect(row).toBeFocused();
    expect(await all.evaluate(box => (box as HTMLInputElement).indeterminate)).toBe(true);
    await tabTo(page, all, 'backward'); // the header checkbox comes before the rows
    await page.keyboard.press('Space');
    expect((await state(page)).selectedIds).toEqual(['2', '1', '3', '4', '5']);
    await expect(all).toBeChecked();
  });

  test('page through results and keep focus at the last page', async ({ page }) => {
    const next = page.getByRole('button', { name: 'Next' });
    const status = page.locator('.adt-info');
    await tabTo(page, next);
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Showing 6 to 10 of 12 rows');
    await expect(page.getByRole('button', { name: 'Page 2' })).toHaveAttribute('aria-current', 'page');
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Showing 11 to 12 of 12 rows');
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter'); // ignored at the end
    expect((await state(page)).page).toBe(3);
    const previous = page.getByRole('button', { name: 'Previous' });
    await tabTo(page, previous, 'backward');
    await page.keyboard.press('Enter');
    expect((await state(page)).page).toBe(2);
    await page.getByRole('button', { name: 'Page 1' }).click();
    await expect(status).toHaveText('Showing 1 to 5 of 12 rows');
  });
});

test.describe('accessibility semantics', () => {
  test('exposes a named table, column headers, labelled controls and a live status', async ({ page }) => {
    await expect(page.getByRole('table', { name: 'Orders' })).toBeVisible();
    await expect(page.getByRole('columnheader')).toHaveCount(5); // select, customer, total, city, actions
    await expect(page.locator('#orders th[scope=col]')).toHaveCount(5);
    await page.getByRole('button', { name: 'Customer' }).click();
    // The sort mark is aria-hidden, so the accessible name stays "Customer".
    await expect(page.getByRole('button', { name: 'Customer', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible();
    await expect(page.locator('.adt-info')).toHaveAttribute('aria-live', 'polite');
    await expect(page.getByRole('combobox', { name: 'Rows per page' })).toHaveValue('5');
  });
});

test.describe('XSS fixture in a real browser (SPEC M3)', () => {
  test('renders hostile values as literal text and never executes them', async ({ page }) => {
    const dialogs: string[] = [];
    page.on('dialog', dialog => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await page.goto('/e2e/fixtures/xss.html');
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    const payloads = await page.evaluate(() => (window as unknown as TestWindow).__payloads);
    expect(await firstCells(page)).toEqual(payloads);
    await expect(page.locator('#orders caption')).toHaveText(payloads[3]!);
    await expect(page.locator('img, script:not([type]), svg:not(.adt-icon), iframe, a')).toHaveCount(0); // only the built-in icons
    await page.waitForTimeout(250); // give any onerror/onload a chance to fire
    expect(await page.evaluate(() => (window as unknown as TestWindow).__xss)).toBeUndefined();
    expect(dialogs).toEqual([]);

    // Control: the same payload through innerHTML does execute in this browser,
    // so the checks above would have caught an unsafe renderer.
    await page.evaluate(() => {
      const probe = document.createElement('div');
      probe.innerHTML = (window as unknown as TestWindow).__payloads[0]!;
      document.body.append(probe);
    });
    await expect.poll(() => page.evaluate(() => (window as unknown as TestWindow).__xss)).toBe(1);
    expect(dialogs).toEqual(['1']);
  });
});

test.describe('optional styles.css (second review: narrow screens)', () => {
  test('stacks rows as cards on a phone and keeps the page from scrolling sideways', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/e2e/fixtures/table.html');
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    const cell = page.locator('#orders tbody tr').first().locator('td').nth(1);
    expect(await cell.evaluate(td => getComputedStyle(td, '::before').content)).toBe('"Customer"');
    expect(await cell.evaluate(td => getComputedStyle(td).display)).toBe('grid');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Compact pager: the arrows, the ends and the current page stay; the numbers around it hide.
    await page.evaluate(() => {
      (window as unknown as TestWindow).__table.setPageSize(1);
      (window as unknown as TestWindow).__table.setPage(5);
    });
    await expect(page.getByRole('button', { name: 'Page 5' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Page 4' })).toBeHidden();
    await expect(page.getByRole('button', { name: 'Page 12' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('puts page size and search above the table, info and pages below it', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const box = (selector: string) => page.locator(selector).boundingBox();
    const [length, search, table, info, paging] = await Promise.all(
      ['.adt-length', '.adt-search', '#orders table', '.adt-info', '.adt-paging'].map(box));
    expect(length!.y + length!.height).toBeLessThanOrEqual(table!.y);
    expect(search!.x).toBeGreaterThan(length!.x);
    expect(info!.y).toBeGreaterThanOrEqual(table!.y + table!.height);
    expect(paging!.x).toBeGreaterThan(info!.x + info!.width); // pages on the right
  });

  test('keeps a normal table on a wide screen', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const display = await page.locator('#orders table').evaluate(table => getComputedStyle(table).display);
    expect(display).toBe('table');
    expect(await page.locator('#orders tbody td').nth(1).evaluate(td => getComputedStyle(td, '::before').content)).toBe('none');
  });
});

test.describe('responsive modes on a phone', () => {
  test.beforeEach(async ({ page }) => page.setViewportSize({ width: 375, height: 800 }));

  test('collapse hides lower-priority columns and opens them below the row', async ({ page }) => {
    await page.goto('/e2e/fixtures/table.html?responsive=collapse');
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    await expect(page.getByRole('columnheader', { name: 'City' })).toBeHidden();
    await expect(page.getByRole('columnheader', { name: 'Total' })).toBeHidden();
    const details = page.getByRole('button', { name: 'Details of Ayşe' });
    await details.click();
    await expect(details).toHaveAttribute('aria-expanded', 'true');
    const row = page.locator('.adt-detail');
    await expect(row.getByText('İstanbul')).toBeVisible();
    await row.getByRole('button', { name: 'Edit: Ayşe' }).click();
    expect(await page.evaluate(() => (window as unknown as { __edited?: string }).__edited)).toBe('1');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });

  test('modal opens every value in a dialog that Escape closes', async ({ page }) => {
    await page.goto('/e2e/fixtures/table.html?responsive=modal');
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    const details = page.getByRole('button', { name: 'Details of Ali' });
    await details.click();
    const dialog = page.getByRole('dialog', { name: 'Details of Ali' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Ankara')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(details).toBeFocused(); // focus goes back to the button
  });

  test('scroll keeps the table and scrolls it sideways inside its box', async ({ page }) => {
    await page.goto('/e2e/fixtures/table.html?responsive=scroll');
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    expect(await page.locator('#orders table').evaluate(table => getComputedStyle(table).display)).toBe('table');
    await expect(page.getByRole('columnheader', { name: 'City' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  });
});

test.describe('child rows', () => {
  for (const width of [1280, 375]) {
    test(`load and open below the row at ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/e2e/fixtures/table.html?detail');
      await expect(page.locator('body[data-ready=true]')).toBeAttached();
      const toggle = page.getByRole('button', { name: 'Details of Can' });
      await expect(toggle).toBeVisible(); // on a wide screen too, and in the cards of a phone
      await toggle.focus();
      await page.keyboard.press('Enter');
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('.adt-detail').getByText('Order lines of Can')).toBeVisible();
      await expect(toggle).toBeFocused();
      await page.keyboard.press('Space');
      await expect(page.locator('.adt-detail')).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    });
  }
});

test('styles stay light on a light page even when the system is dark', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await page.reload();
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  const label = page.locator('#orders tbody td').nth(1);
  expect(await label.evaluate(el => getComputedStyle(el).color)).toBe('rgb(31, 36, 48)'); // --adt-fg (light)
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  expect(await label.evaluate(el => getComputedStyle(el).color)).toBe('rgb(230, 232, 236)'); // dark on request
});

test.describe('new AcunDataTable(...) from a <script> tag', () => {
  test('server side over POST with a fixed header, as in DataTables', async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => { if (request.url().endsWith('/e2e/api/products')) requests.push(`${request.method()} ${request.postData()}`); });
    await page.goto('/e2e/fixtures/script.html');
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    const info = page.locator('.adt-info');
    await expect(info).toHaveText('Toplam: 120 kaydın 1 ile 25 arasını gösteriyor');
    expect(requests.at(-1)).toMatch(/^POST page=1&pageSize=25$/);

    // fixedHeader: the header row stays at the top of the window while the page scrolls.
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect.poll(() => page.locator('thead th').first().evaluate(th => Math.round(th.getBoundingClientRect().top))).toBe(0);
    await page.evaluate(() => window.scrollTo(0, 0));

    await page.getByRole('button', { name: 'Sayfa 2' }).click();
    await expect(info).toHaveText('Toplam: 120 kaydın 26 ile 50 arasını gösteriyor');
    await page.getByRole('searchbox', { name: 'Ara' }).fill('kalem');
    await expect(info).toHaveText('Toplam: 20 kaydın 1 ile 20 arasını gösteriyor');
    await page.getByRole('button', { name: 'Price' }).click();
    await expect(page.locator('tbody tr').first().locator('td').nth(3)).toHaveText('10');
    expect(requests.at(-1)).toContain('sort=price%3Aasc');
  });
});
