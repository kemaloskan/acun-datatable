import { expect, test, type Locator, type Page } from '@playwright/test';

type TableHandle = { getState(): { page: number; sorting: unknown[]; selectedIds: string[]; globalSearch: string } };
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
    const row = page.getByRole('checkbox', { name: 'Select row 2' });
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
    const status = page.locator('.adt-status');
    await tabTo(page, next);
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Page 2 of 3 · 12 rows');
    await page.keyboard.press('Enter');
    await expect(status).toHaveText('Page 3 of 3 · 12 rows');
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await expect(next).toBeFocused();
    await page.keyboard.press('Enter'); // ignored at the end
    expect((await state(page)).page).toBe(3);
    const previous = page.getByRole('button', { name: 'Previous' });
    await page.keyboard.press(`Shift+${await tabKey(page)}`);
    await expect(previous).toBeFocused();
    await page.keyboard.press('Enter');
    expect((await state(page)).page).toBe(2);
  });
});

test.describe('accessibility semantics', () => {
  test('exposes a named table, column headers, labelled controls and a live status', async ({ page }) => {
    await expect(page.getByRole('table', { name: 'Orders' })).toBeVisible();
    await expect(page.getByRole('columnheader')).toHaveCount(3);
    await expect(page.locator('#orders th[scope=col]')).toHaveCount(3);
    await page.getByRole('button', { name: 'Customer' }).click();
    // The sort mark is aria-hidden, so the accessible name stays "Customer".
    await expect(page.getByRole('button', { name: 'Customer', exact: true })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toBeVisible();
    await expect(page.locator('.adt-status')).toHaveAttribute('aria-live', 'polite');
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
    await expect(page.locator('img, script:not([type]), svg, iframe, a')).toHaveCount(0);
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
