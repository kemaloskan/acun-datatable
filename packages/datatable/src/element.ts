import type { DataTableEvent, DataTableState } from '@acunsoft/datatable-core';
import { AcunDataTable, type AcunDataTableOptions, type ColumnOptions } from './acun-datatable';

type Data = Record<string, unknown>;

/** Attributes the element reads; the rest of the options are the `options` property. */
const ATTRIBUTES = [
  'src', 'server-side', 'method', 'language', 'page-size', 'responsive', 'size', 'fixed-header', 'scroll-y', 'virtual', 'cursor', 'state-save',
] as const;

const flag = (value: string | null): boolean | undefined => (value === null ? undefined : value !== 'false');

// Importing on a server (SSR) must not fail where there is no DOM.
const Base = (globalThis.HTMLElement ?? class {}) as typeof HTMLElement;

/**
 * `<acun-datatable>`: the whole table as a custom element, for Angular,
 * Svelte, Astro, Alpine, plain HTML or any framework that renders HTML.
 * Attributes cover the common options (`src`, `server-side`, `method`,
 * `language`, `page-size`, `responsive`, `size`, `fixed-header`, `scroll-y`,
 * `virtual`, `cursor`, `state-save`); the `options`, `columns` and `data`
 * properties take everything else. A `<table>` inside it is the source when
 * there is no `src` or `data`. Light DOM, so `styles.css` applies; it fires
 * `adt-change` (detail: `{ state, event }`) on every table change and
 * `adt-ready` once the first rows are shown. `table` is the
 * `AcunDataTable` instance.
 */
export class AcunDataTableElement extends Base {
  static readonly observedAttributes = ATTRIBUTES;

  #instance: AcunDataTable | undefined;
  #options: AcunDataTableOptions = {};
  #columns: readonly ColumnOptions[] | undefined;
  #data: readonly Data[] | undefined;
  #queued = false;
  #rebuild = false; // anything but the rows changed: build the table again
  #source: HTMLTableElement | undefined;

  /** The running table (after it is connected). */
  get table(): AcunDataTable | undefined { return this.#instance; }

  /** Every `AcunDataTable` option; attributes win over these. */
  get options(): AcunDataTableOptions { return this.#options; }
  set options(value: AcunDataTableOptions) { this.#options = value ?? {}; this.#schedule(true); }

  get columns(): readonly ColumnOptions[] | undefined { return this.#columns; }
  set columns(value: readonly ColumnOptions[] | undefined) { this.#columns = value; this.#schedule(true); }

  /** Rows for a table in the browser (instead of `src`). New rows keep the page, sorting, search and selection. */
  get data(): readonly Data[] | undefined { return this.#data; }
  set data(value: readonly Data[] | undefined) { this.#data = value; this.#schedule(value === undefined); }

  // Moved within the page: the running table stays as it is.
  connectedCallback(): void { if (!this.#instance) this.#schedule(true); }

  disconnectedCallback(): void {
    // Moved within the page: it is connected again before this runs.
    queueMicrotask(() => { if (!this.isConnected) this.#destroy(); });
  }

  attributeChangedCallback(_name: string, before: string | null, after: string | null): void { if (before !== after) this.#schedule(true); }

  /** Load the rows again. */
  reload(): Promise<void> { return this.#instance?.reload() ?? Promise.resolve(); }

  #schedule(rebuild: boolean): void {
    this.#rebuild ||= rebuild;
    if (this.#queued) return;
    this.#queued = true;
    queueMicrotask(() => {
      this.#queued = false;
      const rebuildNow = this.#rebuild || !this.#instance || !this.#data || this.#instance.table?.getMode() === 'server' || this.hasAttribute('src');
      this.#rebuild = false;
      if (!this.isConnected) return;
      if (rebuildNow) this.#render();
      else this.#instance!.setData(this.#data!);
    });
  }

  #destroy(): void {
    this.#instance?.destroy(); // puts an original <table> back
    this.#instance = undefined;
  }

  #render(): void {
    this.#destroy();
    const attr = (name: (typeof ATTRIBUTES)[number]): string | null => this.getAttribute(name);
    const src = attr('src');
    const pageSize = attr('page-size');
    const options = {
      ...this.#options,
      ...(this.#columns ? { columns: this.#columns } : {}),
      ...(this.#data ? { data: this.#data } : {}),
      ...(src ? { ajax: { url: src, ...(attr('method') === 'POST' ? { method: 'POST' as const } : {}) } } : {}),
      ...(flag(attr('server-side')) !== undefined ? { serverSide: flag(attr('server-side'))! } : {}),
      ...(attr('language') ? { language: attr('language') as NonNullable<AcunDataTableOptions['language']> } : {}),
      ...(pageSize || flag(attr('cursor')) ? {
        pagination: {
          ...(typeof this.#options.pagination === 'object' ? this.#options.pagination : {}),
          ...(pageSize ? { pageSize: Number(pageSize) } : {}),
          ...(flag(attr('cursor')) ? { cursor: true } : {}),
        },
      } : {}),
      ...(attr('responsive') ? { responsive: attr('responsive') as AcunDataTableOptions['responsive'] } : {}),
      ...(attr('size') ? { size: attr('size') as AcunDataTableOptions['size'] } : {}),
      ...(flag(attr('fixed-header')) !== undefined ? { fixedHeader: flag(attr('fixed-header'))! } : {}),
      ...(attr('scroll-y') ? { scrollY: attr('scroll-y')! } : {}),
      ...(flag(attr('virtual')) !== undefined ? { virtual: flag(attr('virtual'))! } : {}),
      ...(flag(attr('state-save')) ? { stateSave: this.id ? { key: `${location.pathname}#${this.id}` } : true } : {}),
    } as AcunDataTableOptions;
    // A <table> written inside the element is the source when nothing else gives rows.
    this.#source ??= this.querySelector<HTMLTableElement>(':scope > table') ?? undefined;
    const useTable = this.#source && !options.ajax && !options.data;
    let target: HTMLElement;
    if (useTable) {
      target = this.#source!;
    } else {
      target = this.querySelector<HTMLElement>(':scope > .acun-datatable-host') ?? this.ownerDocument.createElement('div');
      target.className = 'acun-datatable-host';
      if (!target.isConnected) this.replaceChildren(target);
    }
    const instance = new AcunDataTable(target, options);
    this.#instance = instance;
    instance.on((state: Readonly<DataTableState>, event: Readonly<DataTableEvent>) => {
      this.dispatchEvent(new CustomEvent('adt-change', { detail: { state, event } }));
    });
    instance.ready.then(
      () => { if (this.#instance === instance) this.dispatchEvent(new CustomEvent('adt-ready')); },
      () => undefined, // shown in the table
    );
  }
}

/** Register `<acun-datatable>` (or your own name) once. Returns the class. */
export function defineAcunDataTableElement(name = 'acun-datatable'): typeof AcunDataTableElement {
  const registry = globalThis.customElements;
  if (registry && !registry.get(name)) registry.define(name, name === 'acun-datatable' ? AcunDataTableElement : class extends AcunDataTableElement {});
  return AcunDataTableElement;
}
