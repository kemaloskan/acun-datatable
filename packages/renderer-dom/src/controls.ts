import { getPageItems, type DataTable } from '@acunsoft/datatable-core';
import { ariaDisabled, checkTarget, element, icon, keepFocus, type RenderedComponent } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

export interface RenderPaginationOptions {
  /** Pages shown on each side of the current page. Default 1. */
  readonly siblings?: number;
  /** Pages always shown at the start and the end. Default 1. */
  readonly boundaries?: number;
  /** Also show "first" and "last" buttons. Default `false`. */
  readonly firstLast?: boolean;
  /** Locale for the page numbers' digit grouping (`1.000` in Turkish). Default `'en'`. */
  readonly locale?: string;
  readonly labels?: Partial<DataTableLabels>;
}

/**
 * Render a numbered pager: `‹ 1 … 4 5 6 … 20 ›`. While there are more pages
 * than fit, it keeps the same number of buttons, so it never changes width.
 * The current page has `aria-current="page"`; at either end the arrows get
 * `aria-disabled` instead of `disabled`, so a focused arrow keeps focus. With
 * an unknown server total it shows the pages seen so far and "next" while the
 * page is full.
 */
export function renderPagination<TData>(
  container: HTMLElement, table: DataTable<TData>, options: RenderPaginationOptions = {},
): RenderedComponent {
  checkTarget(container, table);
  const itemOptions = { siblings: options.siblings ?? 1, boundaries: options.boundaries ?? 1 };
  getPageItems(1, 1, itemOptions); // validates the options before anything is rendered
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };
  const numberFormat = new Intl.NumberFormat(options.locale ?? 'en');

  const root = element(doc, 'nav', { class: 'adt-paging', 'aria-label': labels.pagination });
  const arrow = (name: 'first' | 'previous' | 'next' | 'last', go: () => number): HTMLButtonElement => {
    const button = element(doc, 'button', { type: 'button', class: `adt-page adt-page-arrow adt-${name}`, 'aria-label': labels[name] });
    button.append(icon(doc, name));
    button.addEventListener('click', () => {
      if (button.getAttribute('aria-disabled') !== 'true') table.setPage(go());
    });
    return button;
  };
  const first = options.firstLast ? arrow('first', () => 1) : undefined;
  const previous = arrow('previous', () => table.getState().page - 1);
  const numbers = element(doc, 'span', { class: 'adt-page-numbers' });
  const next = arrow('next', () => table.getState().page + 1);
  const last = options.firstLast ? arrow('last', () => table.getPage().pageCount) : undefined;
  root.append(...[first, previous, numbers, next, last].filter((node): node is HTMLElement => node !== undefined));
  container.replaceChildren(root);

  const update = (): void => {
    const page = table.getPage();
    const known = table.getTotalRows() !== undefined;
    const atStart = page.page <= 1;
    const atEnd = page.page >= page.pageCount;
    if (first) ariaDisabled(first, atStart);
    ariaDisabled(previous, atStart);
    ariaDisabled(next, atEnd);
    if (last) {
      ariaDisabled(last, atEnd);
      last.hidden = !known; // the last page of an unknown total is not known
    }
    // Unknown total: number only the pages that are known to exist.
    const items = getPageItems(page.page, known ? page.pageCount : page.page, itemOptions);
    keepFocus(numbers, () => numbers.replaceChildren(...items.map(item => {
      if (item === 'gap') return element(doc, 'span', { class: 'adt-page-gap', 'aria-hidden': 'true' }, '…');
      const button = element(doc, 'button', {
        type: 'button', class: 'adt-page', 'aria-label': labels.page(item), 'data-adt-focus': `page:${item}`,
        'aria-current': item === page.page ? 'page' : undefined,
      }, numberFormat.format(item));
      button.addEventListener('click', () => table.setPage(item));
      return button;
    })));
  };

  update();
  const unsubscribe = table.subscribe(() => update());
  return {
    destroy: () => {
      unsubscribe();
      root.remove();
    },
  };
}

export interface RenderPageSizeOptions {
  /** Choices for the select. Default `[10, 25, 50, 100]`; the current size is always listed. */
  readonly pageSizes?: readonly number[];
  readonly labels?: Partial<DataTableLabels>;
}

export function checkPageSizes(sizes: unknown): readonly number[] {
  if (!Array.isArray(sizes) || sizes.length === 0 ||
      sizes.some(size => !Number.isSafeInteger(size) || size < 1 || size > 1000) || new Set(sizes).size !== sizes.length) {
    throw new RangeError('pageSizes must be unique integers from 1 to 1000');
  }
  return sizes as readonly number[];
}

/** The page sizes to offer: the configured ones plus the current size, sorted. */
export function pageSizeChoices(sizes: readonly number[], current: number): readonly number[] {
  return sizes.includes(current) ? sizes : [...sizes, current].sort((a, b) => a - b);
}

/** Render a rows-per-page select. Its label is visually hidden but read by screen readers. */
export function renderPageSize<TData>(
  container: HTMLElement, table: DataTable<TData>, options: RenderPageSizeOptions = {},
): RenderedComponent {
  checkTarget(container, table);
  const sizes = checkPageSizes(options.pageSizes ?? [10, 25, 50, 100]);
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };

  const root = element(doc, 'label', { class: 'adt-length' });
  const select = element(doc, 'select', { class: 'adt-control' });
  root.append(element(doc, 'span', { class: 'adt-sr-only' }, labels.pageSize), select);
  container.replaceChildren(root);

  const update = (): void => {
    const choices = pageSizeChoices(sizes, table.getState().pageSize);
    if (select.options.length !== choices.length || [...select.options].some((option, i) => option.value !== String(choices[i]))) {
      select.replaceChildren(...choices.map(size => element(doc, 'option', { value: String(size) }, String(size))));
    }
    select.value = String(table.getState().pageSize);
  };
  select.addEventListener('change', () => table.setPageSize(Number(select.value)));

  update();
  const unsubscribe = table.subscribe(() => update());
  return {
    destroy: () => {
      unsubscribe();
      root.remove();
    },
  };
}

export interface RenderPageInfoOptions {
  readonly labels?: Partial<DataTableLabels>;
  /** Count every matching row as shown (virtual scrolling): `1–N of N`. */
  readonly all?: boolean;
}

/** The info text of a page: `1–25 of 5,000 rows`, or only the range when the total is unknown. */
export function pageInfoText<TData>(table: DataTable<TData>, labels: DataTableLabels, all = false): string {
  if (all) {
    const total = table.getFilteredRows().length;
    return total === 0 ? labels.pageInfoEmpty : labels.pageInfo(1, total, total);
  }
  const page = table.getPage();
  if (page.rows.length === 0) return labels.pageInfoEmpty;
  const from = (page.page - 1) * page.pageSize + 1;
  const to = from + page.rows.length - 1;
  return table.getTotalRows() === undefined ? labels.pageInfoOpen(from, to) : labels.pageInfo(from, to, page.totalRows);
}

/** Render the visible range and the total as one polite live region. */
export function renderPageInfo<TData>(
  container: HTMLElement, table: DataTable<TData>, options: RenderPageInfoOptions = {},
): RenderedComponent {
  checkTarget(container, table);
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };
  const root = element(doc, 'div', { class: 'adt-info', 'aria-live': 'polite', 'aria-atomic': 'true' });
  container.replaceChildren(root);
  const update = (): void => {
    root.textContent = pageInfoText(table, labels, options.all === true);
  };
  update();
  const unsubscribe = table.subscribe(() => update());
  return {
    destroy: () => {
      unsubscribe();
      root.remove();
    },
  };
}

export interface RenderSearchOptions {
  /** Delay before typing updates the table. Default 250 ms; Enter applies at once. */
  readonly debounceMs?: number;
  /** Default: the search label with an ellipsis (`Search…`). */
  readonly placeholder?: string;
  readonly labels?: Partial<DataTableLabels>;
}

/**
 * Render a search input bound to the table's global search, with a search
 * icon and a visually hidden label. Typing is debounced; the input follows
 * external state changes unless it has focus.
 */
export function renderSearch<TData>(
  container: HTMLElement, table: DataTable<TData>, options: RenderSearchOptions = {},
): RenderedComponent {
  checkTarget(container, table);
  const delay = options.debounceMs ?? 250;
  if (!Number.isFinite(delay) || delay < 0) throw new RangeError('debounceMs must be a non-negative number');
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };

  const root = element(doc, 'label', { class: 'adt-search' });
  const input = element(doc, 'input', {
    type: 'search', class: 'adt-control', autocomplete: 'off', placeholder: options.placeholder ?? `${labels.search}…`,
  });
  input.value = table.getState().globalSearch;
  root.append(element(doc, 'span', { class: 'adt-sr-only' }, labels.search), icon(doc, 'search'), input);
  container.replaceChildren(root);

  let timer: ReturnType<typeof setTimeout> | undefined;
  const apply = (): void => {
    clearTimeout(timer);
    timer = undefined;
    table.setGlobalSearch(input.value);
  };
  input.addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(apply, delay);
  });
  input.addEventListener('keydown', event => {
    if (event.key === 'Enter') apply();
  });

  const unsubscribe = table.subscribe(state => {
    if (doc.activeElement !== input && timer === undefined && input.value !== state.globalSearch) {
      input.value = state.globalSearch;
    }
  });
  return {
    destroy: () => {
      clearTimeout(timer);
      unsubscribe();
      root.remove();
    },
  };
}
