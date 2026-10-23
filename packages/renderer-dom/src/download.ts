/**
 * Offer data as a file download, e.g. the output of `toCsv` or `toXlsx` from
 * `@acunsoft/datatable-export`:
 *
 *   downloadFile(toXlsx(tableToSheet(table)), 'orders.xlsx');
 *
 * The type is taken from the extension (`.csv`, `.xlsx`, `.json`, `.txt`)
 * unless given. The object URL is released after the click.
 */
export function downloadFile(data: string | Uint8Array, filename: string, type?: string, doc: Document = document): void {
  if (typeof filename !== 'string' || filename.trim() === '' || /[\\/]/.test(filename)) {
    throw new TypeError('filename must be a plain file name');
  }
  const extension = /\.([a-z0-9]+)$/i.exec(filename)?.[1]?.toLowerCase();
  const mime = type ?? ({
    csv: 'text/csv;charset=utf-8',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    json: 'application/json',
    txt: 'text/plain;charset=utf-8',
  } as Record<string, string>)[extension ?? ''] ?? 'application/octet-stream';
  const view = doc.defaultView;
  if (!view) throw new Error('downloadFile needs a document with a window');
  const blob = new view.Blob([data as BlobPart], { type: mime });
  const url = view.URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';
  doc.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    view.setTimeout(() => view.URL.revokeObjectURL(url), 0);
  }
}
