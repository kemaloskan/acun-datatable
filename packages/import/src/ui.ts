/**
 * The import dialog: choose or drop a file, match its columns, follow the
 * progress, read the result — the back end does the rest (PROTOCOL.md).
 * Every text from the back end is set as text, never parsed as HTML.
 */
import { createImportClient, importKey, ImportRequestError, type ImportClient, type ImportClientOptions } from './client';
import { resolveImportLabels, type ImportLabels } from './labels';
import { FINAL_STATUSES, type ImportCapabilities, type ImportMode, type ImportState } from './protocol';

/** A table the import refreshes when it is done (`AcunDataTable`, or anything with `reload()`). */
export interface ReloadableTable {
  reload(): unknown;
  /** Where the dialog goes, so it takes the table's theme. */
  readonly element?: HTMLElement;
}

export interface OpenImportOptions extends Partial<ImportClientOptions> {
  /** A client of your own instead of `url` (and its options). */
  readonly client?: ImportClient;
  /** `'en'` (default), `'tr'`, `'de'`, `'fr'`, `'es'` or a regional form (`'de-AT'`). */
  readonly language?: string;
  readonly labels?: Partial<ImportLabels>;
  /** Hints shown when the back end gives none (its capabilities win). */
  readonly accept?: readonly string[];
  readonly maxBytes?: number;
  readonly maxRows?: number;
  readonly templateUrl?: string;
  /** Refreshed when the import has changed rows. */
  readonly table?: ReloadableTable;
  /** Called with the final state (done, failed, cancelled, expired). */
  readonly onDone?: (state: ImportState) => void;
  /** Where the dialog is added. Default: the table's element, else `document.body`. */
  readonly container?: HTMLElement;
}

export interface ImportDialog {
  readonly element: HTMLDialogElement;
  /** Resolves with the final state, or `null` when closed before an import started. */
  readonly finished: Promise<ImportState | null>;
  close(): void;
}

/** A tools-menu item (`buttons`, `tools`, `renderMenu`) that opens the import dialog. */
export interface ImportMenuItem {
  readonly id: string;
  readonly label: string;
  readonly group?: string;
  readonly onSelect: () => void;
}

type Child = Node | string | null | undefined | false;
type Attributes = Readonly<Record<string, string | boolean | undefined>>;

const ICONS = {
  upload: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  close: 'M18 6 6 18M6 6l12 12',
  file: 'M14 3H6v18h12V7zM14 3v4h4',
  check: 'M20 6 9 17l-5-5',
  alert: 'M12 9v4M12 17h.01M10.3 3.9 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z',
} as const;

const CLOSE_STATES = new Set(['done', 'failed', 'cancelled', 'expired']);

/**
 * Open the import dialog. Needs `url` (or a `client`); the back end decides
 * the limits, how the file is read and processed, and answers by
 * `acun-import/1`.
 */
export function openImport(options: OpenImportOptions): ImportDialog {
  if (!options.client && !options.url) throw new TypeError('openImport needs a url or a client');
  const doc = (options.container ?? options.table?.element)?.ownerDocument ?? document;
  const labels = resolveImportLabels(options.language, options.labels);
  const numbers = new Intl.NumberFormat(options.language ?? 'en');
  const client = options.client ?? createImportClient({
    url: options.url!,
    ...(options.headers ? { headers: options.headers } : {}),
    ...(options.credentials ? { credentials: options.credentials } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    ...(options.delay ? { delay: options.delay } : {}),
  });

  const h = (tag: string, attributes: Attributes = {}, ...children: Child[]): HTMLElement => {
    const node = doc.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) {
      if (value === undefined || value === false) continue;
      node.setAttribute(name, value === true ? '' : value);
    }
    for (const child of children) if (child !== null && child !== undefined && child !== false) node.append(child);
    return node;
  };
  const icon = (name: keyof typeof ICONS): SVGSVGElement => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = doc.createElementNS(ns, 'svg');
    for (const [key, value] of Object.entries({ class: 'adt-icon', viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false' })) svg.setAttribute(key, value);
    const path = doc.createElementNS(ns, 'path');
    path.setAttribute('d', ICONS[name]);
    svg.append(path);
    return svg;
  };
  const button = (text: string, onClick: () => void, kind: 'primary' | 'plain' = 'plain', extra: Attributes = {}): HTMLButtonElement => {
    const node = h('button', { type: 'button', class: kind === 'primary' ? 'adt-button adt-button--primary' : 'adt-button', ...extra }, text) as HTMLButtonElement;
    node.addEventListener('click', onClick);
    return node;
  };
  const size = (bytes: number): string => (bytes >= 1024 * 1024
    ? `${new Intl.NumberFormat(options.language ?? 'en', { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024)} MB`
    : `${numbers.format(Math.max(1, Math.round(bytes / 1024)))} KB`);
  const messageOf = (error: unknown): string => (error instanceof ImportRequestError ? error.message : labels.requestFailed);

  // ---- The dialog
  const titleId = `adt-import-${importKey().slice(0, 8)}`;
  const dialog = h('dialog', { class: 'adt-dialog adt-import-dialog', 'aria-labelledby': titleId }) as HTMLDialogElement;
  const closeButton = h('button', { type: 'button', class: 'adt-dialog-close', 'aria-label': labels.close }, icon('close'));
  const body = h('div', { class: 'adt-import-body' });
  const live = h('p', { class: 'adt-sr-only', role: 'status', 'aria-live': 'polite' });
  dialog.append(h('div', { class: 'adt-dialog-head' }, h('h2', { class: 'adt-dialog-title', id: titleId }, labels.title), closeButton), body, live);
  (options.container ?? options.table?.element ?? doc.body).append(dialog);

  let closed = false;
  let current: ImportState | undefined;
  let running: AbortController | undefined;
  let capabilities: ImportCapabilities | null = null;
  let finish!: (state: ImportState | null) => void;
  const finished = new Promise<ImportState | null>(resolve => { finish = resolve; });

  const show = (step: string, ...children: Child[]): void => {
    body.replaceChildren(...children.filter((child): child is Node | string => Boolean(child)));
    body.dataset['step'] = step;
    // Focus moves to the step's heading (or its first control), so a screen reader hears the new step.
    const target = body.querySelector<HTMLElement>('[data-focus]') ?? body.querySelector<HTMLElement>('h3');
    target?.focus();
  };
  const alert = (text: string, ...actions: HTMLElement[]): HTMLElement =>
    h('div', { class: 'adt-import-alert', role: 'alert' }, icon('alert'), h('span', {}, text), ...actions);
  const heading = (text: string): HTMLElement => h('h3', { class: 'adt-import-step', tabindex: '-1' }, text);

  const completed = (state: ImportState): void => {
    const changed = state.inserted + state.updated > 0;
    if (changed || state.status === 'done') options.table?.reload();
    options.onDone?.(state);
    finish(state);
  };

  // ---- Step 1: the file
  const fileStep = (problem?: string, notice?: HTMLElement): void => {
    current = undefined;
    const input = h('input', { type: 'file', class: 'adt-sr-only', tabindex: '-1', 'aria-hidden': 'true' }) as HTMLInputElement;
    const accept = capabilities?.accept ?? options.accept;
    if (accept && accept.length > 0) input.accept = accept.join(',');
    const choose = button(labels.choose, () => input.click(), 'primary', { 'data-focus': 'true' });
    const zone = h('div', { class: 'adt-import-drop' },
      icon('upload'), h('p', {}, labels.drop), choose, input);
    const maxBytes = capabilities?.maxBytes ?? options.maxBytes;
    const maxRows = capabilities?.maxRows ?? options.maxRows;
    const template = capabilities?.templateUrl ?? options.templateUrl;
    const templateUrl = template ? client.resolve(template) : null;
    const hints = [
      accept && accept.length > 0 ? labels.accepted(accept.join(', ')) : '',
      maxBytes ? labels.maxSize(size(maxBytes)) : '',
      maxRows ? labels.maxRows(numbers.format(maxRows)) : '',
    ].filter(Boolean).join(' · ');
    const pick = (file: File | undefined): void => {
      if (!file) return;
      const warnings: string[] = [];
      if (maxBytes !== undefined && file.size > maxBytes) warnings.push(labels.tooLarge(size(maxBytes)));
      const extension = /\.[^.]+$/.exec(file.name)?.[0]?.toLowerCase();
      if (accept && accept.length > 0 && !accept.some(type => type.toLowerCase() === extension || type === file.type)) warnings.push(labels.wrongType);
      // The back end's limits are hints here: the user is told, the back end decides.
      if (warnings.length > 0) fileStep(undefined, alert(warnings.join(' '), button(labels.uploadAnyway, () => upload(file))));
      else upload(file);
    };
    input.addEventListener('change', () => pick(input.files?.[0]));
    zone.addEventListener('dragover', event => { event.preventDefault(); zone.classList.add('adt-import-drop--over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('adt-import-drop--over'));
    zone.addEventListener('drop', event => {
      event.preventDefault();
      zone.classList.remove('adt-import-drop--over');
      pick(event.dataTransfer?.files?.[0]);
    });
    show('file',
      problem ? alert(problem) : null,
      notice,
      zone,
      hints || templateUrl ? h('p', { class: 'adt-import-hint' }, hints, hints && templateUrl ? ' · ' : '',
        templateUrl ? h('a', { href: templateUrl, download: '' }, labels.template) : '') : null);
  };

  // ---- Uploading
  const upload = (file: File): void => {
    running?.abort();
    running = new AbortController();
    const bar = h('progress', { class: 'adt-import-progress', max: '100' }) as HTMLProgressElement;
    show('uploading', heading(labels.uploading(file.name)), h('p', { class: 'adt-import-file' }, icon('file'), `${file.name} · ${size(file.size)}`), bar);
    live.textContent = labels.uploading(file.name);
    client.upload(file, {
      idempotencyKey: importKey(), signal: running.signal,
      onProgress: (sent, total) => { bar.value = Math.round((sent / Math.max(1, total)) * 100); },
    }).then(state => {
      if (closed) { if (state.status === 'mapping') void client.cancel(state.id).catch(() => undefined); return; }
      current = state;
      if (state.status === 'mapping') mappingStep(state);
      else follow(state);
    }, error => { if (!closed) fileStep(messageOf(error)); });
  };

  // ---- Step 2: the mapping
  const mappingStep = (state: ImportState, problem?: string): void => {
    const headers = state.headers ?? [];
    const columns = state.columns ?? [];
    const chosen = [...(state.mapping ?? headers.map(() => null))];
    const offered = state.modes ?? [];
    let mode: ImportMode | undefined = state.mode ?? offered[0];
    const message = h('div', { class: 'adt-import-check', 'aria-live': 'polite' });
    const start = button(labels.start, () => begin(), 'primary');
    const check = (): boolean => {
      const missing = columns.filter(column => column.required && !chosen.includes(column.id)).map(column => column.title ?? column.id);
      const twice = columns.find(column => chosen.filter(id => id === column.id).length > 1);
      const text = missing.length > 0 ? labels.missingRequired(missing.join(', ')) : twice ? labels.mappedTwice(twice.title ?? twice.id) : '';
      message.textContent = text;
      if (text) start.setAttribute('aria-disabled', 'true'); else start.removeAttribute('aria-disabled');
      return text === '';
    };
    const name = (index: number): string => headers[index] || labels.emptyHeader(index + 1);
    const rows = headers.map((_, index) => {
      const select = h('select', { class: 'adt-control', 'aria-label': `${name(index)}: ${labels.tableColumn}` },
        h('option', { value: '' }, labels.skip),
        ...columns.map(column => h('option', { value: column.id }, `${column.title ?? column.id}${column.required ? ` (${labels.required})` : ''}`))) as HTMLSelectElement;
      select.value = chosen[index] ?? '';
      select.addEventListener('change', () => { chosen[index] = select.value === '' ? null : select.value; check(); });
      const sample = state.preview?.[0]?.cells[index];
      return h('tr', {}, h('th', { scope: 'row' }, name(index)), h('td', {}, select), h('td', { class: 'adt-import-sample' }, sample ?? ''));
    });
    const modeSelect = offered.length > 1 ? (() => {
      const select = h('select', { class: 'adt-control' }, ...offered.map(item => h('option', { value: item }, labels.modes[item]))) as HTMLSelectElement;
      select.value = mode ?? offered[0]!;
      select.addEventListener('change', () => { mode = select.value as ImportMode; });
      return h('label', { class: 'adt-import-mode' }, h('span', {}, labels.mode), select);
    })() : null;
    const preview = state.preview && state.preview.length > 0 ? h('details', { class: 'adt-import-preview' },
      h('summary', {}, labels.preview),
      h('div', { class: 'adt-import-scroll' }, h('table', { class: 'adt-import-table' },
        h('thead', {}, h('tr', {}, ...headers.map((_, index) => h('th', { scope: 'col' }, name(index))))),
        h('tbody', {}, ...state.preview.map(row => h('tr', {}, ...row.cells.map(cell => h('td', {}, cell ?? '')))))))) : null;
    const begin = (): void => {
      if (!check()) { message.focus(); return; }
      running?.abort();
      running = new AbortController();
      start.setAttribute('aria-disabled', 'true');
      client.start(state.id, { mapping: chosen, ...(mode ? { mode } : {}) }, running.signal).then(follow, error => {
        if (closed) return;
        if (error instanceof ImportRequestError && error.status === 422) mappingStep({ ...state, mapping: chosen, ...(mode ? { mode } : {}) }, Object.values(error.problem.errors).flat().join(' ') || error.message);
        else mappingStep(state, messageOf(error));
      });
    };
    show('mapping',
      heading(labels.mappingTitle),
      h('p', { class: 'adt-import-hint' }, labels.mappingHint, state.file?.rows !== undefined ? ` ${labels.fileRows(numbers.format(state.file.rows))}.` : ''),
      problem ? alert(problem) : null,
      h('div', { class: 'adt-import-scroll' }, h('table', { class: 'adt-import-table adt-import-mapping' },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, labels.fileColumn), h('th', { scope: 'col' }, labels.tableColumn), h('th', { scope: 'col' }, labels.sample))),
        h('tbody', {}, ...rows))),
      modeSelect,
      preview,
      message,
      h('div', { class: 'adt-import-actions' }, button(labels.back, () => { void client.cancel(state.id).catch(() => undefined); fileStep(); }), start));
    check();
  };

  // ---- Step 3: progress
  const follow = (state: ImportState): void => {
    current = state;
    if (FINAL_STATUSES.includes(state.status)) { result(state); return; }
    const bar = h('progress', { class: 'adt-import-progress' }) as HTMLProgressElement;
    const text = h('p', { class: 'adt-import-count' });
    const counts = h('p', { class: 'adt-import-hint' });
    const problemBox = h('div');
    const cancel = button(labels.cancel, () => {
      cancel.setAttribute('aria-disabled', 'true');
      client.cancel(state.id).then(update, error => { problemBox.replaceChildren(alert(messageOf(error))); cancel.removeAttribute('aria-disabled'); });
    });
    const update = (next: ImportState): void => {
      current = next;
      if (closed) return;
      if (next.total !== undefined && next.total !== null && next.total > 0) { bar.max = next.total; bar.value = Math.min(next.processed ?? 0, next.total); } else bar.removeAttribute('value');
      const done = numbers.format(next.processed ?? 0);
      text.textContent = next.status === 'queued' ? labels.queued
        : next.total !== undefined && next.total !== null ? labels.progress(done, numbers.format(next.total)) : labels.progressOpen(done);
      counts.textContent = [`${labels.inserted} ${numbers.format(next.inserted)}`, `${labels.updated} ${numbers.format(next.updated)}`, `${labels.failed} ${numbers.format(next.failed)}`].join(' · ');
      cancel.hidden = !next.cancellable;
      live.textContent = text.textContent;
    };
    show('progress', heading(labels.working), bar, text, counts, problemBox, h('div', { class: 'adt-import-actions' }, cancel));
    update(state);
    running = new AbortController();
    const poll = (): void => {
      client.wait(state.id, { signal: running!.signal, onState: update }).then(final => (closed ? completed(final) : result(final)), error => {
        if ((error as Error)?.name === 'AbortError' || running?.signal.aborted) return;
        if (closed) return;
        problemBox.replaceChildren(alert(messageOf(error), button(labels.retry, () => { problemBox.replaceChildren(); poll(); })));
      });
    };
    poll();
  };

  // ---- Step 4: the result
  const result = (state: ImportState): void => {
    current = state;
    const title = labels.results[state.status as keyof ImportLabels['results']] ?? labels.results.done;
    const report = state.errorReport ? client.resolve(state.errorReport) : null;
    const shown = state.errors.slice(0, 20);
    show('result',
      h('h3', { class: `adt-import-step adt-import-result adt-import-result--${state.status}`, tabindex: '-1' }, icon(state.status === 'done' ? 'check' : 'alert'), title),
      state.message ? h('p', {}, state.message) : null,
      h('dl', { class: 'adt-import-counts' },
        ...([['inserted', state.inserted], ['updated', state.updated], ['skipped', state.skipped], ['failed', state.failed]] as const)
          .flatMap(([key, value]) => [h('dt', {}, labels[key]), h('dd', {}, numbers.format(value))])),
      shown.length > 0 ? h('div', { class: 'adt-import-problems' }, h('h4', {}, labels.problems),
        h('ul', {}, ...shown.map(error => h('li', {}, `${labels.line(numbers.format(error.line))}${error.column ? ` · ${error.column}` : ''}${error.value ? ` · “${error.value}”` : ''}: ${error.message}`))),
        state.errorsTruncated || state.errors.length > shown.length ? h('p', { class: 'adt-import-hint' }, labels.moreProblems) : null) : null,
      report ? h('p', {}, h('a', { href: report, download: '', class: 'adt-import-report' }, labels.report)) : null,
      h('div', { class: 'adt-import-actions' }, button(labels.another, () => fileStep()), button(labels.close, () => dialog.close(), 'primary', { 'data-focus': 'true' })));
    live.textContent = title;
    completed(state);
  };

  // ---- Closing
  closeButton.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => {
    closed = true;
    // A running import goes on in the back end: keep following it quietly, to refresh the table when it ends.
    const following = current && !CLOSE_STATES.has(current.status) && current.status !== 'mapping' && body.dataset['step'] === 'progress';
    if (!following) running?.abort();
    if (current?.status === 'mapping') void client.cancel(current.id).catch(() => undefined);
    if (!following && (!current || !CLOSE_STATES.has(current.status))) finish(null);
    dialog.remove();
  });

  fileStep();
  if (typeof dialog.showModal === 'function') dialog.showModal(); else dialog.setAttribute('open', '');
  client.capabilities().then(found => {
    capabilities = found;
    if (!closed && body.dataset['step'] === 'file') fileStep();
  }, () => undefined);

  return { element: dialog, finished, close: () => { if (dialog.open) dialog.close(); else dialog.dispatchEvent(new Event('close')); } };
}

/** A tools-menu item that opens the import dialog: `buttons: ['excel', importButton({ url, table })]`. */
export function importButton(options: OpenImportOptions & { readonly label?: string; readonly group?: string }): ImportMenuItem {
  const labels = resolveImportLabels(options.language, options.labels);
  return {
    id: 'import',
    label: options.label ?? labels.menuItem,
    ...(options.group ? { group: options.group } : {}),
    onSelect: () => { openImport(options); },
  };
}
