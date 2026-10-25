/**
 * Test kit for the import protocol: a small in-memory back end (to try the UI
 * or test a client without a server) and a conformance run that checks any
 * back end against PROTOCOL.md.
 */
import { createImportClient, importKey, ImportRequestError, type ImportFile } from './client';
import {
  checkImportStart, FINAL_STATUSES, IMPORT_PROTOCOL, readImportCapabilities, readImportState,
  type ImportCapabilities, type ImportColumn, type ImportMode, type ImportRowError, type ImportState,
} from './protocol';

// ---------------------------------------------------------------------------
// In-memory back end

/** What the back end's reader gives: the header row and the data rows, as text. */
export interface ReadFileResult {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly (string | null)[])[];
}

export interface MemoryImportBackendOptions {
  /** The path it answers under, e.g. `/api/orders/import`. */
  readonly url: string;
  readonly columns: readonly ImportColumn[];
  /** Read an uploaded file (CSV, xlsx …) into text cells; throw to refuse it. */
  readonly read: (file: { readonly name: string; readonly type: string; readonly bytes: Uint8Array }) => Promise<ReadFileResult>;
  /** The column whose value finds an existing record (insert or update). */
  readonly key?: string;
  /** Offered modes. Default: `['insert', 'upsert']` with a `key`, else `['insert']`. */
  readonly modes?: readonly ImportMode[];
  /** Its own limits, always enforced. */
  readonly limits?: { readonly maxBytes?: number; readonly maxRows?: number; readonly accept?: readonly string[] };
  /** Answer `GET {url}` with the limits. Default `true`. */
  readonly capabilities?: boolean;
  /** Work in the background (`queued` → `running`) for this many data rows or more. Default 50. */
  readonly backgroundFrom?: number;
  /** Rows per step in the background. Default 10. */
  readonly chunk?: number;
  /** Pause between background steps, in ms (to watch the progress). Default 0. */
  readonly stepMs?: number;
  /** Who is asking; imports belong to them. Default: the `X-User` header, else `guest`. */
  readonly user?: (request: Request) => string;
  /** Extra check of one row: a message refuses it. */
  readonly validate?: (values: Readonly<Record<string, string | null>>, line: number) => string | null;
}

export interface MemoryImportBackend {
  /** Answer one request (`Request` → `Response`), for any server or a test. */
  handle(request: Request): Promise<Response>;
  /** `handle` as a `fetch`, to give to `createImportClient({ fetch })`. */
  readonly fetch: typeof fetch;
  /** The stored records by key (or by a running number without a key). */
  readonly records: Map<string, Readonly<Record<string, string | null>>>;
}

interface Stored {
  readonly id: string;
  readonly user: string;
  readonly name: string;
  readonly headers: readonly string[];
  readonly rows: readonly (readonly (string | null)[])[];
  status: ImportState['status'];
  mapping: readonly (string | null)[];
  mode?: ImportMode;
  next: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  readonly errors: ImportRowError[];
  readonly expiresAt: string;
}

const fold = (value: string): string => value.toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i').replace(/[^a-z0-9]/g, '');
const guard = (value: string): string => (/^[=+\-@\t\r]/.test(value) ? `'${value}` : value);
const csvCell = (value: string): string => (/[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const problem = (status: number, message: string, field?: string): Response =>
  json(status, { message, ...(field ? { errors: { [field]: message } } : {}) });

/**
 * A small back end that keeps imports and records in memory and follows
 * PROTOCOL.md: limits, idempotent uploads, the mapping check, at once or in
 * the background, cancel, an error CSV and per-user imports. For tests and
 * for trying the UI — not for production.
 */
export function createMemoryImportBackend(options: MemoryImportBackendOptions): MemoryImportBackend {
  const prefix = options.url.replace(/\/+$/, '');
  const modes = options.modes ?? (options.key ? ['insert', 'upsert'] as const : ['insert'] as const);
  const imports = new Map<string, Stored>();
  const byKey = new Map<string, string>();
  const records = new Map<string, Readonly<Record<string, string | null>>>();
  let serial = 0;
  const userOf = options.user ?? ((request: Request) => request.headers.get('x-user') ?? 'guest');

  const view = (stored: Stored, extra: Partial<ImportState> = {}): Record<string, unknown> => {
    const base: Record<string, unknown> = {
      protocol: IMPORT_PROTOCOL, id: stored.id, status: stored.status,
      file: { name: stored.name, rows: stored.rows.length },
      inserted: stored.inserted, updated: stored.updated, skipped: stored.skipped, failed: stored.failed,
      processed: stored.next, total: stored.rows.length,
      errors: stored.errors.slice(0, 100), errorsTruncated: stored.errors.length > 100,
      errorReport: FINAL_STATUSES.includes(stored.status) && stored.errors.length > 0 ? `${prefix}/${stored.id}/errors.csv` : null,
      cancellable: stored.status === 'mapping' || stored.status === 'queued' || stored.status === 'running',
      expiresAt: stored.expiresAt,
      ...(stored.status === 'queued' || stored.status === 'running' ? { retryAfter: 250 } : {}),
      ...extra,
    };
    if (stored.status === 'mapping') {
      Object.assign(base, {
        headers: stored.headers, columns: options.columns, mapping: stored.mapping,
        preview: stored.rows.slice(0, 5).map((cells, index) => ({ line: index + 2, cells })),
        modes, mode: modes.includes('upsert') ? 'upsert' : modes[0],
      });
    }
    return base;
  };

  const importRow = (stored: Stored, cells: readonly (string | null)[], line: number): void => {
    const values: Record<string, string | null> = {};
    stored.mapping.forEach((column, index) => { if (column !== null) values[column] = cells[index] ?? null; });
    const reject = (column: string, code: string, message: string): void => {
      stored.failed++;
      stored.errors.push({ line, column, value: values[column] ?? '', code, message });
    };
    for (const column of options.columns) {
      const value = values[column.id];
      if (column.required && (value === null || value === undefined || value.trim() === '')) { reject(column.id, 'required', `${column.title ?? column.id} is required.`); return; }
      if (value && (column.type === 'number' || column.type === 'decimal') && !/^[+-]?\d+([.,]\d+)?$/.test(value.trim())) {
        reject(column.id, 'invalid', `${column.title ?? column.id} is not a number.`); return;
      }
    }
    const extra = options.validate?.(values, line);
    if (extra) { stored.failed++; stored.errors.push({ line, message: extra, code: 'invalid' }); return; }
    const key = options.key && values[options.key] ? `${stored.user}:${values[options.key]}` : undefined;
    const exists = key !== undefined && records.has(key);
    if (stored.mode === 'insert' && exists) { reject(options.key!, 'duplicate', 'A record with this key exists.'); return; }
    if (stored.mode === 'update' && !exists) { stored.skipped++; return; }
    records.set(key ?? `${stored.user}:#${records.size + 1}`, values);
    if (exists) stored.updated++; else stored.inserted++;
  };

  const work = (stored: Stored, all: boolean): void => {
    const end = all ? stored.rows.length : Math.min(stored.rows.length, stored.next + (options.chunk ?? 10));
    for (; stored.next < end; stored.next++) {
      if (stored.status === 'cancelled') return;
      importRow(stored, stored.rows[stored.next]!, stored.next + 2);
    }
    if (stored.next >= stored.rows.length) stored.status = 'done';
  };
  const background = (stored: Stored): void => {
    setTimeout(() => {
      if (stored.status === 'cancelled') return;
      stored.status = 'running';
      work(stored, false);
      if (stored.status === 'running') background(stored);
    }, options.stepMs ?? 0);
  };

  const handle = async (request: Request): Promise<Response> => {
    const url = new URL(request.url, 'http://localhost');
    if (!url.pathname.startsWith(prefix)) return problem(404, 'Not found.');
    const parts = url.pathname.slice(prefix.length).split('/').filter(Boolean).map(decodeURIComponent);
    const user = userOf(request);
    const limits = options.limits ?? {};

    if (parts.length === 0 && request.method === 'GET') {
      if (options.capabilities === false) return problem(404, 'Not found.');
      return json(200, { protocol: IMPORT_PROTOCOL, ...limits, modes });
    }
    if (parts.length === 0 && request.method === 'POST') {
      const idempotency = request.headers.get('idempotency-key');
      const known = idempotency ? byKey.get(`${user}:${idempotency}`) : undefined;
      if (known && imports.get(known)) return json(200, view(imports.get(known)!));
      const form = await request.formData().catch(() => undefined);
      const file = form?.get('file');
      if (!(file instanceof Blob)) return problem(422, 'Choose a file.', 'file');
      const name = (file as File).name ?? 'import';
      if (limits.maxBytes !== undefined && file.size > limits.maxBytes) return problem(413, `The file is larger than ${limits.maxBytes} bytes.`, 'file');
      const extension = /\.[^.]+$/.exec(name)?.[0]?.toLowerCase() ?? '';
      if (limits.accept && !limits.accept.some(type => type.toLowerCase() === extension || type === file.type)) return problem(415, 'This file type is not taken.', 'file');
      let sheet: ReadFileResult;
      try {
        sheet = await options.read({ name, type: file.type, bytes: new Uint8Array(await file.arrayBuffer()) });
      } catch (error) {
        return problem(422, error instanceof Error ? error.message : 'The file cannot be read.', 'file');
      }
      if (sheet.headers.length === 0) return problem(422, 'The file has no header row.', 'file');
      if (limits.maxRows !== undefined && sheet.rows.length > limits.maxRows) return problem(422, `The file has more than ${limits.maxRows} rows.`, 'file');
      const used = new Set<string>();
      const mapping = sheet.headers.map(header => {
        const column = options.columns.find(item => !used.has(item.id) && (fold(item.id) === fold(header) || fold(item.title ?? '') === fold(header)));
        if (column) used.add(column.id);
        return column?.id ?? null;
      });
      // An empty cell is no value.
      const rows = sheet.rows.map(cells => sheet.headers.map((_, index) => (cells[index] === undefined || cells[index] === '' ? null : cells[index]!)));
      const stored: Stored = {
        id: `imp_${++serial}_${importKey().slice(0, 8)}`, user, name, headers: sheet.headers, rows, status: 'mapping', mapping,
        next: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [], expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      };
      imports.set(stored.id, stored);
      if (idempotency) byKey.set(`${user}:${idempotency}`, stored.id);
      return json(201, view(stored));
    }

    const stored = imports.get(parts[0] ?? '');
    if (!stored || stored.user !== user) return problem(404, 'This import does not exist.');
    if (parts.length === 1 && request.method === 'GET') return json(200, view(stored));
    if (parts.length === 1 && request.method === 'DELETE') {
      if (FINAL_STATUSES.includes(stored.status)) return problem(409, 'This import has finished.');
      stored.status = 'cancelled';
      return json(200, view(stored));
    }
    if (parts.length === 2 && parts[1] === 'start' && request.method === 'POST') {
      if (stored.status !== 'mapping') return problem(409, 'This import has already started.');
      const body: unknown = await request.json().catch(() => undefined);
      const problems = checkImportStart(body, { headers: stored.headers, columns: options.columns, modes });
      if (Object.keys(problems).length > 0) return json(422, { message: Object.values(problems)[0], errors: problems });
      const start = body as { mapping: (string | null)[]; mode?: ImportMode };
      stored.mapping = start.mapping;
      stored.mode = start.mode ?? modes[0]!;
      if (stored.rows.length >= (options.backgroundFrom ?? 50)) {
        stored.status = 'queued';
        background(stored);
      } else {
        stored.status = 'running';
        work(stored, true);
      }
      return json(200, view(stored));
    }
    if (parts.length === 2 && parts[1] === 'errors.csv' && request.method === 'GET') {
      const lines = [['line', 'column', 'value', 'message'], ...stored.errors.map(error => [String(error.line), error.column ?? '', error.value ?? '', error.message])];
      return new Response(lines.map(line => line.map(item => csvCell(guard(item))).join(',')).join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8' } });
    }
    return problem(405, 'Not allowed.');
  };

  return { handle, fetch: ((input: RequestInfo | URL, init?: RequestInit) => handle(new Request(new URL(String(input instanceof Request ? input.url : input), 'http://localhost'), init))) as typeof fetch, records };
}

// ---------------------------------------------------------------------------
// Conformance

export interface ConformanceOptions {
  /** The back end's import address (absolute, e.g. `http://localhost:8000/api/orders/import`). */
  readonly url: string;
  readonly fetch?: typeof fetch;
  /** Headers for every request (a session cookie, `Authorization`, a CSRF token). */
  readonly headers?: HeadersInit;
  readonly credentials?: RequestCredentials;
  /** A valid file for this back end. */
  readonly file: ImportFile;
  /** The mapping to start with; default: the back end's suggestion. */
  readonly mapping?: (state: ImportState) => readonly (string | null)[];
  readonly mode?: ImportMode;
  /** How long an import may take. Default 30 s. */
  readonly timeoutMs?: number;
  /** Waiting between state requests (tests make it instant). */
  readonly delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface ConformanceCheck {
  readonly name: string;
  readonly ok: boolean;
  /** Why it failed, or what was skipped. */
  readonly detail?: string;
  readonly skipped?: boolean;
}

export interface ConformanceResult {
  readonly ok: boolean;
  readonly checks: readonly ConformanceCheck[];
}

/**
 * Check a back end against PROTOCOL.md: capabilities, upload, idempotency,
 * the mapping check on start, progress to a final status, a second start, an
 * unknown id, the size limit it advertises, its error report URL and cancel.
 * Every check is listed with why it failed; `ok` when none did.
 */
export async function runImportConformance(options: ConformanceOptions): Promise<ConformanceResult> {
  const checks: ConformanceCheck[] = [];
  const client = createImportClient({
    url: options.url,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.credentials ? { credentials: options.credentials } : {}),
    ...(options.delay ? { delay: options.delay } : {}),
  });
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const check = async (name: string, run: () => Promise<string | void | { skipped: string }>): Promise<void> => {
    try {
      const result = await run();
      if (typeof result === 'object' && result !== null) checks.push({ name, ok: true, skipped: true, detail: result.skipped });
      else checks.push({ name, ok: true, ...(result ? { detail: result } : {}) });
    } catch (error) {
      checks.push({ name, ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
  };
  const refused = async (run: () => Promise<unknown>, statuses: readonly number[]): Promise<string> => {
    try {
      await run();
    } catch (error) {
      if (error instanceof ImportRequestError && statuses.includes(error.status)) return `answered ${error.status}`;
      throw error instanceof ImportRequestError ? new Error(`answered ${error.status} instead of ${statuses.join(' or ')}`) : error;
    }
    throw new Error(`was accepted; expected ${statuses.join(' or ')}`);
  };

  let capabilities: ImportCapabilities | null = null;
  await check('capabilities: none (404, 405) or valid', async () => {
    capabilities = await client.capabilities();
    return capabilities ? `maxBytes ${capabilities.maxBytes ?? '—'}, accept ${capabilities.accept?.join(' ') ?? '—'}` : 'none';
  });

  const key = importKey();
  let first: ImportState | undefined;
  await check('upload: answers an import that follows the protocol', async () => {
    first = await client.upload(options.file, { idempotencyKey: key });
    return `status ${first.status}`;
  });
  if (!first) return { ok: false, checks };
  const uploaded: ImportState = first;

  await check('upload: the same Idempotency-Key gives the same import', async () => {
    const again = await client.upload(options.file, { idempotencyKey: key });
    if (again.id !== uploaded.id) throw new Error(`a second import was made (${again.id})`);
  });

  await check('state: an unknown id answers 404', () => refused(() => client.state('acun-conformance-unknown'), [404]));

  if (uploaded.status === 'mapping') {
    const headers = uploaded.headers ?? [];
    const columns = uploaded.columns ?? [];
    await check('start: a mapping of the wrong length is refused (422)', () => refused(() => client.start(uploaded.id, { mapping: [...(uploaded.mapping ?? []), null] }), [422]));
    await check('start: an unknown column is refused (422)', () => refused(() => client.start(uploaded.id, { mapping: headers.map((_, index) => (index === 0 ? 'acun-conformance-unknown' : null)) }), [422]));
    const required = columns.filter(column => column.required);
    if (required.length > 0) {
      await check('start: a missing required column is refused (422)', () => refused(() => client.start(uploaded.id, { mapping: headers.map(() => null) }), [422]));
    } else {
      checks.push({ name: 'start: a missing required column is refused (422)', ok: true, skipped: true, detail: 'no required columns' });
    }
    if (columns.length > 0 && headers.length > 1) {
      await check('start: a column mapped twice is refused (422)', () => refused(() => client.start(uploaded.id, { mapping: headers.map(() => columns[0]!.id) }), [422]));
    }
  }

  let final: ImportState | undefined;
  await check('start and progress: reaches a final status', async () => {
    let state = uploaded;
    if (state.status === 'mapping') {
      const mode = options.mode ?? state.mode ?? state.modes?.[0];
      state = await client.start(uploaded.id, { mapping: options.mapping?.(state) ?? state.mapping ?? [], ...(mode ? { mode } : {}) });
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`no final status within ${options.timeoutMs ?? 30_000} ms`)), options.timeoutMs ?? 30_000);
    try {
      final = FINAL_STATUSES.includes(state.status) ? state : await client.wait(uploaded.id, { signal: controller.signal, onState: next => {
        if (next.total !== undefined && next.total !== null && next.processed !== undefined && next.processed > next.total) throw new Error('processed is above total');
      } });
    } finally {
      clearTimeout(timer);
    }
    const counted = final.inserted + final.updated + final.skipped + final.failed;
    if (final.total !== undefined && final.total !== null && counted > final.total) throw new Error(`counts (${counted}) are above total (${final.total})`);
    return `${final.status}: ${final.inserted} inserted, ${final.updated} updated, ${final.skipped} skipped, ${final.failed} failed`;
  });

  await check('start: starting again is refused (409)', () => refused(() => client.start(uploaded.id, { mapping: uploaded.mapping ?? [] }), [409]));

  await check('errorReport: absent or a safe http(s) URL', async () => {
    if (!final?.errorReport) return { skipped: 'no error report' };
    const url = client.resolve(final.errorReport);
    if (!url) throw new Error(`not an http(s) URL: ${final.errorReport}`);
    const response = await send(url, { ...(options.headers ? { headers: options.headers } : {}), ...(options.credentials ? { credentials: options.credentials } : {}) });
    if (!response.ok) throw new Error(`answered ${response.status}`);
    const textBody = await response.text();
    if (/(^|[\r\n,])"?[=+@]/.test(textBody)) throw new Error('a cell starts with a formula character');
    return `${textBody.split(/\r?\n/).length} lines`;
  });

  await check('upload: a file over the advertised maxBytes is refused (413)', async () => {
    const max = (capabilities as ImportCapabilities | null)?.maxBytes;
    if (max === undefined || max > 50 * 1024 * 1024) return { skipped: max === undefined ? 'no maxBytes advertised' : 'maxBytes above 50 MB' };
    const big = new Blob([new Uint8Array(max + 1)], { type: options.file.type });
    return refused(() => client.upload(Object.assign(big, { name: options.file.name ?? 'import.csv' })), [413, 422]);
  });

  await check('cancel: discards an import waiting for its mapping (or is not offered)', async () => {
    const second = await client.upload(options.file, { idempotencyKey: importKey() });
    if (second.status !== 'mapping') return { skipped: `upload answered ${second.status}` };
    try {
      const cancelled = await client.cancel(second.id);
      if (cancelled.status !== 'cancelled') throw new Error(`answered status ${cancelled.status}`);
    } catch (error) {
      if (error instanceof ImportRequestError && (error.status === 404 || error.status === 405)) return { skipped: `not offered (${error.status})` };
      throw error;
    }
  });

  return { ok: checks.every(item => item.ok), checks };
}

/** Read helpers re-exported for back-end tests in JavaScript. */
export { readImportCapabilities, readImportState };
