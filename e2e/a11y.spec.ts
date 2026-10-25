import { existsSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Automated accessibility checks (axe, WCAG 2.1 A/AA) of the rendered table in its main states.
const check = async (page: Page, what: string) => {
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).include('#orders, acun-datatable').analyze();
  const problems = result.violations.map(violation => `${violation.id}: ${violation.help} (${violation.nodes.map(node => node.target.join(' ')).join(', ')})`);
  expect(problems, what).toEqual([]);
};

test.describe('accessibility (axe)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'axe once is enough');

  for (const query of ['', '?responsive=collapse', '?responsive=modal', '?responsive=auto', '?detail', '?columns', '?edit', '?fixed&responsive=scroll', '?virtual&responsive=scroll']) {
    test(`the table${query || ' (default)'}`, async ({ page }) => {
      if (query === '?responsive=auto') await page.emulateMedia({ colorScheme: 'dark' }); // the dark theme too
      await page.goto(`/e2e/fixtures/table.html${query}`);
      await expect(page.locator('body[data-ready=true]')).toBeAttached();
      await check(page, query);
    });
  }

  for (const mode of ['drawer', 'modal']) {
    test(`the filter fields in a ${mode}`, async ({ page }) => {
      await page.goto(`/e2e/fixtures/table.html?filterPanel=${mode}`);
      await expect(page.locator('body[data-ready=true]')).toBeAttached();
      await page.locator('.adt-filter-open').click();
      await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
      await check(page, `filters ${mode}`);
    });
  }

  test('open menus, an open detail row, an editor and a dialog', async ({ page }) => {
    await page.goto('/e2e/fixtures/table.html?detail&edit');
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    await page.locator('summary', { hasText: /^Filters$/ }).click();
    await check(page, 'filters menu');
    await page.keyboard.press('Escape');
    await page.locator('summary', { hasText: /^Columns$/ }).click();
    await check(page, 'columns menu');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Details of Ayşe' }).click();
    await expect(page.locator('.adt-detail-content')).toContainText('Order lines');
    await page.getByRole('button', { name: 'Edit Customer: Ali' }).click();
    await check(page, 'detail row and editor');
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto('/e2e/fixtures/table.html?responsive=modal');
    await page.getByRole('button', { name: 'Details of Ali' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await check(page, 'dialog');
  });

  test('the custom element', async ({ page }) => {
    await page.goto('/e2e/fixtures/element.html');
    await expect(page.locator('body[data-ready=true]')).toBeAttached();
    await check(page, '<acun-datatable>');
  });

  for (const scenario of ['server', 'columns', 'edit', 'virtual', 'frameworks', 'mobile']) {
    test(`the live demo: #/${scenario}`, async ({ page }) => {
      test.skip(!existsSync('site/demo/acun-datatable.min.js'), 'npm run demo first');
      await page.goto(`/site/demo/index.html#/${scenario}`);
      const table = scenario === 'mobile' ? page.frameLocator('iframe[data-phone]').locator('.adt-info') : page.locator(`#${scenario} .adt-info`);
      await expect(table).not.toHaveText('');
      await expect(page.locator(`#${scenario} .adt-skeleton`)).toHaveCount(0);
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(violation => `${violation.id}: ${violation.help} (${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(', ')})`)).toEqual([]);
    });
  }

  for (const route of ['home', 'laravel', 'nextjs', 'webcomponent', 'server', 'bigdata', 'api', 'performance', 'security', 'upgrade', 'faq']) {
    test(`the docs site: #/${route}`, async ({ page }) => {
      if (route === 'server') await page.emulateMedia({ colorScheme: 'dark' }); // one page in dark mode too
      await page.goto(`/site/index.html#/${route}`);
      await expect(page.locator('#content h1')).toBeVisible();
      const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
      expect(result.violations.map(violation => `${violation.id}: ${violation.help} (${violation.nodes.slice(0, 3).map(node => node.target.join(' ')).join(', ')})`)).toEqual([]);
    });
  }
});
