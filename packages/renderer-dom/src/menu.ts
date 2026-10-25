import { element, icon, placeMenu, type RenderedComponent } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

/** An entry of a menu such as the tools menu (export, copy, print, your own). */
export interface MenuItem {
  readonly id: string;
  readonly label: string;
  /**
   * Runs when chosen. A returned (or resolved) string is announced and shown
   * briefly, e.g. "25 rows copied"; a thrown error shows its message.
   */
  readonly onSelect: () => unknown;
  /** Items with the same group sit together under it as a heading. */
  readonly group?: string;
}

export interface RenderMenuOptions {
  /** The button text. Default: the `tools` label. */
  readonly label?: string;
  readonly items: readonly MenuItem[];
  readonly labels?: Partial<DataTableLabels>;
}

/**
 * Render a dropdown menu of actions (`<details>` with buttons), like the
 * Livewire tools menu: grouped items, Escape or a click outside closes it,
 * and results are announced in a polite live region.
 */
export function renderMenu(container: HTMLElement, options: RenderMenuOptions): RenderedComponent {
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };
  const items = options.items ?? [];
  for (const item of items) {
    if (!item || typeof item.id !== 'string' || typeof item.label !== 'string' || typeof item.onSelect !== 'function') {
      throw new TypeError('menu items need id, label and onSelect');
    }
  }
  if (items.length === 0) {
    container.replaceChildren();
    return { destroy: () => undefined };
  }
  const root = element(doc, 'details', { class: 'adt-columns adt-menu adt-tools' });
  const summary = element(doc, 'summary');
  summary.append(icon(doc, 'download'), element(doc, 'span', { class: 'adt-summary-text' }, options.label ?? labels.tools));
  root.addEventListener('toggle', () => placeMenu(root));
  const list = element(doc, 'div', { class: 'adt-menu-list' });
  const status = element(doc, 'p', { class: 'adt-menu-status', role: 'status', 'aria-live': 'polite' });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const announce = (text: string, error = false): void => {
    clearTimeout(timer);
    status.textContent = text;
    status.classList.toggle('adt-menu-status--error', error);
    timer = setTimeout(() => { status.textContent = ''; }, 4000);
  };
  let group: string | undefined;
  items.forEach((item, index) => {
    if (item.group !== group) {
      if (index > 0) list.append(element(doc, 'hr', { class: 'adt-menu-separator' }));
      if (item.group) list.append(element(doc, 'div', { class: 'adt-menu-label', 'aria-hidden': 'true' }, item.group));
      group = item.group;
    }
    const button = element(doc, 'button', { type: 'button', class: 'adt-menu-item', 'data-action': item.id }, item.label);
    button.addEventListener('click', () => {
      root.open = false;
      void (async () => {
        try {
          const result = await item.onSelect();
          if (typeof result === 'string' && result !== '') announce(result);
        } catch (error) {
          announce(error instanceof Error ? error.message : String(error), true);
        }
      })();
    });
    list.append(button);
  });
  root.append(summary, list);
  container.replaceChildren(root, status);

  root.addEventListener('keydown', event => {
    if (event.key === 'Escape' && root.open) { root.open = false; summary.focus(); }
  });
  const outside = (event: Event): void => {
    // The path at the time of the click: a control that re-rendered away still counts as inside.
    if (root.open && !event.composedPath().includes(root)) root.open = false;
  };
  doc.addEventListener('click', outside);
  return {
    destroy: () => {
      clearTimeout(timer);
      doc.removeEventListener('click', outside);
      root.remove();
      status.remove();
    },
  };
}

/** Print the page; with the optional `styles.css` only the table, without the controls. */
export function printTable(view: Window = window): void {
  view.print();
}

export interface PrintRowsOptions {
  /** A heading above the table, e.g. the page's title. */
  readonly title?: string;
  /** A line under the heading, e.g. how many rows and when. */
  readonly subtitle?: string;
  readonly headers: readonly string[];
  /** The cells: text, or a node from your own cell renderer (copied into the print). */
  readonly rows: readonly (readonly (string | Node)[])[];
  /** Columns right-aligned as numbers. */
  readonly numeric?: readonly boolean[];
}

/**
 * Print only a table — the rows given, not the page — like DataTables'
 * print button: they are written into a hidden frame with the page's
 * stylesheets (so your own cell styles apply), printed, and the frame is
 * removed afterwards. No pop-up window is opened. Resolves once the print
 * dialog has been shown.
 */
export async function printRows(doc: Document, options: PrintRowsOptions): Promise<void> {
  if (!Array.isArray(options?.headers) || !Array.isArray(options.rows)) throw new TypeError('printRows needs headers and rows');
  const frame = element(doc, 'iframe', { 'aria-hidden': 'true', tabindex: '-1', title: options.title ?? '' });
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
  doc.body.append(frame);
  const view = frame.contentWindow;
  const page = frame.contentDocument;
  if (!view || !page) {
    frame.remove();
    return;
  }
  page.documentElement.lang = doc.documentElement.lang;
  page.documentElement.setAttribute('data-theme', 'light'); // paper is white
  const charset = page.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  page.head.append(charset);
  page.title = options.title ?? doc.title;
  // The page's stylesheets, for the table's classes and your own cells; wait for them to load.
  const loading: Promise<void>[] = [];
  for (const sheet of doc.querySelectorAll<HTMLLinkElement | HTMLStyleElement>('link[rel~="stylesheet"], style')) {
    const copy = page.importNode(sheet, true) as HTMLLinkElement | HTMLStyleElement;
    if (copy instanceof (view as unknown as typeof globalThis).HTMLLinkElement) {
      loading.push(new Promise(resolve => { copy.addEventListener('load', () => resolve()); copy.addEventListener('error', () => resolve()); }));
    }
    page.head.append(copy);
  }
  const own = page.createElement('style');
  own.textContent = [
    'html,body{background:#fff;color:#111}',
    'body{margin:0;padding:12mm;font:11pt/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}',
    'h1{margin:0 0 2mm;font-size:15pt}',
    '.adt-print-subtitle{margin:0 0 5mm;color:#555;font-size:9pt}',
    '.adt-print{width:100%;border-collapse:collapse}',
    '.adt-print th,.adt-print td{padding:5px 8px;border-bottom:1px solid #d6d9de;text-align:left;vertical-align:top}',
    '.adt-print th{font-size:8.5pt;letter-spacing:.04em;text-transform:uppercase;color:#444;border-bottom-color:#999}',
    '.adt-print .adt-num{text-align:right;font-variant-numeric:tabular-nums}',
    '.adt-print thead{display:table-header-group}',
    '.adt-print tr{break-inside:avoid}',
    '@page{margin:0}',
  ].join('\n');
  page.head.append(own);
  const body = page.body;
  if (options.title) body.append(element(page, 'h1', {}, options.title));
  if (options.subtitle) body.append(element(page, 'p', { class: 'adt-print-subtitle' }, options.subtitle));
  const table = element(page, 'table', { class: 'adt-print' });
  const head = element(page, 'tr');
  options.headers.forEach((header, index) => head.append(element(page, 'th', { scope: 'col', ...(options.numeric?.[index] ? { class: 'adt-num' } : {}) }, String(header))));
  const thead = element(page, 'thead');
  thead.append(head);
  const tbody = element(page, 'tbody');
  for (const cells of options.rows) {
    const tr = element(page, 'tr');
    cells.forEach((cell: string | Node, index: number) => {
      const td = element(page, 'td', options.numeric?.[index] ? { class: 'adt-num' } : {});
      if (typeof cell === 'string') td.textContent = cell; // values are always written as text
      else td.append(page.importNode(cell, true));
      tr.append(td);
    });
    tbody.append(tr);
  }
  table.append(thead, tbody);
  body.append(table);
  await Promise.race([Promise.all(loading), new Promise(resolve => setTimeout(resolve, 1500))]);
  const remove = (): void => { frame.remove(); };
  view.addEventListener('afterprint', () => setTimeout(remove, 0), { once: true });
  setTimeout(remove, 60_000); // browsers without afterprint
  view.focus();
  view.print();
}
