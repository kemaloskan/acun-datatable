/**
 * The back end of the import protocol `acun-import/1` (the import dialog of
 * `@acunsoft/datatable-import`) for Node, as a web-standard handler:
 * `(Request) => Promise<Response>` — Next.js route handlers, Hono, Bun and
 * Deno take it as is; Express, Fastify and `node:http` through
 * `toNodeListener()`. Reading files needs `@acunsoft/datatable-export`
 * (an optional peer dependency); saving is your own function. No database
 * driver, framework, queue or Redis is a dependency.
 */
import type { ColumnDef, ColumnType } from '@acunsoft/datatable-core';
import { importRows, parseCsv, readXlsx, type ImportIssue, type Sheet } from '@acunsoft/datatable-export';

export const IMPORT_PROTOCOL = 'acun-import/1';
export type ImportMode = 'insert' | 'update' | 'upsert';
type Status = 'mapping' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired';
const MODES: readonly ImportMode[] = ['insert', 'update', 'upsert'];
const FINAL: readonly Status[] = ['done', 'failed', 'cancelled', 'expired'];

/** A column a file can be mapped to. */
export interface ImportColumn {
  readonly id: string;
  /** The header text it matches and the dialog shows. Default: the ID. */
  readonly title?: string;
  /** How values are read and checked. Default `text`. */
  readonly type?: ColumnType;
  readonly required?: boolean;
  /** More header names it matches (`['E-posta', 'Mail']`). */
  readonly aliases?: readonly string[];
}

/** One valid row: its line in the file and its typed values by column ID. */
export interface ImportRow {
  readonly line: number;
  readonly values: Readonly<Record<string, string | number | boolean | Date | null>>;
}

/** One import while it is saved; `save()` reports what happened through it. */
export interface ImportSaveContext {
  readonly id: string;
  readonly mode: ImportMode;
  /** Who started it, as `owner()` gave it. */
  readonly owner: string;
  /** The tenant `tenant()` gave on upload, or null. */
  readonly tenant: string | null;
  inserted(count?: number): void;
  updated(count?: number): void;
  skipped(count?: number): void;
  /** Refuse one row: counted as failed and listed in the error report. */
  reject(line: number, message: string, column?: string, value?: string): void;
}

/** The state of one import, as a store keeps it (JSON-safe). */
export interface StoredImport {
  readonly id: string;
  readonly owner: string;
  readonly tenant: string | null;
  readonly name: string;
  readonly extension: string;
  readonly headers: readonly string[];
  readonly rows: number;
  readonly preview: readonly { readonly line: number; readonly cells: readonly (string | null)[] }[];
  status: Status;
  mapping: readonly (string | null)[];
  mode: ImportMode | null;
  processed: number;
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  errors: { line: number; column?: string; value?: string; code: string; message: string }[];
  errorsTruncated: boolean;
  report: boolean;
  message: string | null;
  readonly expiresAt: string;
}

/**
 * Where imports, their files and idempotency keys are kept. The default
 * (`memoryImportStore`) is one process; use `directoryImportStore` for
 * several processes on one machine, or your own (a database, S3, Redis …).
 */
export interface ImportStore {
  get(id: string): Promise<StoredImport | undefined>;
  put(state: StoredImport, keepMs: number): Promise<void>;
  putFile(id: string, name: string, bytes: Uint8Array, keepMs: number): Promise<void>;
  getFile(id: string, name: string): Promise<Uint8Array | undefined>;
  deleteFile(id: string, name: string): Promise<void>;
  /** The import an idempotency key already gave, if any. */
  getKey(key: string): Promise<string | undefined>;
  putKey(key: string, id: string, keepMs: number): Promise<void>;
}

/** Texts of refusals (the row checks use `locale`). */
export interface ImportHandlerMessages {
  readonly forbidden: string;
  readonly unauthorized: string;
  readonly notFound: string;
  readonly noFile: string;
  readonly tooLarge: (maxBytes: number) => string;
  readonly fileType: string;
  readonly unreadable: string;
  readonly noHeaders: string;
  readonly tooManyRows: (maxRows: number) => string;
  readonly started: string;
  readonly finished: string;
  readonly mappingLength: (count: number) => string;
  readonly unknownColumn: (column: string) => string;
  readonly mappedTwice: (column: string) => string;
  readonly requiredColumns: (columns: string) => string;
  readonly chooseMode: (modes: string) => string;
  readonly mode: (mode: string) => string;
  readonly failed: string;
}

const englishMessages: ImportHandlerMessages = {
  forbidden: 'You may not import here.',
  unauthorized: 'Sign in to import.',
  notFound: 'This import does not exist or has expired.',
  noFile: 'Choose a file to import.',
  tooLarge: maxBytes => `The file is larger than ${Math.round((maxBytes / 1048576) * 10) / 10} MB.`,
  fileType: 'This type of file cannot be imported.',
  unreadable: 'The file cannot be read.',
  noHeaders: 'The file has no header row.',
  tooManyRows: maxRows => `The file has more than ${maxRows} rows.`,
  started: 'This import has already started.',
  finished: 'This import has finished; it cannot be stopped.',
  mappingLength: count => `The mapping needs one entry per file column (${count}).`,
  unknownColumn: column => `Unknown column: ${column}.`,
  mappedTwice: column => `A column is chosen twice: ${column}.`,
  requiredColumns: columns => `Match the required columns: ${columns}.`,
  chooseMode: modes => `Choose what happens to existing rows: ${modes}.`,
  mode: mode => `This mode is not offered: ${mode}.`,
  failed: 'The import could not be completed.',
};

export interface ImportHandlerOptions {
  /** The path the handler answers under, e.g. `/api/orders/import`. */
  readonly url: string;
  readonly columns: readonly ImportColumn[];
  /** Whether this request may import here; asked on every request. */
  readonly authorize: (request: Request) => boolean | Promise<boolean>;
  /** Who asks (a user ID, a session): imports belong to them. `null` answers 401. */
  readonly owner: (request: Request) => string | null | Promise<string | null>;
  /** The tenant an import belongs to (team, company …), read on upload. */
  readonly tenant?: (request: Request) => string | null | Promise<string | null>;
  /** Save one chunk of valid rows (your database code); report through the context. */
  readonly save: (rows: readonly ImportRow[], context: ImportSaveContext) => void | Promise<void>;
  /** The column whose value finds an existing record; offered modes follow from it. */
  readonly importKey?: string;
  /** Default: `['upsert', 'insert', 'update']` with an `importKey`, else `['insert']`. */
  readonly modes?: readonly ImportMode[];
  /** Its own limits, checked on every upload. Defaults: 10 MB, 100,000 rows, `.xlsx` and `.csv`. */
  readonly limits?: { readonly maxBytes?: number; readonly maxRows?: number; readonly accept?: readonly ('.xlsx' | '.csv')[] };
  /** How long an import (state, files) is kept, in ms. Default a day. */
  readonly keepMs?: number;
  /** Rows per `save()` call. Default 1,000. */
  readonly chunkSize?: number;
  /** `decimalSeparator` (`.` or `,`) and `dateOrder` (`dmy`, `mdy`) of text cells; `locale` of the row messages. */
  readonly read?: { readonly decimalSeparator?: '.' | ','; readonly dateOrder?: 'dmy' | 'mdy'; readonly locale?: string };
  readonly templateUrl?: string;
  /** Default: in memory (one process). */
  readonly store?: ImportStore;
  /** Work in the background for this import (default: never — at once, in the start request). */
  readonly background?: (info: { readonly rows: number }) => boolean;
  /** Hand a background import to your queue or worker; default: later in this process. */
  readonly schedule?: (run: () => Promise<void>, info: { readonly id: string; readonly rows: number }) => void;
  readonly messages?: Partial<ImportHandlerMessages>;
  /** Called with errors that end an import (`failed`), e.g. to log them. */
  readonly onError?: (error: unknown, id: string) => void;
}

export interface ImportHandler {
  /** Answer one request of the protocol; other paths answer 404. */
  handle(request: Request): Promise<Response>;
  /** Run a started import (what `schedule` is given); for your own worker. */
  process(id: string): Promise<void>;
}

const ID = /^imp_[A-Za-z0-9]{32}$/;

/** A store in memory: one process; state and files are lost on restart. */
export function memoryImportStore(): ImportStore {
  const states = new Map<string, { state: StoredImport; until: number }>();
  const files = new Map<string, { bytes: Uint8Array; until: number }>();
  const keys = new Map<string, { id: string; until: number }>();
  const alive = <T extends { until: number }>(map: Map<string, T>, key: string): T | undefined => {
    const entry = map.get(key);
    if (entry && entry.until < Date.now()) { map.delete(key); return undefined; }
    return entry;
  };
  return {
    get: async id => (alive(states, id) ? structuredClone(states.get(id)!.state) : undefined),
    put: async (state, keepMs) => { states.set(state.id, { state: structuredClone(state), until: Date.now() + keepMs }); },
    putFile: async (id, name, bytes, keepMs) => { files.set(`${id}/${name}`, { bytes, until: Date.now() + keepMs }); },
    getFile: async (id, name) => alive(files, `${id}/${name}`)?.bytes,
    deleteFile: async (id, name) => { files.delete(`${id}/${name}`); },
    getKey: async key => alive(keys, key)?.id,
    putKey: async (key, id, keepMs) => { keys.set(key, { id, until: Date.now() + keepMs }); },
  };
}

/**
 * A store in a folder (`node:fs`): state, files and keys survive restarts and
 * are shared by processes on one machine. Expired entries are removed when
 * read; delete old folders from time to time (a cron, `find -mtime +1`).
 */
export function directoryImportStore(directory: string): ImportStore {
  const fs = import('node:fs/promises');
  const safe = (name: string): string => name.replace(/[^A-Za-z0-9._-]/g, '_');
  const path = (...parts: string[]): string => [directory.replace(/\/+$/, ''), ...parts.map(safe)].join('/');
  const write = async (file: string, data: string | Uint8Array): Promise<void> => {
    const { mkdir, writeFile, rename } = await fs;
    await mkdir(file.slice(0, file.lastIndexOf('/')), { recursive: true });
    const temporary = `${file}.${crypto.randomUUID()}.tmp`;
    await writeFile(temporary, data);
    await rename(temporary, file); // whole files only, never half-written
  };
  const readJson = async <T>(file: string): Promise<T | undefined> => {
    try {
      const entry = JSON.parse(await (await fs).readFile(file, 'utf8')) as { until: number; value: T };
      return entry.until >= Date.now() ? entry.value : undefined;
    } catch {
      return undefined;
    }
  };
  return {
    get: id => readJson<StoredImport>(path(id, 'state.json')),
    put: (state, keepMs) => write(path(state.id, 'state.json'), JSON.stringify({ until: Date.now() + keepMs, value: state })),
    putFile: (id, name, bytes) => write(path(id, name), bytes),
    getFile: async (id, name) => {
      try { return new Uint8Array(await (await fs).readFile(path(id, name))); } catch { return undefined; }
    },
    deleteFile: async (id, name) => { await (await fs).rm(path(id, name), { force: true }); },
    getKey: async key => readJson<string>(path('keys', `${await digest(key)}.json`)),
    putKey: async (key, id, keepMs) => write(path('keys', `${await digest(key)}.json`), JSON.stringify({ until: Date.now() + keepMs, value: id })),
  };
}

const digest = async (text: string): Promise<string> =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))), byte => byte.toString(16).padStart(2, '0')).join('');

const randomId = (): string => {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return `imp_${Array.from(bytes, byte => alphabet[byte % alphabet.length]).join('')}`;
};
const fold = (text: string): string => text.trim().toLocaleLowerCase('tr').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ı/g, 'i');
const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const problem = (status: number, message: string, field?: string): Response =>
  json(status, { message, ...(field ? { errors: { [field]: [message] } } : {}) });
const csvCell = (value: string): string => {
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(guarded) ? `"${guarded.replace(/"/g, '""')}"` : guarded;
};
const cellText = (cell: unknown): string | null => {
  if (cell === null || cell === undefined || cell === '') return null;
  if (cell instanceof Date) return Number.isNaN(cell.getTime()) ? null : cell.toISOString().replace('T00:00:00.000Z', '').replace(/\.\d{3}Z$/, 'Z');
  if (typeof cell === 'object' && cell !== null && 'text' in cell) return String((cell as { text: unknown }).text);
  return String(cell);
};

/** Text of a CSV: UTF-8 (a byte order mark removed), else Windows-1254 as Turkish Excel writes it. */
function decode(bytes: Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1254').decode(bytes);
  }
}

/** The import protocol for one kind of record (see PROTOCOL.md of `@acunsoft/datatable-import`). */
export function createImportHandler(options: ImportHandlerOptions): ImportHandler {
  if (typeof options?.url !== 'string' || !options.url.startsWith('/')) throw new TypeError('createImportHandler: url must be a path such as /api/orders/import');
  if (!Array.isArray(options.columns) || options.columns.length === 0) throw new TypeError('createImportHandler: columns are required');
  for (const name of ['authorize', 'owner', 'save'] as const) {
    if (typeof options[name] !== 'function') throw new TypeError(`createImportHandler: ${name} must be a function`);
  }
  const ids = new Set(options.columns.map(column => column.id));
  if (options.importKey !== undefined && !ids.has(options.importKey)) throw new TypeError(`createImportHandler: importKey "${options.importKey}" is not a column`);
  const prefix = options.url.replace(/\/+$/, '');
  const text = { ...englishMessages, ...options.messages };
  const modes = [...(options.modes ?? (options.importKey ? ['upsert', 'insert', 'update'] : ['insert']))].filter(mode => MODES.includes(mode as ImportMode)) as ImportMode[];
  if (modes.length === 0) throw new TypeError('createImportHandler: modes must offer insert, update or upsert');
  const maxBytes = options.limits?.maxBytes ?? 10 * 1024 * 1024;
  const maxRows = options.limits?.maxRows ?? 100_000;
  const accept = options.limits?.accept ?? ['.xlsx', '.csv'];
  const keepMs = options.keepMs ?? 86_400_000;
  const chunkSize = Math.max(1, options.chunkSize ?? 1_000);
  const store = options.store ?? memoryImportStore();
  const cancelled = new Set<string>();
  const definitions = options.columns.map(column => ({ id: column.id, header: column.title ?? column.id, accessorKey: column.id, ...(column.type ? { type: column.type } : {}) })) as unknown as ColumnDef<Record<string, unknown>>[];
  const titles = new Map(options.columns.map(column => [column.id, column.title ?? column.id]));
  const required = options.columns.filter(column => column.required).map(column => column.id);

  const read = async (bytes: Uint8Array, extension: string): Promise<Sheet> => (extension === '.xlsx'
    ? readXlsx(bytes, { maxRows })
    : parseCsv(decode(bytes), { maxRows }));

  const view = (state: StoredImport): Record<string, unknown> => ({
    protocol: IMPORT_PROTOCOL, id: state.id, status: state.status,
    file: { name: state.name, rows: state.rows },
    processed: state.processed, total: state.rows,
    inserted: state.inserted, updated: state.updated, skipped: state.skipped, failed: state.failed,
    errors: state.errors, errorsTruncated: state.errorsTruncated,
    errorReport: state.report && FINAL.includes(state.status) ? `${state.id}/errors.csv` : null,
    cancellable: !FINAL.includes(state.status),
    expiresAt: state.expiresAt,
    ...(state.message ? { message: state.message } : {}),
    ...(state.status === 'queued' || state.status === 'running' ? { retryAfter: 1000 } : {}),
    ...(state.status === 'mapping' ? {
      headers: state.headers,
      columns: options.columns.map(column => ({ id: column.id, title: column.title ?? column.id, type: column.type ?? 'text', ...(column.required ? { required: true } : {}) })),
      mapping: state.mapping, preview: state.preview, modes, mode: modes[0],
    } : state.mode ? { mode: state.mode } : {}),
  });

  const suggest = (headers: readonly string[]): (string | null)[] => {
    const names = new Map<string, string>();
    for (const column of options.columns) {
      for (const name of [column.title ?? column.id, column.id, ...(column.aliases ?? [])]) if (!names.has(fold(name))) names.set(fold(name), column.id);
    }
    const used = new Set<string>();
    return headers.map(header => {
      const id = names.get(fold(header));
      if (!id || used.has(id)) return null;
      used.add(id);
      return id;
    });
  };

  const checkStart = (body: unknown, headers: readonly string[]): Record<string, string> => {
    const problems: Record<string, string> = {};
    const mapping = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['mapping'] : undefined;
    if (!Array.isArray(mapping) || mapping.length !== headers.length) {
      problems['mapping'] = text.mappingLength(headers.length);
    } else {
      const seen = new Set<string>();
      for (const entry of mapping) {
        if (entry === null) continue;
        if (typeof entry !== 'string' || !ids.has(entry)) { problems['mapping'] = text.unknownColumn(String(entry)); break; }
        if (seen.has(entry)) { problems['mapping'] = text.mappedTwice(titles.get(entry) ?? entry); break; }
        seen.add(entry);
      }
      const missing = required.filter(id => !seen.has(id));
      if (!problems['mapping'] && missing.length > 0) problems['mapping'] = text.requiredColumns(missing.map(id => titles.get(id) ?? id).join(', '));
    }
    const mode = typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['mode'] : undefined;
    if (mode === undefined && modes.length > 1) problems['mode'] = text.chooseMode(modes.join(', '));
    else if (mode !== undefined && !modes.includes(mode as ImportMode)) problems['mode'] = text.mode(String(mode));
    return problems;
  };

  const process = async (id: string): Promise<void> => {
    let state = await store.get(id);
    if (!state || (state.status !== 'queued' && state.status !== 'running')) return;
    state.status = 'running';
    await store.put(state, keepMs);
    let inserted = state.inserted;
    let updated = state.updated;
    let skipped = state.skipped;
    let rejected: StoredImport['errors'] = [];
    const context: ImportSaveContext = {
      id, mode: state.mode ?? modes[0]!, owner: state.owner, tenant: state.tenant,
      inserted: (count = 1) => { inserted += count; },
      updated: (count = 1) => { updated += count; },
      skipped: (count = 1) => { skipped += count; },
      reject: (line, message, column, value) => { rejected.push({ line, message, code: 'refused', ...(column ? { column } : {}), ...(value ? { value } : {}) }); },
    };
    const report: string[] = [];
    try {
      const bytes = await store.getFile(id, 'source');
      if (!bytes) throw new Error('The uploaded file is gone.');
      const sheet = await read(bytes, state.extension);
      // The user's mapping as headers the reader knows (column IDs); file columns left out get none.
      const headers = state.mapping.map(column => column ?? '');
      for (let start = 0; start < sheet.rows.length; start += chunkSize) {
        if (cancelled.has(id) || (await store.get(id))?.status === 'cancelled') { cancelled.add(id); break; }
        const rows = sheet.rows.slice(start, start + chunkSize);
        const result = importRows({ headers, rows }, definitions, { required, maxErrors: Number.MAX_SAFE_INTEGER, ...options.read });
        rejected = [];
        await options.save(result.rows.map(row => ({ line: row.line + start, values: row.values })), context);
        const problems = [
          ...result.errors.map((issue: ImportIssue) => ({ line: issue.line + start, ...(issue.column ? { column: issue.column } : {}), ...(issue.value ? { value: issue.value } : {}), code: issue.code, message: issue.message })),
          ...rejected,
        ];
        for (const error of problems) report.push([String(error.line), error.column ? titles.get(error.column) ?? error.column : '', error.value ?? '', error.message].map(csvCell).join(','));
        const fresh = await store.get(id);
        state = fresh ?? state;
        state.processed = Math.min(state.rows, start + rows.length);
        Object.assign(state, { inserted, updated, skipped });
        state.failed += new Set(problems.map(error => error.line)).size;
        const room = Math.max(0, 100 - state.errors.length);
        state.errors.push(...problems.slice(0, room));
        state.errorsTruncated ||= problems.length > room;
        if (state.status !== 'cancelled') state.status = 'running';
        await store.put(state, keepMs);
      }
      state = (await store.get(id)) ?? state;
      state.status = cancelled.has(id) || state.status === 'cancelled' ? 'cancelled' : 'done';
      if (report.length > 0) {
        await store.putFile(id, 'errors.csv', new TextEncoder().encode(['line,column,value,message', ...report].join('\n')), keepMs);
        state.report = true;
      }
    } catch (error) {
      options.onError?.(error, id);
      state.status = 'failed';
      state.message = text.failed;
    }
    await store.deleteFile(id, 'source');
    await store.put(state, keepMs);
  };

  const handle = async (request: Request): Promise<Response> => {
    const path = new URL(request.url).pathname;
    if (path !== prefix && !path.startsWith(`${prefix}/`)) return problem(404, text.notFound);
    const parts = path.slice(prefix.length).split('/').filter(Boolean);
    if (!(await options.authorize(request))) return problem(403, text.forbidden);
    const who = await options.owner(request);
    if (who === null || who === '') return problem(401, text.unauthorized);
    const tenant = (await options.tenant?.(request)) ?? null;
    const owner = `${who}|${tenant ?? ''}`;
    const load = async (id: string): Promise<StoredImport | undefined> => {
      if (!ID.test(id)) return undefined;
      const state = await store.get(id);
      return state && state.owner === owner ? state : undefined;
    };

    if (parts.length === 0 && request.method === 'GET') {
      return json(200, { protocol: IMPORT_PROTOCOL, accept, maxBytes, maxRows, modes, ...(options.templateUrl ? { templateUrl: options.templateUrl } : {}) });
    }
    if (parts.length === 0 && request.method === 'POST') {
      const key = request.headers.get('idempotency-key') ?? '';
      const keyId = /^[\x21-\x7e]{1,200}$/.test(key) ? `${owner}\u0000${key}` : undefined;
      const known = keyId ? await store.getKey(keyId) : undefined;
      const again = known ? await load(known) : undefined;
      if (again) return json(200, view(again));
      // The declared size first, so a huge body is not read at all.
      const declared = Number(request.headers.get('content-length') ?? 0);
      if (declared > maxBytes + 64 * 1024) return problem(413, text.tooLarge(maxBytes), 'file');
      const form = await request.formData().catch(() => undefined);
      const file = form?.get('file');
      if (!(file instanceof Blob)) return problem(422, text.noFile, 'file');
      if (file.size > maxBytes) return problem(413, text.tooLarge(maxBytes), 'file');
      const name = (file as File).name ?? 'import';
      const extension = (/\.[^.]+$/.exec(name)?.[0] ?? '').toLowerCase();
      const bytes = new Uint8Array(await file.arrayBuffer());
      const signature = extension === '.xlsx' ? bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04 : !bytes.subarray(0, 8192).includes(0);
      if (!(accept as readonly string[]).includes(extension) || !signature) return problem(415, text.fileType, 'file');
      let sheet: Sheet;
      try {
        sheet = await read(bytes, extension);
      } catch (error) {
        const message = error instanceof Error && /rows/i.test(error.message) ? text.tooManyRows(maxRows) : text.unreadable;
        return problem(422, message, 'file');
      }
      if (sheet.headers.length === 0) return problem(422, text.noHeaders, 'file');
      if (sheet.rows.length > maxRows) return problem(422, text.tooManyRows(maxRows), 'file');
      const id = randomId();
      await store.putFile(id, 'source', bytes, keepMs);
      const state: StoredImport = {
        id, owner, tenant, name: name.slice(0, 200), extension, headers: sheet.headers.map(String), rows: sheet.rows.length,
        preview: sheet.rows.slice(0, 5).map((cells, index) => ({ line: index + 2, cells: sheet.headers.map((_, i) => cellText(cells[i])) })),
        status: 'mapping', mapping: suggest(sheet.headers), mode: null, processed: 0, inserted: 0, updated: 0, skipped: 0, failed: 0,
        errors: [], errorsTruncated: false, report: false, message: null, expiresAt: new Date(Date.now() + keepMs).toISOString(),
      };
      await store.put(state, keepMs);
      if (keyId) await store.putKey(keyId, id, keepMs);
      return json(201, view(state));
    }

    const state = await load(parts[0] ?? '');
    if (!state) return problem(404, text.notFound);
    if (parts.length === 1 && request.method === 'GET') return json(200, view(state));
    if (parts.length === 1 && request.method === 'DELETE') {
      if (FINAL.includes(state.status)) return problem(409, text.finished);
      cancelled.add(state.id);
      if (state.status === 'mapping') await store.deleteFile(state.id, 'source');
      state.status = 'cancelled';
      await store.put(state, keepMs);
      return json(200, view(state));
    }
    if (parts.length === 2 && parts[1] === 'start' && request.method === 'POST') {
      if (state.status !== 'mapping') return problem(409, text.started);
      const body: unknown = await request.json().catch(() => undefined);
      const problems = checkStart(body, state.headers);
      if (Object.keys(problems).length > 0) return json(422, { message: Object.values(problems)[0], errors: problems });
      const start = body as { mapping: (string | null)[]; mode?: ImportMode };
      state.mapping = start.mapping;
      state.mode = start.mode ?? modes[0]!;
      if (options.background?.({ rows: state.rows })) {
        state.status = 'queued';
        await store.put(state, keepMs);
        const run = () => process(state.id);
        if (options.schedule) options.schedule(run, { id: state.id, rows: state.rows });
        else setTimeout(() => { void run(); }, 0);
        return json(200, view(state));
      }
      state.status = 'running';
      await store.put(state, keepMs);
      await process(state.id);
      return json(200, view((await store.get(state.id)) ?? state));
    }
    if (parts.length === 2 && parts[1] === 'errors.csv' && request.method === 'GET') {
      const report = state.report ? await store.getFile(state.id, 'errors.csv') : undefined;
      if (!report) return problem(404, text.notFound);
      return new Response(report as unknown as BodyInit, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': 'attachment; filename="import-errors.csv"', 'Cache-Control': 'no-store' } });
    }
    return problem(405, 'Not allowed.');
  };

  return { handle, process };
}

/**
 * A `node:http` / Express / Fastify (raw) listener for a web-standard
 * handler: `app.all('/api/orders/import*', toNodeListener(orders.handle))`.
 * The body is streamed, so the size checks run before it is read.
 */
export function toNodeListener(handle: (request: Request) => Promise<Response>) {
  return async (
    request: AsyncIterable<Uint8Array> & { url?: string; originalUrl?: string; method?: string; headers: Record<string, string | string[] | undefined> },
    response: { statusCode: number; setHeader(name: string, value: string): void; end(body?: Uint8Array): void },
  ): Promise<void> => {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
      if (typeof value === 'string') headers.set(name, value);
      else if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
    }
    const method = request.method ?? 'GET';
    const init: RequestInit & { duplex?: 'half' } = { method, headers };
    if (method !== 'GET' && method !== 'HEAD') {
      // ReadableStream.from (Node 20+) streams the request without reading it first.
      init.body = (ReadableStream as unknown as { from(source: AsyncIterable<Uint8Array>): ReadableStream<Uint8Array> }).from(request) as unknown as BodyInit;
      init.duplex = 'half';
    }
    const answer = await handle(new Request(new URL(request.originalUrl ?? request.url ?? '/', `http://${headers.get('host') ?? 'localhost'}`), init));
    response.statusCode = answer.status;
    answer.headers.forEach((value, name) => response.setHeader(name, value));
    response.end(new Uint8Array(await answer.arrayBuffer()));
  };
}
