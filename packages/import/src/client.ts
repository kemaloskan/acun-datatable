import {
  FINAL_STATUSES, readImportCapabilities, readImportProblem, readImportState, safeImportUrl,
  type ImportCapabilities, type ImportProblem, type ImportStartRequest, type ImportState,
} from './protocol';

/** A refused request (4xx, 5xx), with the back end's problem. */
export class ImportRequestError extends Error {
  readonly status: number;
  readonly problem: ImportProblem;
  constructor(problem: ImportProblem) {
    super(problem.message);
    this.name = 'ImportRequestError';
    this.status = problem.status;
    this.problem = problem;
  }
}

/** A file to upload: a browser `File`, or a `Blob` with a name. */
export type ImportFile = Blob & { readonly name?: string };

export interface ImportClientOptions {
  /** The import's address, e.g. `/api/orders/import` (see PROTOCOL.md). */
  readonly url: string;
  /** Headers for every request (a CSRF token, `Authorization`), or a function giving them. */
  readonly headers?: HeadersInit | (() => HeadersInit | Promise<HeadersInit>);
  /** `fetch` credentials. Default `'same-origin'`. */
  readonly credentials?: RequestCredentials;
  /** Your own `fetch` (tests, a wrapper that refreshes tokens). */
  readonly fetch?: typeof fetch;
  /** Waiting between state requests; tests make it instant. */
  readonly delay?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export interface UploadOptions {
  /** One per chosen file; made for you when left out. A retried upload sends the same key. */
  readonly idempotencyKey?: string;
  readonly signal?: AbortSignal;
  /** Bytes sent so far (uses `XMLHttpRequest`, which reports upload progress; not with a custom `fetch`). */
  readonly onProgress?: (sent: number, total: number) => void;
}

export interface PollOptions {
  readonly signal?: AbortSignal;
  /** Every answer while waiting (for the progress bar). */
  readonly onState?: (state: ImportState) => void;
}

export interface ImportClient {
  /** `GET {url}`: the back end's hints, or `null` when it gives none (404, 405). */
  capabilities(signal?: AbortSignal): Promise<ImportCapabilities | null>;
  /** `POST {url}`: upload a file; the answer is usually an import in status `mapping`. */
  upload(file: ImportFile, options?: UploadOptions): Promise<ImportState>;
  /** `POST {url}/{id}/start`. */
  start(id: string, request: ImportStartRequest, signal?: AbortSignal): Promise<ImportState>;
  /** `GET {url}/{id}`. */
  state(id: string, signal?: AbortSignal): Promise<ImportState>;
  /** `DELETE {url}/{id}`. */
  cancel(id: string, signal?: AbortSignal): Promise<ImportState>;
  /** Ask for the state until a final status (`done`, `failed`, `cancelled`, `expired`). */
  wait(id: string, options?: PollOptions): Promise<ImportState>;
  /** A back end URL (`errorReport`, `templateUrl`) made absolute, or `null` when it is not `http(s)`. */
  resolve(url: string): string | null;
}

/** A random key for `Idempotency-Key` (works outside secure contexts too). */
export function importKey(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

const sleep = (ms: number, signal?: AbortSignal): Promise<void> => new Promise((resolve, reject) => {
  if (signal?.aborted) { reject(signal.reason); return; }
  const timer = setTimeout(() => { signal?.removeEventListener('abort', stop); resolve(); }, ms);
  const stop = (): void => { clearTimeout(timer); reject(signal?.reason); };
  signal?.addEventListener('abort', stop, { once: true });
});

/** How long to wait before asking again: the back end's `retryAfter` (250 ms – 60 s), else 1 s, 5 s after a minute. */
export function nextPoll(state: Pick<ImportState, 'retryAfter'>, elapsedMs: number): number {
  if (state.retryAfter !== undefined) return Math.min(60_000, Math.max(250, state.retryAfter));
  return elapsedMs < 60_000 ? 1_000 : 5_000;
}

/** A client of the import protocol (`acun-import/1`) for any back end that speaks it. */
export function createImportClient(options: ImportClientOptions): ImportClient {
  if (typeof options?.url !== 'string' || options.url.trim() === '') throw new TypeError('createImportClient needs a url');
  const base = options.url.replace(/\/+$/, '');
  const send = options.fetch ?? globalThis.fetch.bind(globalThis);
  const wait = options.delay ?? sleep;
  const of = (id: string): string => `${base}/${encodeURIComponent(id)}`;

  const headersFor = async (more?: HeadersInit): Promise<Headers> => {
    const headers = new Headers(typeof options.headers === 'function' ? await options.headers() : options.headers);
    for (const [name, value] of new Headers(more)) headers.set(name, value);
    headers.set('Accept', 'application/json');
    return headers;
  };
  const parse = (status: number, textBody: string): unknown => {
    let body: unknown;
    if (textBody !== '') {
      try { body = JSON.parse(textBody) as unknown; } catch { body = textBody; }
    }
    if (status < 200 || status >= 300) throw new ImportRequestError(readImportProblem(status, body));
    return body;
  };
  const request = async (url: string, init: RequestInit = {}): Promise<unknown> => {
    const response = await send(url, { ...init, headers: await headersFor(init.headers), credentials: options.credentials ?? 'same-origin' });
    return parse(response.status, await response.text());
  };
  // Upload progress needs XMLHttpRequest; fetch does not report it.
  const xhr = async (url: string, body: FormData, more: HeadersInit, signal: AbortSignal | undefined, onProgress: (sent: number, total: number) => void): Promise<unknown> => {
    const headers = await headersFor(more);
    return new Promise((resolve, reject) => {
      const http = new XMLHttpRequest();
      http.open('POST', url);
      headers.forEach((value, name) => http.setRequestHeader(name, value));
      http.withCredentials = options.credentials === 'include';
      http.upload.addEventListener('progress', event => { if (event.lengthComputable) onProgress(event.loaded, event.total); });
      http.addEventListener('load', () => { try { resolve(parse(http.status, http.responseText)); } catch (error) { reject(error); } });
      http.addEventListener('error', () => reject(new TypeError('The upload failed (network).')));
      http.addEventListener('abort', () => reject(signal?.reason ?? new DOMException('Aborted', 'AbortError')));
      signal?.addEventListener('abort', () => http.abort(), { once: true });
      http.send(body);
    });
  };

  const client: ImportClient = {
    async capabilities(signal) {
      try {
        return readImportCapabilities(await request(base, { method: 'GET', ...(signal ? { signal } : {}) }));
      } catch (error) {
        if (error instanceof ImportRequestError && (error.status === 404 || error.status === 405)) return null;
        throw error;
      }
    },
    async upload(file, uploadOptions = {}) {
      const form = new FormData();
      form.append('file', file, file.name ?? 'import');
      const key = { 'Idempotency-Key': uploadOptions.idempotencyKey ?? importKey() };
      const body = uploadOptions.onProgress && !options.fetch && typeof XMLHttpRequest === 'function'
        ? await xhr(base, form, key, uploadOptions.signal, uploadOptions.onProgress)
        : await request(base, { method: 'POST', body: form, headers: key, ...(uploadOptions.signal ? { signal: uploadOptions.signal } : {}) });
      return readImportState(body, { requireProtocol: true });
    },
    async start(id, startRequest, signal) {
      return readImportState(await request(`${of(id)}/start`, {
        method: 'POST', body: JSON.stringify(startRequest), headers: { 'Content-Type': 'application/json' },
        ...(signal ? { signal } : {}),
      }));
    },
    async state(id, signal) {
      return readImportState(await request(of(id), { method: 'GET', ...(signal ? { signal } : {}) }));
    },
    async cancel(id, signal) {
      return readImportState(await request(of(id), { method: 'DELETE', ...(signal ? { signal } : {}) }));
    },
    async wait(id, pollOptions = {}) {
      const started = Date.now();
      let state = await client.state(id, pollOptions.signal);
      pollOptions.onState?.(state);
      while (!FINAL_STATUSES.includes(state.status)) {
        if (state.status === 'mapping') throw new Error('The import waits for its mapping; start it first.');
        await wait(nextPoll(state, Date.now() - started), pollOptions.signal);
        state = await client.state(id, pollOptions.signal);
        pollOptions.onState?.(state);
      }
      return state;
    },
    resolve: url => safeImportUrl(url, base),
  };
  return client;
}
