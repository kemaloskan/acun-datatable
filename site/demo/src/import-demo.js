// The import demo: the import dialog of @acunsoft/datatable-import against the
// in-memory reference back end of its test kit, running in this page (no
// server: the demo is static). A real app points `url` at its own back end —
// Laravel TableImport, Node createImportHandler or any back end that speaks
// acun-import/1 — and leaves out `fetch`. Bundled by scripts/demo-assets.mjs.
import { parseCsv, readXlsx } from '@acunsoft/datatable-export';
import { importButton, openImport } from '@acunsoft/datatable-import';
import { createMemoryImportBackend } from '@acunsoft/datatable-import/testing';

const text = cell => (cell === null ? null : cell instanceof Date ? cell.toISOString().slice(0, 10) : typeof cell === 'object' ? cell.text : String(cell));

/** Mount the demo into `host`; returns a function that removes it. */
window.mountImportDemo = (host, language, T) => {
  const columns = [
    { id: 'email', title: T.col.email, required: true },
    { id: 'name', title: T.col.customer },
    { id: 'city', title: T.col.city },
    { id: 'total', title: T.col.total, type: 'decimal' },
  ];
  // The back end decides everything: limits, formats, at once or in the background.
  const backend = createMemoryImportBackend({
    url: '/demo/orders/import',
    columns,
    key: 'email',
    limits: { maxBytes: 2 * 1024 * 1024, maxRows: 5000, accept: ['.csv', '.xlsx'] },
    backgroundFrom: 200, // larger files run "in the background", so the progress can be seen
    chunk: 40,
    stepMs: 80,
    messages: { required: T.importDemo.required, notNumber: T.importDemo.notNumber, exists: T.importDemo.exists },
    read: async ({ name, bytes }) => {
      const sheet = /\.xlsx$/i.test(name) ? await readXlsx(bytes) : parseCsv(new TextDecoder().decode(bytes));
      return { headers: sheet.headers, rows: sheet.rows.map(row => row.map(text)) };
    },
  });
  [['ayse@example.com', 'Ayşe Yılmaz', 'İstanbul', '1250.50'], ['ali@example.com', 'Ali Kaya', 'Ankara', '90.00'], ['irem@example.com', 'İrem Şahin', 'İzmir', '430.25']]
    .forEach(([email, name, city, total]) => backend.records.set(`guest:${email}`, { email, name, city, total }));
  const rows = () => [...backend.records.values()];

  const tableHost = document.createElement('div');
  const samples = document.createElement('p');
  samples.className = 'adt-toolbar import-samples'; // adt-toolbar carries the table's theme tokens
  host.replaceChildren(samples, tableHost);

  const options = {
    url: '/demo/orders/import', fetch: backend.fetch, language,
    table: { reload: () => table.setData(rows()), get element() { return table.element; } },
  };
  const table = new window.AcunDataTable(tableHost, {
    data: rows(), language, rowId: 'email',
    pagination: { pageSize: 10, pageSizes: [10, 25, 50] },
    columns: [
      { data: 'email', title: T.col.email, priority: 1 },
      { data: 'name', title: T.col.customer, priority: 1 },
      { data: 'city', title: T.col.city },
      { data: 'total', title: T.col.total, type: 'decimal' },
    ],
    buttons: ['excel', importButton(options)],
  });

  // Sample files in the page language (the headers match the columns), with a few mistakes on purpose.
  const names = ['Ayşe Yılmaz', 'Ali Kaya', 'İrem Şahin', 'Çağrı Öztürk', 'Zeynep Doğan', 'Ümit Kılıç', 'Deniz Ak', 'Gülşen Erdoğan'];
  const cities = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya'];
  const sample = count => {
    const lines = [[T.col.email, T.col.customer, T.col.city, T.col.total].join(',')];
    for (let i = 0; i < count; i++) {
      const email = i % 37 === 5 ? '' : i < 2 ? ['ayse@example.com', 'ali@example.com'][i] : `customer${i}@example.com`; // two update existing rows, some miss the e-mail
      const total = i % 23 === 7 ? 'abc' : (((i * 7919) % 100000) / 100).toFixed(2); // some are not numbers
      lines.push([email, names[i % names.length], cities[i % cities.length], total].join(','));
    }
    return URL.createObjectURL(new Blob([`${lines.join('\n')}\n`], { type: 'text/csv' }));
  };
  const links = [[T.importDemo.small, sample(20), 'customers-20.csv'], [T.importDemo.large, sample(600), 'customers-600.csv']];
  samples.append(`${T.importDemo.samples} `);
  links.forEach(([label, href, file], index) => {
    const link = document.createElement('a');
    link.href = href;
    link.download = file;
    link.textContent = label;
    samples.append(...(index > 0 ? [' · '] : []), link);
  });
  const open = document.createElement('button');
  open.type = 'button';
  open.className = 'adt-button adt-button--primary import-open';
  open.textContent = T.importDemo.open;
  open.addEventListener('click', () => openImport(options));
  samples.append(' ', open);

  return () => {
    table.destroy();
    links.forEach(([, href]) => URL.revokeObjectURL(href));
    host.replaceChildren();
  };
};
