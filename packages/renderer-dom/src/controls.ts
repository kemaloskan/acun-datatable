import type { DataTable } from '@acunsoft/datatable-core';
import { checkTarget, element, type RenderedComponent } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

export interface RenderPaginationOptions {
  /** Choices for the page-size select. Default `[10, 25, 50, 100]`. */
  readonly pageSizes?: readonly number[];
  readonly labels?: Partial<DataTableLabels>;
}

/**
 * Render previous/next buttons, a live page status and a page-size select.
 * Controls are built once and updated in place, so the status stays one live
 * region and focus never moves. At the first or last page the buttons get
 * `aria-disabled` instead of `disabled`, so a focused button keeps focus.
 */
export function renderPagination<TData>(
  container: HTMLElement, table: DataTable<TData>, options: RenderPaginationOptions = {},
): RenderedComponent {
  checkTarget(container, table);
  const sizes = options.pageSizes ?? [10, 25, 50, 100];
  if (!Array.isArray(sizes) || sizes.length === 0 ||
      sizes.some(size => !Number.isSafeInteger(size) || size < 1 || size > 1000) || new Set(sizes).size !== sizes.length) {
    throw new RangeError('pageSizes must be unique integers from 1 to 1000');
  }
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };

  const root = element(doc, 'nav', { class: 'adt-pagination', 'aria-label': labels.pagination });
  const previous = element(doc, 'button', { type: 'button', class: 'adt-previous' }, labels.previous);
  const status = element(doc, 'span', { class: 'adt-status', 'aria-live': 'polite' });
  const next = element(doc, 'button', { type: 'button', class: 'adt-next' }, labels.next);
  const sizeLabel = element(doc, 'label', { class: 'adt-page-size' });
  const select = element(doc, 'select');
  sizeLabel.append(element(doc, 'span', {}, labels.pageSize), select);
  root.append(previous, status, next, sizeLabel);
  container.replaceChildren(root);

  const disabled = (button: HTMLButtonElement, value: boolean): void => {
    if (value) button.setAttribute('aria-disabled', 'true');
    else button.removeAttribute('aria-disabled');
  };
  const update = (): void => {
    const page = table.getPage();
    disabled(previous, page.page <= 1);
    disabled(next, page.page >= page.pageCount);
    // With an unknown server total, page.totalRows is only a lower bound: don't present it as the total.
    status.textContent = table.getTotalRows() === undefined
      ? labels.pageStatusOpen(page.page)
      : labels.pageStatus(page.page, page.pageCount, page.totalRows);
    const choices = sizes.includes(page.pageSize) ? sizes : [...sizes, page.pageSize].sort((a, b) => a - b);
    if (select.options.length !== choices.length || [...select.options].some((option, i) => option.value !== String(choices[i]))) {
      select.replaceChildren(...choices.map(size => element(doc, 'option', { value: String(size) }, String(size))));
    }
    select.value = String(page.pageSize);
  };

  previous.addEventListener('click', () => {
    if (previous.getAttribute('aria-disabled') !== 'true') table.setPage(table.getState().page - 1);
  });
  next.addEventListener('click', () => {
    if (next.getAttribute('aria-disabled') !== 'true') table.setPage(table.getState().page + 1);
  });
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

export interface RenderSearchOptions {
  /** Delay before typing updates the table. Default 250 ms; Enter applies at once. */
  readonly debounceMs?: number;
  readonly placeholder?: string;
  readonly labels?: Partial<DataTableLabels>;
}

/**
 * Render a labelled search input bound to the table's global search. Typing is
 * debounced; the input follows external state changes unless it has focus.
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
    type: 'search', autocomplete: 'off',
    ...(options.placeholder !== undefined ? { placeholder: options.placeholder } : {}),
  });
  input.value = table.getState().globalSearch;
  root.append(element(doc, 'span', {}, labels.search), input);
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
