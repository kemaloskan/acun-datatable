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

test('responsive auto keeps every column once the user sizes one; reset brings it back', async ({ page }) => {
  await page.setViewportSize({ width: 330, height: 800 });
  await page.goto('/e2e/fixtures/table.html?columns&responsive=auto');
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  await expect(page.getByRole('columnheader', { name: 'City' })).toBeHidden(); // does not fit: hidden
  await page.getByRole('separator', { name: 'Resize Customer' }).focus();
  await page.keyboard.press('Shift+ArrowRight');
  await expect(page.getByRole('columnheader', { name: 'City' })).toBeVisible(); // a sized table scrolls instead
  expect(await page.locator('.adt-scroll').evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  await page.evaluate(() => (window as unknown as { __table: { setColumnWidths(widths: object): void } }).__table.setColumnWidths({}));
  await expect(page.getByRole('columnheader', { name: 'City' })).toBeHidden();
});

test('headers stay over their columns with fixed and resizable columns together', async ({ page }) => {
  const aligned = () => page.evaluate(() => {
    const head = [...document.querySelectorAll<HTMLElement>('thead tr:first-child > *')];
    const body = [...document.querySelectorAll<HTMLElement>('tbody tr.adt-row:first-child > *')];
    return head.flatMap((cell, index) => {
      const a = cell.getBoundingClientRect();
      const b = body[index]?.getBoundingClientRect();
      return a.width > 0 && b && (Math.abs(a.left - b.left) > 1 || Math.abs(a.width - b.width) > 1) ? [`${index}: ${Math.round(a.left)}/${Math.round(b.left)}`] : [];
    });
  });
  for (const [width, responsive] of [[1100, 'auto'], [700, 'auto'], [700, 'scroll'], [700, 'collapse']] as const) {
    await page.setViewportSize({ width, height: 800 });
    await page.goto(`/e2e/fixtures/table.html?fixed&columns&responsive=${responsive}`);
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    expect(await aligned()).toEqual([]);
    await page.getByRole('separator', { name: 'Resize Total' }).focus();
    for (let step = 0; step < 12; step++) await page.keyboard.press('Shift+ArrowRight'); // wider than the page
    expect(await aligned()).toEqual([]);
    await page.locator('.adt-scroll').evaluate(node => { node.scrollLeft = 300; });
    expect(await aligned()).toEqual([]);
  }
});

test('fixed columns stay in place while the table scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await page.goto('/e2e/fixtures/table.html?fixed&responsive=scroll');
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  // Narrow the box and widen the data columns so the table must scroll sideways.
  await page.addStyleTag({ content: '#orders { width: 520px } .adt-table :is(th.adt-th:not(.adt-actions), td[data-label]:not(.adt-actions)) { min-width: 9rem; white-space: nowrap }' });
  const scroller = page.locator('.adt-scroll');
  await expect.poll(() => scroller.evaluate(node => node.scrollWidth > node.clientWidth)).toBe(true);
  const customer = page.getByRole('cell', { name: 'Ayşe', exact: true });
  const edit = page.getByRole('button', { name: 'Edit: Ayşe' });
  const city = page.getByRole('cell', { name: 'İstanbul' }).first();
  const before = { customer: (await customer.boundingBox())!.x, edit: (await edit.boundingBox())!.x, city: (await city.boundingBox())!.x };
  const moved = await scroller.evaluate(node => { node.scrollLeft = 120; return node.scrollLeft; });
  expect(moved).toBeGreaterThan(20);
  await expect.poll(async () => Math.round((await city.boundingBox())!.x)).toBe(Math.round(before.city - moved)); // the middle scrolls
  expect((await customer.boundingBox())!.x).toBeCloseTo(before.customer, 0); // the first column stays
  expect((await edit.boundingBox())!.x).toBeCloseTo(before.edit, 0);         // so do the actions
});

test.describe('resizing and moving columns', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto('/e2e/fixtures/table.html?columns');
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
  });
  const order = (page: Page) => page.locator('thead th[data-column-id]').evaluateAll(cells => cells.map(cell => (cell as HTMLElement).dataset['columnId']));

  test('drag a header edge, or use the arrow keys on it', async ({ page }) => {
    const header = page.locator('th[data-column-id="customer"]');
    const before = (await header.boundingBox())!.width;
    const handle = page.getByRole('separator', { name: 'Resize Customer' });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 5 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await header.boundingBox())!.width)).toBe(Math.round(before + 60));
    await handle.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(async () => Math.round((await header.boundingBox())!.width)).toBe(Math.round(before + 76));
    await expect(handle).toBeFocused();
    expect(await order(page)).toEqual(['customer', 'total', 'city']); // a resize never moves the column
  });

  test('drag a header onto another, or use the column menu', async ({ page }) => {
    await page.locator('th[data-column-id="city"]').dragTo(page.locator('th[data-column-id="customer"]'), { targetPosition: { x: 4, y: 10 } });
    await expect.poll(() => order(page)).toEqual(['city', 'customer', 'total']);
    await page.locator('summary', { hasText: /^Columns$/ }).click();
    await page.getByRole('button', { name: 'Move Total up' }).click();
    await expect.poll(() => order(page)).toEqual(['city', 'total', 'customer']);
    await page.getByRole('button', { name: 'Reset columns' }).click();
    await expect.poll(() => order(page)).toEqual(['customer', 'total', 'city']);
  });
});

test('edit a cell in place: Enter saves, errors keep the editor, Escape cancels, a click away saves', async ({ page }) => {
  await page.goto('/e2e/fixtures/table.html?edit');
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  await page.getByRole('button', { name: 'Edit Customer: Ali' }).click();
  const field = page.getByRole('textbox', { name: 'Customer' });
  await expect(field).toBeFocused();
  await page.keyboard.type('Ali Kaya');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('cell', { name: 'Ali Kaya' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit Customer: Ali Kaya' })).toBeFocused();

  await page.getByRole('button', { name: 'Edit Customer: Can' }).click();
  await page.keyboard.type('bad');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('alert').filter({ hasText: 'Rejected by the server' })).toBeVisible();
  await expect(field).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('button', { name: 'Edit Customer: Can' })).toBeFocused();

  await page.getByRole('button', { name: 'Edit Customer: Deniz' }).click();
  await page.keyboard.type('Deniz Ak');
  await page.getByRole('heading').or(page.locator('caption')).first().click(); // leave the field
  await expect(page.getByRole('cell', { name: 'Deniz Ak' })).toBeVisible();
});

test('a click that closes an editor still reaches the control it was meant for', async ({ page }) => {
  await page.goto('/e2e/fixtures/table.html?edit');
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  const field = page.getByRole('textbox', { name: 'Customer' });
  await page.getByRole('button', { name: 'Edit Customer: Ali' }).click();
  await expect(field).toBeFocused();
  await page.getByRole('button', { name: 'Edit Customer: Can' }).click(); // closes Ali's (unchanged) editor
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('Can');
  const sort = page.getByRole('button', { name: 'Total', exact: true });
  await sort.click(); // closes Can's editor
  await expect(page.locator('#orders th', { has: sort })).toHaveAttribute('aria-sort', 'ascending');
  await expect(field).toHaveCount(0);
});

test('virtual rows scroll in their own box on a phone, in cards too', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const query of ['virtual', 'virtual&responsive=cards']) {
    await page.goto(`/e2e/fixtures/table.html?${query}`);
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    const scroller = page.locator('.adt-scroll');
    expect(await scroller.evaluate(node => getComputedStyle(node).overflowY)).toBe('auto');
    await scroller.evaluate(node => { node.scrollTop = 20_000; });
    await expect(page.locator('tbody .adt-row').first()).not.toContainText('Ayşe 1');
    const box = (await scroller.boundingBox())!;
    expect(box.height).toBeLessThanOrEqual(421); // the table stays inside its box
  }
});

test('Delete on a resize handle goes back to the width the content takes', async ({ page }) => {
  await page.setViewportSize({ width: 700, height: 800 });
  await page.goto('/e2e/fixtures/table.html?columns&responsive=scroll');
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  const customer = page.getByRole('separator', { name: 'Resize Customer' });
  await customer.focus();
  for (let step = 0; step < 30; step++) await page.keyboard.press('Shift+ArrowRight'); // wider than the page
  const total = page.getByRole('separator', { name: 'Resize Total' });
  await total.focus();
  await page.keyboard.press('Delete');
  const width = await page.locator('#orders th[data-column-id="total"]').evaluate(node => node.getBoundingClientRect().width);
  expect(width).toBeGreaterThan(48);
});

test('responsive auto hides only the columns that do not fit, at any width', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  await page.goto('/e2e/fixtures/table.html?responsive=auto');
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  await expect(page.getByRole('columnheader', { name: 'City' })).toBeVisible();
  await expect(page.locator('tbody .adt-expand').first()).toBeHidden(); // everything fits

  await page.setViewportSize({ width: 330, height: 800 });
  await expect(page.getByRole('columnheader', { name: 'City' })).toBeHidden(); // priority 3 goes first
  await expect(page.getByRole('columnheader', { name: 'Customer' })).toBeVisible();
  const scroller = page.locator('.adt-scroll');
  expect(await scroller.evaluate(node => node.scrollWidth <= node.clientWidth + 1)).toBe(true); // nothing scrolls sideways
  const details = page.getByRole('button', { name: 'Details of Ayşe' });
  await details.click();
  await expect(page.locator('.adt-detail').getByText('İstanbul')).toBeVisible();

  await page.setViewportSize({ width: 1100, height: 800 });
  await expect(page.getByRole('columnheader', { name: 'City' })).toBeVisible(); // back when there is room
  await expect(page.locator('.adt-detail')).toBeHidden();
});

test('virtual scrolling keeps the column widths while the rows change', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
  for (const mode of ['scroll', 'auto']) {
    await page.goto(`/e2e/fixtures/table.html?virtual&responsive=${mode}`);
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    const scroller = page.locator('.adt-scroll');
    const widths = () => page.locator('thead th').evaluateAll(cells => cells.map(cell => Math.round(cell.getBoundingClientRect().width)).join(','));
    const first = () => page.locator('tbody .adt-row').first().getAttribute('aria-rowindex');
    const before = await widths();
    for (const top of [4_000, 400_000, 1_200_000, 0]) {
      const index = await first();
      await scroller.evaluate((node, y) => { node.scrollTop = y; }, top);
      if (top > 0) await expect.poll(first).not.toBe(index); // other rows are drawn
      expect(await widths()).toBe(before); // with the same column widths
    }
  }
});

test('virtual scrolling keeps 50,000 rows to a handful in the page', async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto('/e2e/fixtures/table.html?virtual&responsive=scroll');
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  await expect(page.locator('.adt-info')).toHaveText('Showing 1 to 50,000 of 50,000 rows');
  const drawn = () => page.locator('tbody .adt-row').count();
  expect(await drawn()).toBeLessThan(40);
  const scroller = page.locator('.adt-scroll');
  await scroller.evaluate(node => { node.scrollTop = node.scrollHeight; });
  await expect(page.getByRole('cell', { name: 'Hakan 50000', exact: true })).toBeVisible();
  expect(await drawn()).toBeLessThan(40);
  await scroller.evaluate(node => { node.scrollTop = node.scrollHeight / 2; });
  const first = async () => Number((await page.locator('tbody .adt-row td:nth-child(2)').first().textContent())!.split(' ')[1]);
  await expect.poll(first).toBeLessThan(26_000); // re-drawn for the new position
  expect(await first()).toBeGreaterThan(24_000);
});

test('<acun-datatable> works from the script build, as in Angular, Svelte or Astro', async ({ page }) => {
  await page.goto('/e2e/fixtures/element.html');
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  await expect(page.getByRole('columnheader', { name: 'Ürün' })).toBeVisible();
  await expect(page.locator('acun-datatable tbody .adt-row')).toHaveCount(10);
  await page.getByRole('button', { name: 'Sayfa 2' }).click();
  await expect(page.locator('acun-datatable .adt-info')).toContainText('11 ile 20');
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

test('dark with the site\'s own theme switch: class="dark" (Tailwind) or data-bs-theme="dark" (Bootstrap 5.3)', async ({ page }) => {
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  const label = page.locator('#orders tbody td').nth(1);
  const color = () => label.evaluate(el => getComputedStyle(el).color);
  expect(await color()).toBe('rgb(31, 36, 48)');
  for (const name of ['class', 'data-bs-theme']) {
    await page.evaluate(n => document.documentElement.setAttribute(n, 'dark'), name);
    expect(await color()).toBe('rgb(230, 232, 236)');
    await page.evaluate(n => document.documentElement.removeAttribute(n), name);
    expect(await color()).toBe('rgb(31, 36, 48)');
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-bs-theme', 'light'));
  expect(await color()).toBe('rgb(31, 36, 48)'); // Bootstrap's light stays light
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

test.describe('filterPanel: the filter fields in a drawer or a modal', () => {
  for (const mode of ['drawer', 'modal'] as const) {
    test(`${mode}: opens from the button, filters, and closes with Escape, the backdrop or Close`, async ({ page }) => {
      await page.goto(`/e2e/fixtures/table.html?filterPanel=${mode}`);
      await expect(page.locator('body[data-ready=true]')).toBeAttached();
      const button = page.locator('.adt-filter-open');
      await expect(button).toHaveAccessibleName(/^Filters/);
      const dialog = page.getByRole('dialog', { name: 'Filters' });
      await expect(dialog).toBeHidden();
      await button.click();
      await expect(dialog).toBeVisible();
      await dialog.getByRole('checkbox', { name: 'Ankara' }).check();
      await expect(page.locator('.adt-chip')).toContainText('Ankara');
      await expect(button.locator('.adt-badge')).toHaveText('1');
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(button).toBeFocused(); // focus back on the button
      await button.click();
      await page.mouse.click(5, 400); // the backdrop, left of a drawer or around a modal
      await expect(dialog).toBeHidden();
      await button.click();
      await dialog.getByRole('button', { name: 'Close' }).last().click();
      await expect(dialog).toBeHidden();
      if (mode === 'drawer') {
        await button.click();
        const { width, height } = page.viewportSize()!;
        // Against the right edge, full height (once it has slid in).
        await expect.poll(async () => { const box = (await dialog.boundingBox())!; return [Math.round(box.x + box.width), Math.round(box.height)]; }).toEqual([width, height]);
      }
    });
  }
});
