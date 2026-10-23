import {
  computed, defineComponent, h, onScopeDispose, shallowRef, watch,
  type PropType, type SlotsType, type VNode,
} from 'vue';
import type { ColumnDef, DataTable, Row } from '@acunsoft/datatable-core';
import {
  cellValue, createCellText, labelsEn, nextSorting, rowName,
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
type LooseBulk = BulkAction<unknown>;

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

    return (): VNode => {
      const { table } = props;
      const state = binding.state.value;
      const page = binding.page.value;
      const columns = binding.visibleColumns.value;
      const pageIds = page.rows.map(row => row.id);
      const actions = props.rowActions as readonly LooseAction[];
      const rowLabel = props.rowLabel as ((row: AnyRow) => string) | undefined;
      const label = labels.value;

      const head: VNode[] = [];
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
          scope: 'col', class: 'adt-th', key: column.id,
          'aria-sort': primary?.field === column.id ? (primary.direction === 'asc' ? 'ascending' : 'descending') : undefined,
        }, column.enableSorting
          ? [h('button', {
            type: 'button', class: rule ? `adt-sort adt-sort--${rule.direction}` : 'adt-sort',
            onClick: (event: MouseEvent) => table.setSorting(nextSorting(table.getState().sorting, column.id, event.shiftKey)),
          }, [column.header, h('span', { class: 'adt-sort-mark', 'aria-hidden': 'true' },
            rule ? `${rule.direction === 'asc' ? '▲' : '▼'}${state.sorting.length > 1 ? index + 1 : ''}` : '')])]
          : column.header));
      }
      if (actions.length > 0) head.push(h('th', { scope: 'col', class: 'adt-th adt-actions', key: '__actions' }, label.actions));

      const body: VNode[] = [];
      if (page.rows.length === 0) {
        body.push(h('tr', { class: 'adt-empty', key: '__empty' }, [h('td', {
          colspan: columns.length + (props.selectable ? 1 : 0) + (actions.length > 0 ? 1 : 0),
        }, slots.empty ? slots.empty({}) : label.empty)]));
      }
      for (const row of page.rows) {
        const texts = columns.map(column => text.value(column, row));
        const name = rowName(row, texts[0] ?? '', rowLabel);
        const selected = table.isSelected(row.id);
        const cells: VNode[] = [];
        if (props.selectable) {
          cells.push(h('td', { class: 'adt-select' }, [h('input', {
            type: 'checkbox', 'aria-label': label.selectRow(name), checked: selected, onChange: () => table.toggleRow(row.id),
          })]));
        }
        columns.forEach((column, index) => {
          const slot = slots[`cell-${column.id}`] ?? slots.cell;
          const content = slot ? slot({ column, row, value: cellValue(column, row), text: texts[index]! }) : texts[index];
          cells.push(h('td', { 'data-label': column.header, key: column.id }, content));
        });
        if (actions.length > 0) {
          cells.push(h('td', { class: 'adt-actions', 'data-label': label.actions, key: '__actions' },
            actions.filter(action => action.hidden?.(row) !== true).map(action => {
              const disabled = action.disabled?.(row) === true;
              return h('button', {
                type: 'button', class: 'adt-action', 'data-action': action.id, key: action.id,
                'aria-label': label.rowAction(action.label, name), 'aria-disabled': disabled ? 'true' : undefined,
                onClick: () => { if (!disabled) action.onSelect(row); },
              }, action.label);
            })));
        }
        body.push(h('tr', { class: selected ? 'adt-row adt-row--selected' : 'adt-row', 'data-row-id': row.id, key: row.id }, cells));
      }

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
      return h('div', { class: busy ? 'adt-table-wrap adt-loading' : 'adt-table-wrap', 'aria-busy': props.status ? String(busy) : undefined }, [
        notice,
        h('div', { class: 'adt-scroll' }, [h('table', { class: 'adt-table' }, [
          props.caption !== undefined ? h('caption', props.caption) : null,
          h('thead', [h('tr', head)]),
          h('tbody', body),
        ])]),
      ]);
    };
  },
});

/** Previous/Next, a live "Page 2 of 7 · 160 rows" status and a page-size select. */
export const AcunPagination = defineComponent({
  name: 'AcunPagination',
  props: {
    table: tableProp,
    pageSizes: {
      type: Array as PropType<readonly number[]>,
      default: () => [10, 25, 50, 100],
      validator: (sizes: readonly number[]) => sizes.length > 0 && new Set(sizes).size === sizes.length &&
        sizes.every(size => Number.isSafeInteger(size) && size >= 1 && size <= 1000),
    },
    labels: labelsProp,
  },
  setup(props) {
    const binding = useTable(props.table);
    return (): VNode => {
      const label = withLabels(props.labels);
      const page = binding.page.value;
      const { table } = props;
      const first = page.page <= 1;
      const last = page.page >= page.pageCount;
      const choices = props.pageSizes.includes(page.pageSize) ? props.pageSizes : [...props.pageSizes, page.pageSize].sort((a, b) => a - b);
      return h('nav', { class: 'adt-pagination', 'aria-label': label.pagination }, [
        h('button', { type: 'button', class: 'adt-previous', 'aria-disabled': first ? 'true' : undefined, onClick: () => { if (!first) table.setPage(page.page - 1); } }, label.previous),
        h('span', { class: 'adt-status', 'aria-live': 'polite' }, binding.totalRows.value === undefined
          ? label.pageStatusOpen(page.page) : label.pageStatus(page.page, page.pageCount, page.totalRows)),
        h('button', { type: 'button', class: 'adt-next', 'aria-disabled': last ? 'true' : undefined, onClick: () => { if (!last) table.setPage(page.page + 1); } }, label.next),
        h('label', { class: 'adt-page-size' }, [
          h('span', label.pageSize),
          h('select', { value: String(page.pageSize), onChange: (event: Event) => table.setPageSize(Number((event.target as HTMLSelectElement).value)) },
            choices.map(size => h('option', { value: String(size), key: size, selected: size === page.pageSize }, String(size)))),
        ]),
      ]);
    };
  },
});

/** A labelled search input bound to the global search, debounced; Enter applies at once. */
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
      h('span', withLabels(props.labels).search),
      h('input', {
        type: 'search', autocomplete: 'off', value: text.value, placeholder: props.placeholder,
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
        h('summary', label.columns),
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

/** A bar for the selected rows: "3 selected", action buttons, "Clear selection". Hidden without a selection. */
export const AcunBulkActions = defineComponent({
  name: 'AcunBulkActions',
  props: {
    table: tableProp,
    actions: { type: Array as PropType<readonly BulkAction<never>[]>, required: true as const },
    labels: labelsProp,
  },
  setup(props) {
    const binding = useTable(props.table);
    return (): VNode => {
      const label = withLabels(props.labels);
      const ids = binding.state.value.selectedIds;
      const selection: BulkSelection<unknown> = { ids, rows: props.table.getSelectedRows() };
      return h('div', { class: 'adt-selection', role: 'group', 'aria-label': label.bulkActions, hidden: ids.length === 0 }, [
        h('span', { class: 'adt-selection-count', role: 'status', 'aria-live': 'polite' }, ids.length === 0 ? '' : label.selectedCount(ids.length)),
        ...(props.actions as readonly LooseBulk[]).map(action => {
          const disabled = action.disabled?.(selection) === true;
          return h('button', {
            type: 'button', class: 'adt-bulk-action', 'data-action': action.id, key: action.id,
            'aria-disabled': disabled ? 'true' : undefined,
            onClick: () => { if (!disabled) action.onSelect(selection); },
          }, action.label);
        }),
        h('button', { type: 'button', class: 'adt-clear-selection', onClick: () => props.table.clearSelection() }, label.clearSelection),
      ]);
    };
  },
});
