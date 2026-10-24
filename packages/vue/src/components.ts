import {
  computed, defineComponent, h, nextTick, onMounted, onScopeDispose, shallowRef, watch,
  type PropType, type SlotsType, type VNode,
} from 'vue';
import { getPageItems, type ColumnDef, type DataTable, type Row } from '@acunsoft/datatable-core';
import {
  cellValue, checkPageSizes, checkResponsive, checkSize, confirmed, filterControls, splitActions, createCellText, ICONS, labelsEn, nextSorting, pageInfoText,
  numeric, pageSizeChoices, priorityOf, rangeOf, renderBulkActions, renderFilterChips, renderFilters, renderMenu, rowName, scrollHeight,
  type MenuItem, type RenderedComponent, type ResponsiveMode, type TableSize,
  type BulkAction, type BulkSelection, type CellFormatter, type DataTableLabels, type RowAction, type StatusSource,
} from '@acunsoft/datatable-dom';
import { useTable } from './composables';

type AnyTable = DataTable<any>;
type AnyRow = Row<any>;
type AnyColumn = ColumnDef<any>;
/*
 * Props typed with `never` accept callbacks for any row type: a
 * `RowAction<Order>` takes a `Row<Order>`, and `Row<never>` is assignable to
 * it. Inside, they are called with the table's rows.
 */
type LooseAction = RowAction<unknown>;

let tables = 0;
const tableProp = {
  type: Object as PropType<AnyTable>,
  required: true as const,
  validator: (value: unknown) => typeof (value as AnyTable)?.getPage === 'function' && typeof (value as AnyTable)?.subscribe === 'function',
};
const labelsProp = { type: Object as PropType<Partial<DataTableLabels>>, default: () => ({}) };
const withLabels = (labels: Partial<DataTableLabels>): DataTableLabels => ({ ...labelsEn, ...labels });

/** What a cell slot receives. */
export interface CellSlotProps {
  readonly column: AnyColumn;
  readonly row: AnyRow;
  /** The raw value from the accessor. */
  readonly value: unknown;
  /** The default display text. */
  readonly text: string;
}

/**
 * An accessible `<table>` for a `createDataTable` table, with the same markup
 * and `adt-*` classes as `@acunsoft/datatable-dom` (so its `styles.css`
 * applies): sort buttons with `aria-sort`, Shift+click multi-sort, row and
 * page checkboxes, row actions named after the row, `data-label` for the
 * narrow-screen layout, loading and error states from a `status` source.
 *
 * Slots: `cell` and `cell-<columnId>` (`{ column, row, value, text }`) for
 * custom cells, `empty` for the empty state. Slot content is rendered by Vue,
 * so it is escaped unless you inject HTML yourself.
 */
export const AcunDataTable = defineComponent({
  name: 'AcunDataTable',
  props: {
    table: tableProp,
    caption: { type: String, default: undefined },
    selectable: { type: Boolean, default: false },
    locale: { type: String, default: 'en' },
    labels: labelsProp,
    format: { type: Object as PropType<Readonly<Record<string, CellFormatter<never>>>>, default: undefined },
    rowLabel: { type: Function as PropType<(row: Row<never>) => string>, default: undefined },
    rowActions: { type: Array as PropType<readonly RowAction<never>[]>, default: () => [] },
    status: { type: Object as PropType<StatusSource>, default: undefined },
    /** Narrow screens: `cards` (default), `scroll`, `collapse` or `modal`; see `ColumnDef.priority`. */
    responsive: {
      type: String as PropType<ResponsiveMode>, default: 'cards',
      validator: (value: unknown) => { try { checkResponsive(value); return true; } catch { return false; } },
    },
    /** Density: `sm`, `md` (default) or `lg`. */
    size: {
      type: String as PropType<TableSize>, default: 'md',
      validator: (value: unknown) => { try { checkSize(value); return true; } catch { return false; } },
    },
    /** Keep the header at the top of the window while the page scrolls (DataTables `fixedHeader`). */
    stickyHeader: { type: Boolean, default: false },
    /** Shift+click adds a second sort column. Default `true`. */
    multiSort: { type: Boolean, default: true },
    /** Row actions shown as buttons in the row; the rest go into a "⋮" menu. Default: all. */
    maxInlineActions: { type: Number, default: Infinity },
    /** A fixed height to scroll inside, header in place (DataTables `scrollY`): `'60vh'`, `480`. */
    scrollY: {
      type: [String, Number] as PropType<string | number>, default: undefined,
      validator: (value: unknown) => { try { scrollHeight(value); return true; } catch { return false; } },
    },
  },
  slots: Object as SlotsType<{ cell: CellSlotProps; empty: Record<string, never>; [name: `cell-${string}`]: CellSlotProps }>,
  setup(props, { slots }) {
    const binding = useTable(props.table);
    const labels = computed(() => withLabels(props.labels));
    const text = computed(() => createCellText<any>(props.table.getColumns(), {
      locale: props.locale, labels: labels.value,
      ...(props.format ? { format: props.format as Readonly<Record<string, CellFormatter<any>>> } : {}),
    }));
    const phase = shallowRef<string>(props.status?.getState().status ?? 'idle');
    let stopStatus: (() => void) | undefined;
    watch(() => props.status, source => {
      stopStatus?.();
      phase.value = source?.getState().status ?? 'idle';
      stopStatus = source?.subscribe(state => { phase.value = state.status; });
    }, { immediate: true });
    onScopeDispose(() => stopStatus?.());
    const uid = `adt-vue-${++tables}`;
    let anchor: string | undefined;
    // Responsive collapse: open rows. Modal: the row shown in the dialog.
    const expanded = shallowRef<ReadonlySet<string>>(new Set());
    const dialogRow = shallowRef<string | undefined>();
    const dialog = shallowRef<HTMLDialogElement | null>(null);
    const openDialog = (id: string): void => {
      dialogRow.value = id;
      void nextTick(() => {
        const node = dialog.value;
        if (node && !node.open) {
          if (typeof node.showModal === 'function') node.showModal();
          else node.setAttribute('open', '');
        }
      });
    };
    const closeDialog = (): void => {
      const node = dialog.value;
      if (node?.open && typeof node.close === 'function') node.close();
      else node?.removeAttribute('open');
    };
    const onDialogClose = (): void => {
      const id = dialogRow.value;
      dialogRow.value = undefined;
      // Back to the row's button (Safari does not focus a clicked button).
      const buttons = dialog.value?.closest('.adt-table-wrap')?.querySelectorAll<HTMLElement>('.adt-expand') ?? [];
      [...buttons].find(button => button.dataset['row'] === id)?.focus();
    };
    // One listener closes any open row "⋮" menu on a click outside it.
    const wrapEl = shallowRef<HTMLElement | null>(null);
    const closeMenus = (event: Event): void => {
      wrapEl.value?.querySelectorAll<HTMLDetailsElement>('.adt-row-menu[open]').forEach(menu => {
        if (!menu.contains(event.target as Node)) menu.open = false;
      });
    };
    onMounted(() => document.addEventListener('click', closeMenus));
    onScopeDispose(() => { if (typeof document !== 'undefined') document.removeEventListener('click', closeMenus); });
    // Close the dialog when its row leaves the page.
    watch(() => binding.page.value, page => {
      if (dialogRow.value !== undefined && !page.rows.some(row => row.id === dialogRow.value)) closeDialog();
    });

    return (): VNode => {
      const { table } = props;
      const responsive = props.responsive;
      const collapsible = responsive === 'collapse' || responsive === 'modal';
      const state = binding.state.value;
      const page = binding.page.value;
      const columns = binding.visibleColumns.value;
      const pageIds = page.rows.map(row => row.id);
      const actions = props.rowActions as readonly LooseAction[];
      const rowLabel = props.rowLabel as ((row: AnyRow) => string) | undefined;
      const label = labels.value;

      const head: VNode[] = [];
      const levels = new Set(columns.map((column, index) => priorityOf(column, index)));
      if (actions.length > 0) levels.add(2);
      const level = (column: AnyColumn): string => (collapsible ? ` adt-col--p${priorityOf(column, columns.indexOf(column))}` : '');
      if (collapsible) head.push(h('td', { class: 'adt-expand-cell', key: '__expand' }));
      if (props.selectable) {
        const status = table.getSelectionStatus(pageIds);
        head.push(h('th', { scope: 'col', class: 'adt-select', key: '__select' },
          table.getSelectionMode() === 'multiple' && pageIds.length > 0
            ? [h('input', {
              type: 'checkbox', 'aria-label': label.selectAll, checked: status === 'all', indeterminate: status === 'some',
              onChange: () => (table.getSelectionStatus(pageIds) === 'all'
                ? table.setSelectedRows(table.getState().selectedIds.filter(id => !pageIds.includes(id)))
                : table.selectRows(pageIds)),
            })]
            : []));
      }
      const primary = state.sorting[0];
      for (const column of columns) {
        const index = state.sorting.findIndex(rule => rule.field === column.id);
        const rule = state.sorting[index];
        head.push(h('th', {
          scope: 'col', class: `adt-th${level(column)}${numeric(column) ? ' adt-num' : ''}`, key: column.id,
          'aria-sort': primary?.field === column.id ? (primary.direction === 'asc' ? 'ascending' : 'descending') : undefined,
        }, column.enableSorting
          ? [h('button', {
            type: 'button', class: rule ? `adt-sort adt-sort--${rule.direction}` : 'adt-sort',
            onClick: (event: MouseEvent) => table.setSorting(nextSorting(table.getState().sorting, column.id, event.shiftKey && props.multiSort)),
          }, [column.header, h('span', { class: 'adt-sort-mark', 'aria-hidden': 'true' },
            rule ? `${rule.direction === 'asc' ? '▲' : '▼'}${state.sorting.length > 1 ? index + 1 : ''}` : '')])]
          : column.header));
      }
      if (actions.length > 0) {
        head.push(h('th', { scope: 'col', class: `adt-th adt-actions${collapsible ? ' adt-col--p2' : ''}`, key: '__actions' }, label.actions));
      }
      const span = columns.length + (props.selectable ? 1 : 0) + (actions.length > 0 ? 1 : 0) + (collapsible ? 1 : 0);
      // Buttons in the row, the rest in a "⋮" menu; icons, danger colour and a confirm question.
      const actionButtons = (row: AnyRow, name: string, maxInline = props.maxInlineActions): VNode[] => {
        const { inline, menu } = splitActions(actions, row, maxInline);
        const run = (action: LooseAction, disabled: boolean): void => { if (!disabled && confirmed(action, row)) action.onSelect(row); };
        const buttons: VNode[] = inline.map(action => {
          const disabled = action.disabled?.(row) === true;
          const iconOnly = action.iconOnly === true && action.icon !== undefined;
          return h('button', {
            type: 'button', key: action.id, 'data-action': action.id,
            class: ['adt-action', iconOnly ? 'adt-action--icon' : '', action.danger ? 'adt-action--danger' : ''].filter(Boolean).join(' '),
            'aria-label': label.rowAction(action.label, name), title: iconOnly ? action.label : undefined,
            'aria-disabled': disabled ? 'true' : undefined, onClick: () => run(action, disabled),
          }, [action.icon ? iconNode(action.icon) : null, iconOnly ? null : h('span', action.label)]);
        });
        if (menu.length > 0) {
          buttons.push(h('details', {
            class: 'adt-row-menu', key: '__menu',
            onKeydown: (event: KeyboardEvent) => {
              const details = event.currentTarget as HTMLDetailsElement;
              if (event.key === 'Escape' && details.open) { details.open = false; details.querySelector('summary')?.focus(); }
            },
          }, [
            h('summary', { class: 'adt-action adt-action--icon', 'aria-label': label.moreActions(name), title: label.moreActions(name) }, [iconNode('more')]),
            h('div', { class: 'adt-menu-list' }, menu.map(action => {
              const disabled = action.disabled?.(row) === true;
              return h('button', {
                type: 'button', key: action.id, 'data-action': action.id, class: action.danger ? 'adt-menu-item adt-menu-item--danger' : 'adt-menu-item',
                'aria-label': label.rowAction(action.label, name), 'aria-disabled': disabled ? 'true' : undefined,
                onClick: (event: MouseEvent) => {
                  const details = (event.currentTarget as HTMLElement).closest('details');
                  if (details) details.open = false;
                  run(action, disabled);
                },
              }, [action.icon ? iconNode(action.icon) : null, h('span', action.label)]);
            })),
          ]));
        }
        return buttons;
      };
      const contentOf = (column: AnyColumn, row: AnyRow, text: string): unknown => {
        const slot = slots[`cell-${column.id}`] ?? slots.cell;
        return slot ? slot({ column, row, value: cellValue(column, row), text }) : text;
      };
      // The values of a row: all of them (dialog) or only those a narrow screen hides (details row).
      const detailList = (row: AnyRow, texts: readonly string[], name: string, all: boolean): VNode => h('dl', { class: 'adt-detail-list' }, [
        ...columns.flatMap((column, index) => {
          const priority = priorityOf(column, index);
          if (!all && priority === 1) return [];
          return [h('div', { class: all ? 'adt-detail-item' : `adt-detail-item adt-col--p${priority}`, key: column.id }, [
            h('dt', column.header), h('dd', contentOf(column, row, texts[index]!) as never),
          ])];
        }),
        actions.length > 0
          ? h('div', { class: all ? 'adt-detail-item' : 'adt-detail-item adt-col--p2', key: '__actions' }, [
            h('dt', label.actions), h('dd', { class: 'adt-detail-actions' }, actionButtons(row, name, Infinity)),
          ])
          : null,
      ]);

      const body: VNode[] = [];
      if (page.rows.length === 0) {
        body.push(h('tr', { class: 'adt-empty', key: '__empty' }, [h('td', { colspan: span }, slots.empty ? slots.empty({}) : label.empty)]));
      }
      let dialogContent: VNode[] | undefined;
      page.rows.forEach((row, rowIndex) => {
        const texts = columns.map(column => text.value(column, row));
        const name = rowName(row, texts[0] ?? '', rowLabel);
        const selected = table.isSelected(row.id);
        const open = responsive === 'collapse' && expanded.value.has(row.id);
        const detailId = `${uid}-detail-${rowIndex}`;
        const cells: VNode[] = [];
        if (collapsible) {
          cells.push(h('td', { class: 'adt-expand-cell', key: '__expand' }, [h('button', {
            type: 'button', class: 'adt-expand', 'aria-label': label.details(name), 'data-row': row.id,
            ...(responsive === 'collapse' ? { 'aria-expanded': String(open), 'aria-controls': detailId } : { 'aria-haspopup': 'dialog' }),
            onClick: () => {
              if (responsive === 'modal') return openDialog(row.id);
              const next = new Set(expanded.value);
              if (!next.delete(row.id)) next.add(row.id);
              expanded.value = next;
            },
          }, [iconNode(open ? 'collapse' : 'expand')])]));
        }
        if (dialogRow.value === row.id) {
          dialogContent = [
            h('div', { class: 'adt-dialog-head' }, [
              h('h2', { class: 'adt-dialog-title', id: `${uid}-dialog-title` }, label.details(name)),
              h('button', { type: 'button', class: 'adt-dialog-close', 'aria-label': label.close, onClick: closeDialog }, [iconNode('close')]),
            ]),
            detailList(row, texts, name, true),
          ];
        }
        if (props.selectable) {
          cells.push(h('td', { class: 'adt-select' }, [h('input', {
            type: 'checkbox', 'aria-label': label.selectRow(name), checked: selected,
            // Shift+click selects (or clears) every row between the last clicked one and this one.
            onClick: (event: MouseEvent) => {
              const from = anchor;
              anchor = row.id;
              if (event.shiftKey && from !== undefined && from !== row.id && table.getSelectionMode() === 'multiple') {
                const ids = rangeOf(pageIds, from, row.id);
                if ((event.currentTarget as HTMLInputElement).checked) table.selectRows(ids);
                else table.setSelectedRows(table.getState().selectedIds.filter(id => !ids.includes(id)));
              } else {
                table.toggleRow(row.id);
              }
            },
          })]));
        }
        columns.forEach((column, index) => {
          cells.push(h('td', {
            'data-label': column.header, key: column.id,
            class: [collapsible ? `adt-col--p${priorityOf(column, index)}` : '', numeric(column) ? 'adt-num' : ''].filter(Boolean).join(' ') || undefined,
          }, contentOf(column, row, texts[index]!) as never));
        });
        if (actions.length > 0) {
          cells.push(h('td', {
            class: collapsible ? 'adt-actions adt-col--p2' : 'adt-actions', 'data-label': label.actions, key: '__actions',
          }, actionButtons(row, name)));
        }
        const rowClass = ['adt-row', selected ? 'adt-row--selected' : '', open ? 'adt-row--expanded' : ''].filter(Boolean).join(' ');
        body.push(h('tr', { class: rowClass, 'data-row-id': row.id, key: row.id }, cells));
        if (open) {
          body.push(h('tr', { class: 'adt-detail', id: detailId, key: `${row.id}__detail` }, [
            h('td', { colspan: span }, [detailList(row, texts, name, false)]),
          ]));
        }
      });

      const busy = phase.value === 'loading';
      const notice = phase.value === 'loading'
        ? h('div', { class: 'adt-notice', role: 'status', 'aria-live': 'polite' }, [h('span', { class: 'adt-notice-text' }, label.loading)])
        : phase.value === 'error'
          ? h('div', { class: 'adt-notice', role: 'alert' }, [
            h('span', { class: 'adt-notice-text' }, label.error),
            typeof props.status?.retry === 'function'
              ? h('button', { type: 'button', class: 'adt-retry', onClick: () => { void props.status!.retry!(); } }, label.retry)
              : null,
          ])
          : h('div', { class: 'adt-notice', role: 'status', 'aria-live': 'polite' });
      const height = scrollHeight(props.scrollY);
      const wrapClass = ['adt-table-wrap', `adt-responsive--${responsive}`, props.size === 'md' ? '' : `adt-size--${props.size}`,
        props.stickyHeader ? 'adt-sticky-header' : '', height ? 'adt-scroll-y' : '', busy ? 'adt-loading' : ''].filter(Boolean).join(' ');
      const tableClass = ['adt-table', collapsible && levels.has(2) ? 'adt-has-p2' : '', collapsible && levels.has(3) ? 'adt-has-p3' : '']
        .filter(Boolean).join(' ');
      return h('div', { ref: wrapEl, class: wrapClass, style: height ? { '--adt-scroll-y': height } : undefined, 'aria-busy': props.status ? String(busy) : undefined }, [
        notice,
        h('div', { class: 'adt-scroll' }, [h('table', { class: tableClass }, [
          props.caption !== undefined ? h('caption', props.caption) : null,
          h('thead', [h('tr', head)]),
          h('tbody', body),
        ])]),
        responsive === 'modal'
          ? h('dialog', {
            ref: dialog, class: 'adt-dialog', 'aria-labelledby': `${uid}-dialog-title`, onClose: onDialogClose,
            onClick: (event: MouseEvent) => { if (event.target === event.currentTarget) closeDialog(); },
          }, dialogContent ?? [])
          : null,
      ]);
    };
  },
});

const iconNode = (name: keyof typeof ICONS | { readonly path: string }): VNode => h('svg', {
  class: 'adt-icon', viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', 'stroke-width': 2,
  'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
}, [h('path', { d: typeof name === 'string' ? ICONS[name] : name.path })]);

/**
 * Numbered pages: `‹ 1 … 4 5 6 … 20 ›`, with a fixed number of buttons while
 * there are more pages than fit. With an unknown server total it numbers the
 * pages seen so far and keeps "next" while the page is full.
 */
export const AcunPagination = defineComponent({
  name: 'AcunPagination',
  props: {
    table: tableProp,
    siblings: { type: Number, default: 1, validator: (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 10 },
    boundaries: { type: Number, default: 1, validator: (value: number) => Number.isSafeInteger(value) && value >= 0 && value <= 10 },
    /** Also show "first" and "last" buttons. */
    firstLast: { type: Boolean, default: false },
    /** Locale for the page numbers' digit grouping. */
    locale: { type: String, default: 'en' },
    labels: labelsProp,
  },
  setup(props) {
    const binding = useTable(props.table);
    const numbers = computed(() => new Intl.NumberFormat(props.locale));
    return (): VNode => {
      const label = withLabels(props.labels);
      const page = binding.page.value;
      const known = binding.totalRows.value !== undefined;
      const { table } = props;
      const atStart = page.page <= 1;
      const atEnd = page.page >= page.pageCount;
      const arrow = (name: 'first' | 'previous' | 'next' | 'last', disabled: boolean, target: number): VNode => h('button', {
        type: 'button', class: `adt-page adt-page-arrow adt-${name}`, 'aria-label': label[name],
        'aria-disabled': disabled ? 'true' : undefined, onClick: () => { if (!disabled) table.setPage(target); },
      }, [iconNode(name)]);
      const items = getPageItems(page.page, known ? page.pageCount : page.page, { siblings: props.siblings, boundaries: props.boundaries });
      return h('nav', { class: 'adt-paging', 'aria-label': label.pagination }, [
        props.firstLast ? arrow('first', atStart, 1) : null,
        arrow('previous', atStart, page.page - 1),
        h('span', { class: 'adt-page-numbers' }, items.map((item, index) => item === 'gap'
          ? h('span', { class: 'adt-page-gap', 'aria-hidden': 'true', key: `gap${index}` }, '…')
          : h('button', {
            type: 'button', class: 'adt-page', key: item, 'aria-label': label.page(item),
            'aria-current': item === page.page ? 'page' : undefined, onClick: () => table.setPage(item),
          }, numbers.value.format(item)))),
        arrow('next', atEnd, page.page + 1),
        props.firstLast && known ? arrow('last', atEnd, page.pageCount) : null,
      ]);
    };
  },
});

/** A rows-per-page select with a visually hidden label. */
export const AcunPageSize = defineComponent({
  name: 'AcunPageSize',
  props: {
    table: tableProp,
    pageSizes: {
      type: Array as PropType<readonly number[]>,
      default: () => [10, 25, 50, 100],
      validator: (sizes: readonly number[]) => { try { checkPageSizes(sizes); return true; } catch { return false; } },
    },
    labels: labelsProp,
  },
  setup(props) {
    const binding = useTable(props.table);
    return (): VNode => {
      const size = binding.state.value.pageSize;
      return h('label', { class: 'adt-length' }, [
        h('span', { class: 'adt-sr-only' }, withLabels(props.labels).pageSize),
        h('select', { class: 'adt-control', value: String(size), onChange: (event: Event) => props.table.setPageSize(Number((event.target as HTMLSelectElement).value)) },
          pageSizeChoices(props.pageSizes, size).map(choice => h('option', { value: String(choice), key: choice, selected: choice === size }, String(choice)))),
      ]);
    };
  },
});

/** The visible range and the total, `1–25 of 5,000 rows`, as a polite live region. */
export const AcunPageInfo = defineComponent({
  name: 'AcunPageInfo',
  props: { table: tableProp, labels: labelsProp },
  setup(props) {
    const binding = useTable(props.table);
    return (): VNode => {
      void binding.page.value; // re-render on every table change
      return h('div', { class: 'adt-info', 'aria-live': 'polite', 'aria-atomic': 'true' }, pageInfoText(props.table, withLabels(props.labels)));
    };
  },
});

/** A search input with an icon and a visually hidden label, bound to the global search; debounced, Enter applies at once. */
export const AcunSearch = defineComponent({
  name: 'AcunSearch',
  props: {
    table: tableProp,
    labels: labelsProp,
    placeholder: { type: String, default: undefined },
    debounceMs: { type: Number, default: 250, validator: (value: number) => Number.isFinite(value) && value >= 0 },
  },
  setup(props) {
    const binding = useTable(props.table);
    const text = shallowRef(binding.state.value.globalSearch);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let typing = false;
    const apply = (): void => {
      clearTimeout(timer);
      timer = undefined;
      props.table.setGlobalSearch(text.value);
    };
    watch(() => binding.state.value.globalSearch, next => { if (!typing && timer === undefined) text.value = next; });
    onScopeDispose(() => clearTimeout(timer));
    return (): VNode => h('label', { class: 'adt-search' }, [
      h('span', { class: 'adt-sr-only' }, withLabels(props.labels).search),
      iconNode('search'),
      h('input', {
        type: 'search', class: 'adt-control', autocomplete: 'off', value: text.value,
        placeholder: props.placeholder ?? `${withLabels(props.labels).search}…`,
        onFocus: () => { typing = true; },
        onBlur: () => { typing = false; },
        onInput: (event: Event) => {
          text.value = (event.target as HTMLInputElement).value;
          clearTimeout(timer);
          timer = setTimeout(apply, props.debounceMs);
        },
        onKeydown: (event: KeyboardEvent) => { if (event.key === 'Enter') apply(); },
      }),
    ]);
  },
});

/** A "Columns" menu (`<details>`) with a labelled checkbox per column. */
export const AcunColumnToggle = defineComponent({
  name: 'AcunColumnToggle',
  props: { table: tableProp, labels: labelsProp },
  setup(props) {
    const binding = useTable(props.table);
    return (): VNode => {
      const label = withLabels(props.labels);
      const hidden = binding.state.value.hiddenColumns;
      const columns = props.table.getColumns();
      const lastVisible = columns.length - hidden.length === 1;
      return h('details', { class: 'adt-columns' }, [
        h('summary', [iconNode('columns'), label.columns]),
        h('fieldset', [h('legend', label.showColumns), ...columns.map(column => {
          const shown = !hidden.includes(column.id);
          return h('label', { key: column.id }, [
            h('input', {
              type: 'checkbox', value: column.id, checked: shown,
              disabled: column.enableHiding === false || (lastVisible && shown),
              onChange: (event: Event) => props.table.setColumnVisibility(column.id, (event.target as HTMLInputElement).checked),
            }),
            h('span', column.header),
          ]);
        })]),
      ]);
    };
  },
});

/**
 * A bar for actions on the selected rows (see `renderBulkActions`): "N
 * selected", the actions, "Select all N matching" and "Clear selection".
 */
export const AcunBulkActions = defineComponent({
  name: 'AcunBulkActions',
  props: {
    table: tableProp,
    actions: { type: Array as PropType<readonly BulkAction<never>[]>, required: true },
    labels: labelsProp,
  },
  setup(props) {
    const host = shallowRef<HTMLElement | null>(null);
    let part: RenderedComponent | undefined;
    const mount = (): void => {
      part?.destroy();
      if (host.value) part = renderBulkActions(host.value, props.table, { actions: props.actions as readonly BulkAction<unknown>[], labels: withLabels(props.labels) });
    };
    onMounted(mount);
    watch(() => [props.actions, props.labels], mount);
    onScopeDispose(() => part?.destroy());
    return (): VNode => h('div', { ref: host, class: 'adt-feature' });
  },
});

/** Mount a DOM-renderer control in a wrapper element and keep it for the component's life. */
function domControl(name: string, render: (el: HTMLElement, props: { table: AnyTable; labels: Partial<DataTableLabels>; locale: string }) => RenderedComponent) {
  return defineComponent({
    name,
    props: { table: tableProp, labels: labelsProp, locale: { type: String, default: 'en' } },
    setup(props) {
      const host = shallowRef<HTMLElement | null>(null);
      let part: RenderedComponent | undefined;
      onMounted(() => { if (host.value) part = render(host.value, { table: props.table, labels: withLabels(props.labels), locale: props.locale }); });
      onScopeDispose(() => part?.destroy());
      return (): VNode => h('div', { ref: host, class: 'adt-feature' });
    },
  });
}

/** The "Filters" menu: a control per column with `filter` (see `renderFilters`). */
export const AcunFilters = domControl('AcunFilters', (el, props) => renderFilters(el, props.table, props));
/** The active filters as removable chips (see `renderFilterChips`). */
export const AcunFilterChips = domControl('AcunFilterChips', (el, props) => renderFilterChips(el, props.table, props));

/** A tools menu (export, copy, print, your own actions) with `items` (see `renderMenu`). */
export const AcunTools = defineComponent({
  name: 'AcunTools',
  props: {
    items: { type: Array as PropType<readonly MenuItem[]>, required: true },
    label: { type: String, default: undefined },
    labels: labelsProp,
  },
  setup(props) {
    const host = shallowRef<HTMLElement | null>(null);
    let part: RenderedComponent | undefined;
    const mount = (): void => {
      part?.destroy();
      if (host.value) part = renderMenu(host.value, { items: props.items, labels: withLabels(props.labels), ...(props.label ? { label: props.label } : {}) });
    };
    onMounted(mount);
    watch(() => [props.items, props.label], mount);
    onScopeDispose(() => part?.destroy());
    return (): VNode => h('div', { ref: host, class: 'adt-feature' });
  },
});

/**
 * The table and its controls in a bar above and a bar below, like
 * `renderDataTable`: page size, search, filters, column menu and tools on
 * top; filter chips and bulk actions; the table; info and pages below. Other
 * attributes go to `AcunDataTable` (caption, selectable, rowActions,
 * responsive, stickyHeader, …), and so do its cell slots. Slots `top-start`,
 * `top-end`, `bottom-start` and `bottom-end` add your own controls.
 */
export const AcunDataTableLayout = defineComponent({
  name: 'AcunDataTableLayout',
  inheritAttrs: false,
  props: {
    table: tableProp,
    labels: labelsProp,
    locale: { type: String, default: 'en' },
    pageSizes: { type: Array as PropType<readonly number[]>, default: () => [10, 25, 50, 100] },
    search: { type: Boolean, default: true },
    searchPlaceholder: { type: String, default: undefined },
    debounceMs: { type: Number, default: 250 },
    filters: { type: Boolean, default: true },
    columnToggle: { type: Boolean, default: true },
    tools: { type: Array as PropType<readonly MenuItem[]>, default: () => [] },
    bulkActions: { type: Array as PropType<readonly BulkAction<never>[]>, default: () => [] },
    paging: { type: Object as PropType<{ siblings?: number; boundaries?: number; firstLast?: boolean }>, default: () => ({}) },
    size: {
      type: String as PropType<TableSize>, default: 'md',
      validator: (value: unknown) => { try { checkSize(value); return true; } catch { return false; } },
    },
  },
  setup(props, { attrs, slots }) {
    return (): VNode => {
      const common = { table: props.table, labels: props.labels };
      const hasFilters = props.filters && filterControls(props.table.getColumns()).length > 0;
      const tableSlots = Object.fromEntries(Object.entries(slots).filter(([name]) => name === 'cell' || name === 'empty' || name.startsWith('cell-')));
      const bar = (position: 'top' | 'bottom', start: (VNode | null | VNode[] | undefined)[], end: (VNode | null | VNode[] | undefined)[]): VNode =>
        h('div', { class: `adt-bar adt-${position}` }, [h('div', { class: 'adt-bar-start' }, start.flat()), h('div', { class: 'adt-bar-end' }, end.flat())]);
      return h('div', { class: props.size === 'md' ? 'adt' : `adt adt-size--${props.size}` }, [
        bar('top', [
          h(AcunPageSize, { ...common, pageSizes: props.pageSizes }),
          props.search ? h('div', { class: 'adt-feature adt-feature--search' }, [h(AcunSearch, { ...common, debounceMs: props.debounceMs, ...(props.searchPlaceholder !== undefined ? { placeholder: props.searchPlaceholder } : {}) })]) : null,
          slots['top-start']?.(),
        ], [
          slots['top-end']?.(),
          hasFilters ? h(AcunFilters, { ...common, locale: props.locale }) : null,
          props.columnToggle ? h(AcunColumnToggle, common) : null,
          props.tools.length > 0 ? h(AcunTools, { items: props.tools, labels: props.labels }) : null,
        ]),
        hasFilters ? h(AcunFilterChips, { ...common, locale: props.locale }) : null,
        props.bulkActions.length > 0 ? h(AcunBulkActions, { ...common, actions: props.bulkActions }) : null,
        h(AcunDataTable, { ...attrs, ...common, locale: props.locale }, tableSlots),
        bar('bottom', [h(AcunPageInfo, common), slots['bottom-start']?.()], [slots['bottom-end']?.(), h(AcunPagination, { ...common, ...props.paging, locale: props.locale })]),
      ]);
    };
  },
});
