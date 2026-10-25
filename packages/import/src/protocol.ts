/**
 * The import protocol `acun-import/1` (see PROTOCOL.md): its types, readers
 * that check a back end's answers before the UI trusts them, and the mapping
 * check every back end must run on start.
 */

export const IMPORT_PROTOCOL = 'acun-import/1';

export type ImportMode = 'insert' | 'update' | 'upsert';
export type ImportStatus = 'mapping' | 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'expired';

export const IMPORT_MODES: readonly ImportMode[] = Object.freeze(['insert', 'update', 'upsert']);
export const IMPORT_STATUSES: readonly ImportStatus[] = Object.freeze(['mapping', 'queued', 'running', 'done', 'failed', 'cancelled', 'expired']);
/** Statuses after which nothing changes any more. */
export const FINAL_STATUSES: readonly ImportStatus[] = Object.freeze(['done', 'failed', 'cancelled', 'expired']);

/** `GET {url}`: hints for the UI. The back end enforces its limits itself. */
export interface ImportCapabilities {
  readonly protocol: typeof IMPORT_PROTOCOL;
  readonly accept?: readonly string[];
  readonly maxBytes?: number;
  readonly maxRows?: number;
  readonly modes?: readonly ImportMode[];
  readonly templateUrl?: string;
}

/** A column the file can be mapped to. */
export interface ImportColumn {
  readonly id: string;
  readonly title?: string;
  readonly type?: string;
  readonly required?: boolean;
}

export interface ImportPreviewRow {
  /** Line in the file (the header is line 1). */
  readonly line: number;
  /** One cell per header, as text. */
  readonly cells: readonly (string | null)[];
}

export interface ImportRowError {
  readonly line: number;
  readonly column?: string;
  readonly value?: string;
  readonly code?: string;
  readonly message: string;
}

/** An import as the back end reports it (upload answer, start answer, state). */
export interface ImportState {
  readonly protocol?: typeof IMPORT_PROTOCOL;
  readonly id: string;
  readonly status: ImportStatus;
  readonly file?: { readonly name?: string; readonly rows?: number };
  readonly headers?: readonly string[];
  readonly columns?: readonly ImportColumn[];
  readonly mapping?: readonly (string | null)[];
  readonly preview?: readonly ImportPreviewRow[];
  readonly modes?: readonly ImportMode[];
  readonly mode?: ImportMode;
  readonly processed?: number;
  /** All data rows; `null` while not known. */
  readonly total?: number | null;
  readonly inserted: number;
  readonly updated: number;
  readonly skipped: number;
  readonly failed: number;
  readonly errors: readonly ImportRowError[];
  readonly errorsTruncated: boolean;
  readonly errorReport: string | null;
  readonly message?: string;
  readonly cancellable: boolean;
  readonly retryAfter?: number;
  readonly expiresAt?: string;
}

/** `POST {url}/{id}/start`. */
export interface ImportStartRequest {
  /** One entry per header, by position: a column ID or `null` (left out). */
  readonly mapping: readonly (string | null)[];
  readonly mode?: ImportMode;
}

/** A refused request: its HTTP status, a text to show, and texts by field. */
export interface ImportProblem {
  readonly status: number;
  readonly message: string;
  readonly errors: Readonly<Record<string, readonly string[]>>;
}

/** An answer that does not follow the protocol; `path` points at the field. */
export class ImportProtocolError extends Error {
  readonly path: string;
  constructor(message: string, path: string) {
    super(`${path ? `${path}: ` : ''}${message}`);
    this.name = 'ImportProtocolError';
    this.path = path;
  }
}

const ID = /^[A-Za-z0-9._~-]{1,200}$/;

type Json = Record<string, unknown>;
const isObject = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const fail = (path: string, message: string): never => { throw new ImportProtocolError(message, path); };
const object = (value: unknown, path: string): Json => (isObject(value) ? value : fail(path, 'must be an object'));
const text = (value: unknown, path: string): string => (typeof value === 'string' ? value : fail(path, 'must be a string'));
const count = (value: unknown, path: string, min = 0): number =>
  (typeof value === 'number' && Number.isSafeInteger(value) && value >= min ? value : fail(path, `must be a whole number of at least ${min}`));
const list = (value: unknown, path: string): readonly unknown[] => (Array.isArray(value) ? value : fail(path, 'must be a list'));
const optional = <T>(json: Json, key: string, read: (value: unknown, path: string) => T): T | undefined =>
  (json[key] === undefined ? undefined : read(json[key], key));
const mode = (value: unknown, path: string): ImportMode =>
  (IMPORT_MODES.includes(value as ImportMode) ? value as ImportMode : fail(path, `must be one of ${IMPORT_MODES.join(', ')}`));
const modes = (value: unknown, path: string): readonly ImportMode[] => list(value, path).map((item, index) => mode(item, `${path}[${index}]`));
const cell = (value: unknown, path: string): string | null => (value === null ? null : text(value, path));

/** Keep only the fields that are set (no `undefined` values; `exactOptionalPropertyTypes`). */
function defined<T>(value: { readonly [K in keyof T]?: T[K] | undefined }): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}

function protocolOf(value: unknown, path: string): typeof IMPORT_PROTOCOL {
  if (value !== IMPORT_PROTOCOL) fail(path, `must be "${IMPORT_PROTOCOL}"`);
  return IMPORT_PROTOCOL;
}

/**
 * A URL from a back end: an absolute `http(s)` URL or a path, resolved against
 * the import's `{url}`; anything else (`javascript:`, `data:` …) gives `null`.
 */
export function safeImportUrl(value: string, base: string): string | null {
  try {
    const origin = typeof location === 'object' && location?.href ? location.href : 'http://localhost/';
    const resolved = new URL(value, new URL(base.endsWith('/') ? base : `${base}/`, origin));
    return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : null;
  } catch {
    return null;
  }
}

/** Read the capabilities answer (`GET {url}`). */
export function readImportCapabilities(value: unknown): ImportCapabilities {
  const json = object(value, '');
  return defined<ImportCapabilities>({
    protocol: protocolOf(json['protocol'], 'protocol'),
    accept: optional(json, 'accept', (item, path) => list(item, path).map((entry, index) => text(entry, `${path}[${index}]`))),
    maxBytes: optional(json, 'maxBytes', (item, path) => count(item, path, 1)),
    maxRows: optional(json, 'maxRows', (item, path) => count(item, path, 1)),
    modes: optional(json, 'modes', modes),
    templateUrl: optional(json, 'templateUrl', text),
  });
}

/**
 * Read an import (an upload, start, state or cancel answer). Counts default
 * to 0, `errors` to `[]`, `cancellable` to `true`; unknown fields are left
 * out. `requireProtocol` for the upload answer, where it must be present.
 */
export function readImportState(value: unknown, options: { readonly requireProtocol?: boolean } = {}): ImportState {
  const json = object(value, '');
  if (options.requireProtocol || json['protocol'] !== undefined) protocolOf(json['protocol'], 'protocol');
  const id = text(json['id'], 'id');
  if (!ID.test(id)) fail('id', 'must be 1–200 of A–Z a–z 0–9 . _ ~ -');
  const status = json['status'];
  if (!IMPORT_STATUSES.includes(status as ImportStatus)) fail('status', `must be one of ${IMPORT_STATUSES.join(', ')}`);

  const headers = optional(json, 'headers', (item, path) => list(item, path).map((entry, index) => text(entry, `${path}[${index}]`)));
  const columns = optional(json, 'columns', (item, path) => list(item, path).map((entry, index) => {
    const column = object(entry, `${path}[${index}]`);
    const columnId = text(column['id'], `${path}[${index}].id`);
    if (columnId === '') fail(`${path}[${index}].id`, 'must not be empty');
    return defined<ImportColumn>({
      id: columnId,
      title: optional(column, 'title', (v, p) => text(v, `${path}[${index}].${p}`)),
      type: optional(column, 'type', (v, p) => text(v, `${path}[${index}].${p}`)),
      required: optional(column, 'required', (v, p) => (typeof v === 'boolean' ? v : fail(`${path}[${index}].${p}`, 'must be true or false'))),
    });
  }));
  const mapping = optional(json, 'mapping', (item, path) => list(item, path).map((entry, index) => cell(entry, `${path}[${index}]`)));
  const preview = optional(json, 'preview', (item, path) => list(item, path).map((entry, index) => {
    const row = object(entry, `${path}[${index}]`);
    return {
      line: count(row['line'], `${path}[${index}].line`, 1),
      cells: list(row['cells'], `${path}[${index}].cells`).map((c, i) => cell(c, `${path}[${index}].cells[${i}]`)),
    };
  }));

  if (status === 'mapping') {
    if (!headers) fail('headers', 'is required while the status is "mapping"');
    if (!columns) fail('columns', 'is required while the status is "mapping"');
    if (!mapping) fail('mapping', 'is required while the status is "mapping"');
  }
  if (headers && mapping && mapping.length !== headers.length) fail('mapping', 'must have one entry per header');
  if (columns && mapping) {
    const known = new Set(columns.map(column => column.id));
    mapping.forEach((entry, index) => { if (entry !== null && !known.has(entry)) fail(`mapping[${index}]`, `names no column ("${entry}")`); });
  }
  if (headers && preview) {
    preview.forEach((row, index) => { if (row.cells.length !== headers.length) fail(`preview[${index}].cells`, 'must have one cell per header'); });
  }

  const offered = optional(json, 'modes', modes);
  const chosen = optional(json, 'mode', mode);
  if (offered && chosen && !offered.includes(chosen)) fail('mode', 'must be one of "modes"');

  const file = optional(json, 'file', (item, path) => {
    const info = object(item, path);
    return defined<{ readonly name?: string; readonly rows?: number }>({
      name: optional(info, 'name', (v, p) => text(v, `${path}.${p}`)),
      rows: optional(info, 'rows', (v, p) => count(v, `${path}.${p}`)),
    });
  });
  const total = json['total'] === null ? null : optional(json, 'total', count);
  const errorReport = json['errorReport'] === null || json['errorReport'] === undefined ? null : text(json['errorReport'], 'errorReport');
  const expiresAt = optional(json, 'expiresAt', text);
  if (expiresAt !== undefined && Number.isNaN(Date.parse(expiresAt))) fail('expiresAt', 'must be an ISO 8601 date-time');

  return defined<ImportState>({
    protocol: json['protocol'] === undefined ? undefined : IMPORT_PROTOCOL,
    id,
    status: status as ImportStatus,
    file,
    headers,
    columns,
    mapping,
    preview,
    modes: offered,
    mode: chosen,
    processed: optional(json, 'processed', count),
    total,
    inserted: optional(json, 'inserted', count) ?? 0,
    updated: optional(json, 'updated', count) ?? 0,
    skipped: optional(json, 'skipped', count) ?? 0,
    failed: optional(json, 'failed', count) ?? 0,
    errors: optional(json, 'errors', (item, path) => list(item, path).map((entry, index) => {
      const error = object(entry, `${path}[${index}]`);
      return defined<ImportRowError>({
        line: count(error['line'], `${path}[${index}].line`, 1),
        column: optional(error, 'column', (v, p) => text(v, `${path}[${index}].${p}`)),
        value: optional(error, 'value', (v, p) => text(v, `${path}[${index}].${p}`)),
        code: optional(error, 'code', (v, p) => text(v, `${path}[${index}].${p}`)),
        message: text(error['message'], `${path}[${index}].message`),
      });
    })) ?? [],
    errorsTruncated: optional(json, 'errorsTruncated', (v, p) => (typeof v === 'boolean' ? v : fail(p, 'must be true or false'))) ?? false,
    errorReport,
    message: optional(json, 'message', text),
    cancellable: optional(json, 'cancellable', (v, p) => (typeof v === 'boolean' ? v : fail(p, 'must be true or false'))) ?? true,
    retryAfter: optional(json, 'retryAfter', count),
    expiresAt,
  });
}

/**
 * Read a refused answer: `{ message, errors? }`. Anything else still gives a
 * problem, with a general message, so the UI always has a text to show.
 */
export function readImportProblem(status: number, value: unknown, fallback = `The request failed (HTTP ${status}).`): ImportProblem {
  if (!isObject(value)) return { status, message: fallback, errors: {} };
  const errors: Record<string, readonly string[]> = {};
  if (isObject(value['errors'])) {
    for (const [field, entry] of Object.entries(value['errors'])) {
      const texts = (Array.isArray(entry) ? entry : [entry]).filter((item): item is string => typeof item === 'string');
      if (texts.length > 0) errors[field] = texts;
    }
  }
  const first = Object.values(errors)[0]?.[0];
  return { status, message: typeof value['message'] === 'string' && value['message'] !== '' ? value['message'] : first ?? fallback, errors };
}

/**
 * The check a back end runs on `POST {url}/{id}/start` (never trusting the
 * UI): the mapping has one entry per header, names known columns at most
 * once, covers every required column, and the mode is offered. Returns
 * problems by field (`mapping`, `mode`); empty when the request is fine.
 */
export function checkImportStart(
  request: unknown, against: { readonly headers: readonly string[]; readonly columns: readonly ImportColumn[]; readonly modes?: readonly ImportMode[] },
): Record<string, string> {
  const problems: Record<string, string> = {};
  if (!isObject(request) || !Array.isArray(request['mapping'])) return { mapping: 'The mapping is missing.' };
  const mapping = request['mapping'] as unknown[];
  const known = new Map(against.columns.map(column => [column.id, column]));
  if (mapping.length !== against.headers.length) {
    problems['mapping'] = `The mapping needs one entry per file column (${against.headers.length}).`;
  } else {
    const seen = new Set<string>();
    for (const entry of mapping) {
      if (entry === null) continue;
      if (typeof entry !== 'string' || !known.has(entry)) { problems['mapping'] = `Unknown column: ${String(entry)}.`; break; }
      if (seen.has(entry)) { problems['mapping'] = `A column is mapped twice: ${known.get(entry)?.title ?? entry}.`; break; }
      seen.add(entry);
    }
    if (!problems['mapping']) {
      const missing = against.columns.filter(column => column.required && !seen.has(column.id));
      if (missing.length > 0) problems['mapping'] = `Required columns are not mapped: ${missing.map(column => column.title ?? column.id).join(', ')}.`;
    }
  }
  const offered = against.modes && against.modes.length > 0 ? against.modes : undefined;
  const chosen = request['mode'];
  if (chosen === undefined) {
    if (offered && offered.length > 1) problems['mode'] = `Choose a mode: ${offered.join(', ')}.`;
  } else if (!IMPORT_MODES.includes(chosen as ImportMode) || (offered && !offered.includes(chosen as ImportMode))) {
    problems['mode'] = `This mode is not offered: ${String(chosen)}.`;
  }
  return problems;
}
