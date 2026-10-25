import { existsSync } from 'node:fs';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// The import dialog (@acunsoft/datatable-import, <script> build) against a back end that
// speaks acun-import/1 over real HTTP (e2e/import-api.mjs, the in-memory reference back end).
test.skip(!existsSync('packages/import/dist/acun-datatable-import.min.js'), 'npm run build first');

const csv = (rows: number, bad: readonly number[] = []): { name: string; mimeType: string; buffer: Buffer } => ({
  name: 'orders.csv', mimeType: 'text/csv',
  buffer: Buffer.from(['E-mail,Name,Total,Note', ...Array.from({ length: rows }, (_, i) => `${bad.includes(i) ? '' : `u${i}@example.com`},User ${i},${i}.50,`)].join('\n')),
});

// The built test kit (as published), typed from its source: `npm run check` runs before the build.
const importKit = (): Promise<typeof import('../packages/import/src/testing')> => {
  const built = '../packages/import/dist/testing.js';
  return import(built);
};

let user = '';
const open = async (page: Page, query = '', texts = { tools: 'Tools', item: 'Import…', title: 'Import' }) => {
  // Each test is its own user (the back end keeps imports and records per user), so parallel tests do not mix.
  user = `e2e-${Math.random().toString(36).slice(2)}`;
  const mine = user;
  await page.route(/\/e2e\/api\/(node-)?import/, (route, request) => route.continue({ headers: { ...request.headers(), 'x-user': mine } }));
  await page.goto(`/e2e/fixtures/import.html${query}`);
  await expect(page.locator('body[data-ready=true]')).toBeAttached();
  await page.locator('summary', { hasText: texts.tools }).click();
  await page.getByRole('button', { name: texts.item }).click();
  const dialog = page.getByRole('dialog', { name: texts.title });
  await expect(dialog).toBeVisible();
  return dialog;
};

test('choose a file, match the columns, import at once; the table refreshes', async ({ page }) => {
  const dialog = await open(page);
  await expect(dialog.locator('.adt-import-hint')).toHaveText('Accepted: .csv, .xlsx · Up to 64 KB · up to 2,000 rows');
  await dialog.locator('input[type=file]').setInputFiles(csv(3));
  await expect(dialog.getByRole('heading', { name: 'Match the columns' })).toBeFocused();
  await expect(dialog.getByRole('combobox', { name: 'E-mail: Imported as' })).toHaveValue('email'); // suggested by the back end
  await expect(dialog.getByRole('combobox', { name: 'Note: Imported as' })).toHaveValue('');
  await expect(dialog.getByRole('combobox', { name: 'Rows that already exist' })).toHaveValue('upsert');
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Import finished' })).toBeVisible();
  await expect(dialog.locator('.adt-import-counts dd')).toHaveText(['3', '0', '0', '0']);
  await dialog.getByRole('button', { name: 'Close', exact: true }).last().click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('#records .adt-info')).toHaveText('Showing 1 to 3 of 3 rows');
  await expect(page.locator('#records tbody')).toContainText('u2@example.com');
});

test('a large file runs in the background: progress, refused rows, the error report', async ({ page }) => {
  const dialog = await open(page);
  await dialog.locator('input[type=file]').setInputFiles(csv(60, [7, 30]));
  await dialog.getByRole('button', { name: 'Import', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'Importing…' })).toBeVisible();
  await expect(dialog.locator('progress')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Import finished' })).toBeVisible({ timeout: 15_000 });
  await expect(dialog.locator('.adt-import-counts dd')).toHaveText(['58', '0', '0', '2']);
  await expect(dialog.locator('.adt-import-problems li').first()).toHaveText('Line 9 · email: E-mail is required.');
  // A click downloads it through the client (its headers), not by following the link.
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('link', { name: 'Download the error report (CSV)' }).click()]);
  expect(download.suggestedFilename()).toBe('import-errors.csv');
  const text = (await import('node:fs')).readFileSync((await download.path())!, 'utf8');
  expect(text.split(/\r?\n/)[0]).toBe('line,column,value,message');
  expect(text).toContain('E-mail is required.');
  await expect(page.locator('#records .adt-info')).toHaveText('Showing 1 to 25 of 58 rows'); // refreshed behind the dialog
});

test('drop a file; the back end refusal shows as text; Escape closes and discards', async ({ page }) => {
  const dialog = await open(page);
  // Drag and drop: a DataTransfer with the file, dropped on the zone.
  await dialog.locator('.adt-import-drop').evaluate(zone => {
    const transfer = new DataTransfer();
    transfer.items.add(new File(['E-mail,Name\na@example.com,Ayşe'], 'dropped.csv', { type: 'text/csv' }));
    zone.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
  });
  await expect(dialog.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Choose another file' }).click();

  // Larger than the hint: the user is told, may go on, and the back end refuses it.
  await dialog.locator('input[type=file]').setInputFiles({ name: 'big.csv', mimeType: 'text/csv', buffer: Buffer.alloc(70 * 1024, 'a') });
  await expect(dialog.getByRole('alert')).toContainText('This file is larger than 64 KB; the server may refuse it.');
  await dialog.getByRole('button', { name: 'Upload anyway' }).click();
  await expect(dialog.getByRole('alert')).toHaveText(/The file is larger than 65536 bytes\./);

  await dialog.locator('input[type=file]').setInputFiles(csv(2));
  await expect(dialog.getByRole('heading', { name: 'Match the columns' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#records .adt-info')).toHaveText('No rows to show'); // nothing imported
});

test('accessible in every step, in the table language, and full screen on phones', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'axe once is enough');
  const check = async (what: string) => {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).include('dialog').analyze();
    expect(result.violations.map(violation => `${violation.id}: ${violation.nodes.map(node => node.target.join(' ')).join(', ')}`), what).toEqual([]);
  };
  await page.setViewportSize({ width: 375, height: 760 });
  await page.emulateMedia({ colorScheme: 'dark' });
  const dialog = await open(page, '?lang=tr&dark', { tools: 'Araçlar', item: 'İçe aktar…', title: 'İçe aktar' });
  const box = (await dialog.boundingBox())!;
  expect([Math.round(box.width), Math.round(box.height)]).toEqual([375, 760]);
  await check('file');
  await dialog.locator('input[type=file]').setInputFiles(csv(2));
  await expect(dialog.getByRole('heading', { name: 'Sütunları eşleştirin' })).toBeVisible();
  await check('mapping');
  await dialog.getByRole('button', { name: 'İçe aktar', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'İçe aktarma tamamlandı' })).toBeVisible();
  await check('result');
});

test('the back end passes the conformance run over real HTTP', async ({ baseURL }) => {
  // The test kit checks any back end; here the reference one behind the e2e server.
  const { runImportConformance } = await importKit();
  const result = await runImportConformance({
    url: `${baseURL}/e2e/api/import`,
    headers: { 'X-User': 'conformance' },
    file: new File(['E-mail,Name,Total\nc1@example.com,Can,1\n,Missing,2\n'], 'orders.csv', { type: 'text/csv' }),
  });
  expect(result.checks.filter(check => !check.ok)).toEqual([]);
  expect(result.ok).toBe(true);
});

test.describe('the Node helper of @acunsoft/datatable-server (createImportHandler over SQLite)', () => {
  test('passes the conformance run over real HTTP', async ({ baseURL }) => {
    const { runImportConformance } = await importKit();
    const result = await runImportConformance({
      url: `${baseURL}/e2e/api/node-import`, headers: { 'X-User': `conformance-${Math.random()}` },
      file: new File(['E-mail,Name,Total\nn1@example.com,Nur,1\n,Missing,2\n'], 'orders.csv', { type: 'text/csv' }),
    });
    expect(result.checks.filter(check => !check.ok)).toEqual([]);
  });

  test('the dialog imports through it, in the background for a larger file; the table refreshes', async ({ page }) => {
    const dialog = await open(page, '?backend=node');
    await expect(dialog.locator('.adt-import-hint')).toHaveText('Accepted: .xlsx, .csv · Up to 64 KB · up to 2,000 rows');
    await dialog.locator('input[type=file]').setInputFiles(csv(45, [3]));
    await expect(dialog.getByRole('combobox', { name: 'E-mail: Imported as' })).toHaveValue('email');
    await dialog.getByRole('button', { name: 'Import', exact: true }).click();
    await expect(dialog.getByRole('heading', { name: 'Import finished' })).toBeVisible({ timeout: 15_000 });
    await expect(dialog.locator('.adt-import-counts dd')).toHaveText(['44', '0', '0', '1']);
    await expect(page.locator('#records .adt-info')).toHaveText('Showing 1 to 25 of 44 rows');
  });
});
