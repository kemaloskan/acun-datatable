import type { DataTable } from '@acunsoft/datatable-core';
import { renderBulkActions, type BulkAction } from './actions';
import { renderColumnToggle } from './columns';
import { filterControls, renderFilterChips, renderFilters } from './filters';
import {
  renderPageInfo, renderPageSize, renderPagination, renderSearch, type RenderPaginationOptions, type RenderSearchOptions,
} from './controls';
import { checkTarget, element, type RenderedComponent } from './dom';
import { renderMenu, type MenuItem } from './menu';
import { resolveLabels, type DataTableLabels } from './labels';
import { checkSize, renderTable, type RenderTableOptions } from './table';

/** A built-in control, or your own: a function that fills the given element. */
export type LayoutFeature =
  | 'pageSize' | 'search' | 'filters' | 'columns' | 'tools' | 'info' | 'paging'
  | ((slot: HTMLElement) => RenderedComponent | void);

/** One slot holds one feature, several (shown side by side) or nothing (`null`). */
export type LayoutSlot = LayoutFeature | readonly LayoutFeature[] | null;

/** Where the controls go: a bar above and a bar below the table, each with a start and an end side. */
export interface DataTableLayout {
  readonly topStart?: LayoutSlot;
  readonly topEnd?: LayoutSlot;
  readonly bottomStart?: LayoutSlot;
  readonly bottomEnd?: LayoutSlot;
}

/** Page size and search top left, filters and the column menu top right, info bottom left, pages bottom right. */
export const DEFAULT_LAYOUT: Readonly<Required<DataTableLayout>> = Object.freeze({
  topStart: Object.freeze(['pageSize', 'search'] as const),
  topEnd: Object.freeze(['filters', 'columns', 'tools'] as const),
  bottomStart: 'info',
  bottomEnd: 'paging',
});

export interface RenderDataTableOptions<TData> extends RenderTableOptions<TData> {
  /** Merged over `DEFAULT_LAYOUT`; set a slot to `null` to leave it empty. */
  readonly layout?: DataTableLayout;
  /** Choices of the page-size select. Default `[10, 25, 50, 100]`. */
  readonly pageSizes?: readonly number[];
  /** Options of the numbered pager. */
  readonly paging?: Omit<RenderPaginationOptions, 'labels' | 'locale'>;
  /** Options of the search input. */
  readonly search?: Omit<RenderSearchOptions, 'labels'>;
  /** Actions for the selected rows, shown in a bar above the table while rows are selected. */
  readonly bulkActions?: readonly BulkAction<TData>[];
  /** The tools menu (layout feature `tools`): export, copy, print or your own actions. */
  readonly tools?: readonly MenuItem[];
}

const FEATURES = new Set(['pageSize', 'search', 'filters', 'columns', 'tools', 'info', 'paging']);

/**
 * Render a complete table: the table plus its controls arranged in a top and
 * a bottom bar, like DataTables. Without options you get page size and search
 * on the left above the table, the column menu on the right, the row range on
 * the left below it and numbered pages on the right. `locale` also picks the
 * built-in texts (`'tr'` → Turkish); `labels` overrides single texts.
 *
 * The bars wrap on narrow screens, and every part keeps its `adt-*` class, so
 * it can be restyled or moved with `layout` and custom features.
 */
export function renderDataTable<TData>(
  container: HTMLElement, table: DataTable<TData>, options: RenderDataTableOptions<TData> = {},
): RenderedComponent {
  checkTarget(container, table);
  const doc = container.ownerDocument;
  const layout = { ...DEFAULT_LAYOUT, ...options.layout };
  for (const [name, slot] of Object.entries(layout)) {
    if (!(name in DEFAULT_LAYOUT)) throw new RangeError(`Unknown layout slot "${name}"`);
    for (const feature of slotFeatures(slot)) {
      if (typeof feature !== 'function' && !FEATURES.has(feature)) throw new RangeError(`Unknown layout feature "${String(feature)}"`);
    }
  }
  const labels: DataTableLabels = resolveLabels(options.locale, options.labels);
  const locale = options.locale ?? 'en';

  const size = checkSize(options.size);
  const root = element(doc, 'div', { class: size === 'md' ? 'adt' : `adt adt-size--${size}` });
  const parts: RenderedComponent[] = [];
  const mount = (target: HTMLElement, feature: LayoutFeature): void => {
    const node = element(doc, 'div', { class: typeof feature === 'function' ? 'adt-feature' : `adt-feature adt-feature--${feature}` });
    target.append(node);
    let part: RenderedComponent | void;
    switch (feature) {
      case 'pageSize':
        part = renderPageSize(node, table, { labels, ...(options.pageSizes ? { pageSizes: options.pageSizes } : {}) });
        break;
      case 'search':
        part = renderSearch(node, table, { labels, ...options.search });
        break;
      case 'columns':
        part = renderColumnToggle(node, table, { labels, reorderable: options.reorderableColumns === true });
        break;
      case 'filters':
        part = renderFilters(node, table, { labels, locale });
        break;
      case 'tools':
        part = renderMenu(node, { items: options.tools ?? [], labels });
        break;
      case 'info':
        part = renderPageInfo(node, table, { labels });
        break;
      case 'paging':
        part = renderPagination(node, table, { labels, locale, ...options.paging });
        break;
      default:
        part = feature(node);
    }
    if (part && typeof part.destroy === 'function') parts.push(part);
  };
  const bar = (position: 'top' | 'bottom', start: LayoutSlot, end: LayoutSlot): HTMLElement | undefined => {
    if (slotFeatures(start).length === 0 && slotFeatures(end).length === 0) return undefined;
    const node = element(doc, 'div', { class: `adt-bar adt-${position}` });
    for (const [side, slot] of [['start', start], ['end', end]] as const) {
      const sideNode = element(doc, 'div', { class: `adt-bar-${side}` });
      node.append(sideNode);
      for (const feature of slotFeatures(slot)) mount(sideNode, feature);
    }
    return node;
  };

  container.replaceChildren(root);
  const top = bar('top', layout.topStart, layout.topEnd);
  if (top) root.append(top);
  // Active filters as chips, below the top bar, when any column is in the filter panel.
  if (filterControls(table.getColumns()).length > 0) {
    const chips = element(doc, 'div', { class: 'adt-feature adt-feature--chips' });
    root.append(chips);
    parts.push(renderFilterChips(chips, table, { labels, locale }));
  }
  if (options.bulkActions && options.bulkActions.length > 0) {
    const selection = element(doc, 'div', { class: 'adt-feature adt-feature--selection' });
    root.append(selection);
    parts.push(renderBulkActions(selection, table, { actions: options.bulkActions, labels }));
  }
  const body = element(doc, 'div', { class: 'adt-body' });
  root.append(body);
  // The size class sits on .adt, so the bars and the table share it.
  const { layout: _layout, pageSizes: _sizes, paging: _paging, search: _search, bulkActions: _bulk, size: _size, tools: _tools, ...tableOptions } = options;
  parts.push(renderTable(body, table, { ...tableOptions, labels }));
  const bottom = bar('bottom', layout.bottomStart, layout.bottomEnd);
  if (bottom) root.append(bottom);

  return {
    destroy: () => {
      for (const part of parts.splice(0)) part.destroy();
      root.remove();
    },
  };
}

function slotFeatures(slot: LayoutSlot | undefined): readonly LayoutFeature[] {
  if (slot === null || slot === undefined) return [];
  return Array.isArray(slot) ? slot : [slot as LayoutFeature];
}
