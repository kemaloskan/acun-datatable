import { expect, test } from '@playwright/test';

// Visual regression of the stylesheet: screenshots of the main states, compared with
// the baselines in e2e/visual.spec.ts-snapshots (per platform: fonts render differently).
// Opt-in: `npm run e2e:visual`; `npm run e2e:visual -- --update-snapshots` after a
// deliberate change, then look at the new images before committing them.
test.skip(!process.env.ADT_VISUAL, 'set ADT_VISUAL=1 (npm run e2e:visual)');
test.skip(({ browserName }) => browserName !== 'chromium', 'one engine is enough for pixels');

const shot = async (page: import('@playwright/test').Page, name: string) => {
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }' });
  await expect(page.locator('#orders')).toHaveScreenshot(`${name}.png`, { maxDiffPixelRatio: 0.01 });
};

test('desktop, default size', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/e2e/fixtures/table.html');
  await shot(page, 'desktop');
});

for (const size of ['sm', 'lg']) {
  test(`size ${size}`, async ({ page }) => {
    await page.setViewportSize({ width: 1100, height: 700 });
    await page.goto(`/e2e/fixtures/table.html?size=${size}`);
    await shot(page, `size-${size}`);
  });
}

test('phone: cards', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/e2e/fixtures/table.html');
  await shot(page, 'phone-cards');
});

test('phone: collapse with an open row', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 800 });
  await page.goto('/e2e/fixtures/table.html?responsive=collapse');
  await page.getByRole('button', { name: 'Details of Ayşe' }).click();
  await shot(page, 'phone-collapse-open');
});

test('filters menu open with a chip', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/e2e/fixtures/table.html');
  await page.locator('summary', { hasText: /^Filters/ }).click();
  await page.getByLabel('Total: Min').fill('40');
  await page.getByLabel('Total: Min').press('Enter');
  await shot(page, 'filters-open');
});

test('child row, editor and resized columns', async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await page.goto('/e2e/fixtures/table.html?detail&edit&columns');
  await page.getByRole('button', { name: 'Details of Ayşe' }).click();
  await expect(page.locator('.adt-detail-content')).toContainText('Order lines');
  await page.getByRole('button', { name: 'Edit Customer: Ali' }).click();
  await shot(page, 'detail-edit');
});
