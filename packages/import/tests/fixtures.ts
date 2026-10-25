import { parseCsv, readXlsx, toXlsx, type SheetCell } from '@acunsoft/datatable-export';
import { createMemoryImportBackend, type MemoryImportBackendOptions, type ReadFileResult } from '../src/testing';
import type { ImportColumn } from '../src/protocol';

/** A back end's reader built from the export package: CSV or xlsx to text cells. */
export async function readFile(file: { readonly name: string; readonly bytes: Uint8Array }): Promise<ReadFileResult> {
  const sheet = /\.xlsx$/i.test(file.name) ? await readXlsx(file.bytes) : parseCsv(new TextDecoder().decode(file.bytes));
  const text = (cell: SheetCell): string | null => (cell === null ? null
    : cell instanceof Date ? cell.toISOString()
      : typeof cell === 'object' ? cell.text
        : String(cell));
  return { headers: sheet.headers, rows: sheet.rows.map(row => row.map(text)) };
}

export const columns: readonly ImportColumn[] = [
  { id: 'email', title: 'E-mail', type: 'text', required: true },
  { id: 'name', title: 'Name' },
  { id: 'total', title: 'Total', type: 'decimal' },
];

export const URL_BASE = 'http://test.local/api/orders/import';

export const csv = (lines: readonly string[], name = 'orders.csv'): File => new File([lines.join('\n')], name, { type: 'text/csv' });

export const orders = (count: number, bad: readonly number[] = []): File => csv([
  'E-posta,Ad,Tutar,Not',
  ...Array.from({ length: count }, (_, i) => `${bad.includes(i) ? '' : `user${i}@example.com`},User ${i},${bad.includes(i + 1000) ? 'x' : `${i}.50`},`),
]);

export const xlsxFile = (): File => new File([toXlsx({ headers: ['E-mail', 'Name', 'Total'], rows: [['a@example.com', 'Ayşe', 10], ['b@example.com', 'Ali', 20]] }) as BlobPart], 'orders.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

export const backend = (options: Partial<MemoryImportBackendOptions> = {}) => createMemoryImportBackend({
  url: '/api/orders/import', columns, read: readFile, key: 'email',
  limits: { maxBytes: 1024 * 1024, maxRows: 5000, accept: ['.csv', '.xlsx'] }, ...options,
});

export const instant = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));
