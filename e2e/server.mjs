// Minimal static server for the Playwright fixtures (no dependency).
// Serves the repository root on 127.0.0.1 only, GET/HEAD only, and refuses
// any path outside the repository. One fake JSON API, POST /e2e/api/products,
// answers server-side queries in the datatable-http wire format; /e2e/api/orders
// is a real back end with @acunsoft/datatable-server (orders-api.mjs).
import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ordersApi } from './orders-api.mjs';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT ?? 4173);
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
};

const categories = ['Kırtasiye', 'Elektronik', 'Mutfak', 'Bahçe'];
const products = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1,
  name: `${['Kalem', 'Defter', 'Kulaklık', 'Tava', 'Hortum', 'Lamba'][i % 6]} ${i + 1}`,
  category: categories[i % 4],
  price: ((i * 37) % 900) + 10,
}));

function productsApi(request, response) {
  let body = '';
  request.on('data', chunk => { body += chunk; });
  request.on('end', () => {
    if (request.headers['x-csrf-token'] !== 'e2e-token') {
      response.writeHead(419, { 'Content-Type': 'application/json' }).end('{"message":"CSRF token mismatch."}');
      return;
    }
    const query = new URLSearchParams(body);
    const page = Math.max(1, Number(query.get('page') ?? 1));
    const size = Math.min(100, Math.max(1, Number(query.get('pageSize') ?? 25)));
    const search = (query.get('search') ?? '').toLocaleLowerCase('tr');
    let rows = products.filter(row => search === '' || `${row.name} ${row.category}`.toLocaleLowerCase('tr').includes(search));
    const [field, direction] = (query.get('sort') ?? '').split(',')[0].split(':');
    if (field && field in products[0]) {
      rows = [...rows].sort((a, b) => (a[field] < b[field] ? -1 : a[field] > b[field] ? 1 : 0) * (direction === 'desc' ? -1 : 1));
    }
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
      .end(JSON.stringify({ rows: rows.slice((page - 1) * size, page * size), totalRows: rows.length }));
  });
}

createServer((request, response) => {
  if (request.method === 'POST' && request.url === '/e2e/api/products') {
    productsApi(request, response);
    return;
  }
  // /e2e/api/orders counts every match; /e2e/api/orders-limited counts up to 100.
  const api = /^\/e2e\/api\/(orders|orders-limited)(\?|$)/.exec(request.url ?? '');
  if (api) {
    const options = api[1] === 'orders-limited' ? { countUpTo: 100 } : {};
    const answer = ({ status, body }) => response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }).end(JSON.stringify(body));
    if (request.method === 'GET') {
      answer(ordersApi(new URL(request.url, 'http://localhost').searchParams, options));
      return;
    }
    let body = '';
    request.on('data', chunk => { body += chunk; });
    request.on('end', () => answer(ordersApi(new URLSearchParams(body), options)));
    return;
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end();
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  } catch {
    response.writeHead(400).end();
    return;
  }
  const file = resolve(join(root, pathname));
  if (file !== root && !file.startsWith(root + sep)) {
    response.writeHead(403).end();
    return;
  }
  let stats;
  try {
    stats = statSync(file);
  } catch {
    stats = undefined;
  }
  const type = types[extname(file)];
  if (!stats?.isFile() || !type) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  if (request.method === 'HEAD') response.end();
  else createReadStream(file).pipe(response);
}).listen(port, '127.0.0.1', () => {
  console.log(`e2e server on http://127.0.0.1:${port}`);
});
