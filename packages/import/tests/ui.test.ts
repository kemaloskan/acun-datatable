// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importButton, ImportRequestError, openImport, type ImportClient, type ImportState } from '../src/index';

HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) { this.setAttribute('open', ''); };
HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) { this.removeAttribute('open'); this.dispatchEvent(new Event('close')); };

const base = { inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [], errorsTruncated: false, errorReport: null, cancellable: true } as const;
const mapping: ImportState = {
  ...base, protocol: 'acun-import/1', id: 'imp_1', status: 'mapping', file: { name: 'orders.csv', rows: 2 },
  headers: ['E-posta', 'Ad', ''], columns: [{ id: 'email', title: 'E-mail', required: true }, { id: 'name', title: 'Name' }],
  mapping: ['email', null, null], preview: [{ line: 2, cells: ['a@b.c', 'Ayşe', null] }], modes: ['insert', 'upsert'], mode: 'upsert',
};
const done: ImportState = { ...base, id: 'imp_1', status: 'done', inserted: 2, failed: 1, total: 3, processed: 3, errors: [{ line: 4, column: 'email', value: 'x@', message: 'Not an e-mail.' }], errorReport: 'imp_1/errors.csv' };

const fakeClient = (overrides: Partial<ImportClient> = {}): ImportClient => ({
  capabilities: vi.fn(async () => ({ protocol: 'acun-import/1' as const, accept: ['.csv', '.xlsx'], maxBytes: 1024, templateUrl: '/template.xlsx' })),
  upload: vi.fn(async () => mapping),
  start: vi.fn(async () => done),
  state: vi.fn(async () => done),
  cancel: vi.fn(async () => ({ ...mapping, status: 'cancelled' as const })),
  wait: vi.fn(async () => done),
  resolve: url => (url.startsWith('javascript:') ? null : new URL(url, 'http://app.test/api/import/').href),
  ...overrides,
});
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const choose = async (dialog: HTMLElement, file = new File(['x'], 'orders.csv', { type: 'text/csv' })) => {
  const input = dialog.querySelector<HTMLInputElement>('input[type=file]')!;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  input.dispatchEvent(new Event('change'));
  await flush();
};

beforeEach(() => document.body.replaceChildren());

describe('openImport', () => {
  it('shows the back end hints, uploads, maps, starts and reports; the table is refreshed', async () => {
    const client = fakeClient();
    const table = { reload: vi.fn() };
    const onDone = vi.fn();
    const { element: dialog, finished } = openImport({ client, table, onDone, language: 'tr' });
    await flush();
    expect(dialog.open).toBe(true);
    expect(dialog.querySelector('.adt-import-hint')!.textContent).toBe('Kabul edilenler: .csv, .xlsx · En çok 1 KB · Şablonu indir');
    expect(dialog.querySelector<HTMLAnchorElement>('.adt-import-hint a')!.href).toBe('http://app.test/template.xlsx');
    expect(dialog.querySelector<HTMLInputElement>('input[type=file]')!.accept).toBe('.csv,.xlsx');

    await choose(dialog);
    expect(client.upload).toHaveBeenCalledOnce();
    expect(dialog.querySelector('[data-step]')?.getAttribute('data-step') ?? dialog.querySelector('.adt-import-body')!.getAttribute('data-step')).toBe('mapping');
    const selects = [...dialog.querySelectorAll<HTMLSelectElement>('.adt-import-mapping select')];
    expect(selects.map(select => select.getAttribute('aria-label'))).toEqual(['E-posta: Aktarılacağı yer', 'Ad: Aktarılacağı yer', '3. sütun (başlıksız): Aktarılacağı yer']);
    expect(selects[0]!.value).toBe('email');
    selects[1]!.value = 'name';
    selects[1]!.dispatchEvent(new Event('change'));
    const mode = dialog.querySelector<HTMLSelectElement>('.adt-import-mode select')!;
    expect([...mode.options].map(option => option.textContent)).toEqual(['Yalnızca yeni kayıt ekle', 'Yenileri ekle, var olanları güncelle']);
    expect(mode.value).toBe('upsert');

    [...dialog.querySelectorAll<HTMLButtonElement>('.adt-import-actions button')].find(button => button.textContent === 'İçe aktar')!.click();
    await flush();
    expect(client.start).toHaveBeenCalledWith('imp_1', { mapping: ['email', 'name', null], mode: 'upsert' }, expect.anything());
    expect(dialog.querySelector('.adt-import-result')!.textContent).toBe('İçe aktarma tamamlandı');
    expect([...dialog.querySelectorAll('.adt-import-counts dd')].map(node => node.textContent)).toEqual(['2', '0', '0', '1']);
    expect(dialog.querySelector('.adt-import-problems li')!.textContent).toBe('4. satır · email · “x@”: Not an e-mail.');
    expect(dialog.querySelector<HTMLAnchorElement>('.adt-import-report')!.href).toBe('http://app.test/api/import/imp_1/errors.csv');
    expect(table.reload).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledWith(done);
    expect(await finished).toEqual(done);
  });

  it('checks the mapping before starting: required columns, a column chosen twice', async () => {
    const client = fakeClient();
    const { element: dialog } = openImport({ client });
    await flush();
    await choose(dialog);
    const selects = [...dialog.querySelectorAll<HTMLSelectElement>('.adt-import-mapping select')];
    const start = [...dialog.querySelectorAll<HTMLButtonElement>('.adt-import-actions button')].find(button => button.textContent === 'Import')!;
    selects[0]!.value = '';
    selects[0]!.dispatchEvent(new Event('change'));
    expect(dialog.querySelector('.adt-import-check')!.textContent).toBe('Match the required columns: E-mail.');
    expect(start.getAttribute('aria-disabled')).toBe('true');
    start.click();
    expect(client.start).not.toHaveBeenCalled();
    selects[0]!.value = 'email';
    selects[0]!.dispatchEvent(new Event('change'));
    selects[1]!.value = 'email';
    selects[1]!.dispatchEvent(new Event('change'));
    expect(dialog.querySelector('.adt-import-check')!.textContent).toBe('E-mail is chosen for more than one column.');
  });

  it('shows the back end refusal of a mapping (422) and of a file (413) as text', async () => {
    const refusal = new ImportRequestError({ status: 422, message: 'Bad mapping.', errors: { mapping: ['<b>Required columns are not mapped.</b>'] } });
    const client = fakeClient({ start: vi.fn(async () => { throw refusal; }) });
    const { element: dialog } = openImport({ client });
    await flush();
    await choose(dialog);
    [...dialog.querySelectorAll<HTMLButtonElement>('.adt-import-actions button')].find(button => button.textContent === 'Import')!.click();
    await flush();
    const alert = dialog.querySelector('[role=alert]')!;
    expect(alert.textContent).toBe('<b>Required columns are not mapped.</b>');
    expect(alert.querySelector('b')).toBeNull(); // text, never HTML

    const tooBig = fakeClient({ upload: vi.fn(async () => { throw new ImportRequestError({ status: 413, message: 'The file is larger than 10 MB.', errors: {} }); }) });
    const second = openImport({ client: tooBig }).element;
    await flush();
    await choose(second);
    expect(second.querySelector('[role=alert]')!.textContent).toBe('The file is larger than 10 MB.');
  });

  it('warns about the back end limits before uploading, but lets the user go on', async () => {
    const client = fakeClient();
    const { element: dialog } = openImport({ client });
    await flush();
    await choose(dialog, new File(['x'.repeat(5000)], 'orders.pdf', { type: 'application/pdf' }));
    expect(client.upload).not.toHaveBeenCalled();
    const alert = dialog.querySelector('[role=alert]')!;
    expect(alert.textContent).toContain('This file is larger than 1 KB; the server may refuse it. The server may not take this type of file.');
    alert.querySelector('button')!.click();
    await flush();
    expect(client.upload).toHaveBeenCalledOnce();
  });

  it('follows a background import, offers cancel, and keeps following after the dialog is closed', async () => {
    let finish!: (state: ImportState) => void;
    const running: ImportState = { ...base, id: 'imp_1', status: 'running', processed: 3, total: 10, inserted: 3, retryAfter: 500 };
    const client = fakeClient({
      start: vi.fn(async () => running),
      wait: vi.fn((_id, options) => { options?.onState?.(running); return new Promise<ImportState>(resolve => { finish = resolve; }); }),
    });
    const table = { reload: vi.fn() };
    const { element: dialog, finished, close } = openImport({ client, table });
    await flush();
    await choose(dialog);
    [...dialog.querySelectorAll<HTMLButtonElement>('.adt-import-actions button')].find(button => button.textContent === 'Import')!.click();
    await flush();
    expect(dialog.querySelector('.adt-import-count')!.textContent).toBe('3 of 10 rows');
    expect(dialog.querySelector<HTMLProgressElement>('progress')!.value).toBe(3);
    expect([...dialog.querySelectorAll('button')].some(button => button.textContent === 'Cancel import')).toBe(true);
    close();
    expect(dialog.isConnected).toBe(false);
    finish(done); // the back end ends it later
    expect(await finished).toEqual(done);
    expect(table.reload).toHaveBeenCalledOnce();
  });

  it('discards an import waiting for its mapping when closed; refuses to open without a url', async () => {
    const client = fakeClient();
    const dialog = openImport({ client });
    await flush();
    await choose(dialog.element);
    dialog.close();
    expect(client.cancel).toHaveBeenCalledWith('imp_1');
    expect(await dialog.finished).toBeNull();
    expect(() => openImport({})).toThrow('openImport needs a url or a client');
  });

  it('importButton is a tools-menu item', () => {
    const item = importButton({ url: '/api/import', language: 'de', group: 'Daten' });
    expect(item).toMatchObject({ id: 'import', label: 'Importieren…', group: 'Daten' });
    expect(importButton({ url: '/x', label: 'Load' }).label).toBe('Load');
  });
});
