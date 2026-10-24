import * as Vue from 'vue';
import {
  computed, defineComponent, h, nextTick, onMounted, onScopeDispose, onUpdated, shallowRef, watch,
  type PropType, type SlotsType, type VNode,
} from 'vue';
import { COLUMN_WIDTH_LIMITS, getPageItems, type ColumnDef, type DataTable, type Row } from '@acunsoft/datatable-core';
import {
  cellValue, checkPageSizes, checkResponsive, checkSize, confirmed, filterControls, splitActions, createCellText, ICONS, labelsEn, nextSorting, pageInfoText,
  autoResponsive, cellEditor, checkVirtual, virtualWindow, columnsChanged, columnTools, isEditable, numeric, pageSizeChoices, pinColumns, resetColumns, priorityOf, rangeOf, renderBulkActions, renderFilterChips, renderFilters, renderMenu, rowName, scrollHeight,
  checkFixedColumns, type CellEditor, type EditHandler, type FixedColumns, type MenuItem, type RenderedComponent, type ResponsiveMode, type TableSize,
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
// Vue 3.5+: ids that match between the server render and hydration; 3.4: a counter.
const useId: () => string = (Vue as { useId?: () => string }).useId ?? (() => `vue-${++tables}`);
const tableProp = {
  type: Object as PropType<AnyTable>,
  required: true as const,
  validator: (value: unknown) => typeof (value as AnyTable)?.getPage === 'function' && typeof (value as AnyTable)?.subscribe === 'function',
};
const labelsProp = { type: Object as PropType<Partial<DataTableLabels>>, default: () => ({}) };
const withLabels = (labels: Partial<DataTableLabels>): DataTableLabels => ({ ...labelsEn, ...labels });
// Mounted DOM controls: a new labels object with the same texts is no change.
const labelsKey = (labels: Partial<DataTableLabels>): string => JSON.stringify(labels);
/** Actions or items without their callbacks: a new array of the same entries is no change. */
const shapeOf = (list: readonly object[]): string => JSON.stringify(list, (_, value: unknown) => (typeof value === 'function' ? true : value));
/** Entries whose callbacks call the latest entry with the same ID, so a mounted control needs no re-mount. */
const following = <T extends { readonly id: string }>(list: readonly T[], latest: () => readonly T[]): T[] => list.map(entry => Object.fromEntries(
  Object.entries(entry).map(([key, value]) => [key, typeof value === 'function'
    ? (...args: unknown[]) => (latest().find(next => next.id === entry.id) as Record<string, ((...args: unknown[]) => unknown) | undefined> | undefined)?.[key]?.(...args)
    : value]),
) as T);

/** What a cell slot receives. */
export interface CellSlotProps {
  readonly column: AnyColumn;
  readonly row: AnyRow;
  /** The raw value from the accessor. */
  readonly value: unknown;
  /** The default display text. */
  readonly text: string;
}

/** What the `detail` slot (a row's child row) receives. */
export interface DetailSlotProps {
  readonly row: AnyRow;
}

/**
 * An accessible `<table>` for a `createDataTable` table, with the same markup
 * and `adt-*` classes as `@acunsoft/datatable-dom` (so its `styles.css`
 * applies): sort buttons with `aria-sort`, Shift+click multi-sort, row and
 * page checkboxes, row actions named after the row, `data-label` for the
 * narrow-screen layout, loading and error states from a `status` source.
 *
 * Slots: `cell` and `cell-<columnId>` (`{ column, row, value, text }`) for
 * custom cells, `empty` for the empty state, `detail` (`{ row }`) for child rows. Slot content is rendered by Vue,
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
    /** Narrow screens: `cards` (default; `scroll` with `virtual`), `scroll`, `collapse`, `modal` or `auto` (measured); see `ColumnDef.priority`. */
    responsive: {
      type: String as PropType<ResponsiveMode>, default: undefined,
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
    /** Placeholder rows while a `status` source loads the first rows. Default `true`. */
    skeleton: { type: Boolean, default: true },
    /**
     * Save a cell edited in place (columns with `editable`); see
     * `@acunsoft/datatable-dom`'s `onEdit`. Update your data once saved.
     */
    onEdit: { type: Function as PropType<EditHandler<never>>, default: undefined },
    /**
     * Scroll through every matching row of a local table instead of pages
     * (DataTables Scroller): only the rows in view are drawn. `true` or
     * `{ rowHeight, overscan }`; the height is `scrollY` (default 480px).
     */
    virtual: {
      type: [Boolean, Object] as PropType<boolean | { rowHeight?: number; overscan?: number }>, default: false,
      validator: (value: unknown) => { try { checkVirtual(value); return true; } catch { return false; } },
    },
    /** Drag a header's edge (or ←/→ on it) to set the column's width. */
    resizableColumns: { type: Boolean, default: false },
    /** Drag a header onto another to move the column. */
    reorderableColumns: { type: Boolean, default: false },
    /** Columns that stay while the table scrolls sideways: `{ start: 1, end: 1 }` (DataTables `fixedColumns`). */
    fixedColumns: {
      type: Object as PropType<FixedColumns>, default: undefined,
      validator: (value: unknown) => { try { checkFixedColumns(value); return true; } catch { return false; } },
    },
    /** A fixed height to scroll inside, header in place (DataTables `scrollY`): `'60vh'`, `480`. */
    scrollY: {
      type: [String, Number] as PropType<string | number>, default: undefined,
      validator: (value: unknown) => { try { scrollHeight(value); return true; } catch { return false; } },
    },
  },
  /**
   * Slots: `cell` / `cell-{id}` for custom cells, `empty`, and `detail`
   * (`{ row }`): a child row under each row, opened by a ⊕ button
   * (DataTables child rows; in the dialog with `responsive="modal"`).
   * The slot renders only while its row is open, so a component inside it
   * can load its own data when it mounts.
   */
  slots: Object as SlotsType<{ cell: CellSlotProps; empty: Record<string, never>; detail: DetailSlotProps; [name: `cell-${string}`]: CellSlotProps }>,
  setup(props, { slots }) {
    const binding = useTable(() => props.table);
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
    const uid = `adt-${useId()}`;
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
        if (!event.composedPath().includes(menu)) menu.open = false;
      });
    };
    onMounted(() => document.addEventListener('click', closeMenus));
    // Fixed columns: sticky offsets measured after every render.
    let unpin: (() => void) | undefined;
    watch([wrapEl, () => props.fixedColumns?.start, () => props.fixedColumns?.end], ([node]) => {
      unpin?.();
      unpin = node && props.fixedColumns ? pinColumns(node, props.fixedColumns) : undefined;
    }, { flush: 'post' });
    onScopeDispose(() => unpin?.());
    // Resizing and moving: one listener set on the wrapper, whatever is re-rendered inside.
    let stopTools: (() => void) | undefined;
    watch([wrapEl, () => props.resizableColumns, () => props.reorderableColumns, () => props.table], ([node]) => {
      stopTools?.();
      stopTools = node && (props.resizableColumns || props.reorderableColumns)
        ? columnTools(node, props.table, { resize: props.resizableColumns, reorder: props.reorderableColumns })
        : undefined;
    }, { flush: 'post' });
    onScopeDispose(() => stopTools?.());
    // Virtual tables scroll sideways on narrow screens unless told otherwise.
    const responsiveMode = computed(() => checkResponsive(props.responsive ?? (props.virtual ? 'scroll' : undefined)));
    // responsive="auto": columns hidden while the table does not fit, measured after every render.
    let stopAuto: (() => void) | undefined;
    watch([wrapEl, responsiveMode], ([node, mode]) => {
      stopAuto?.();
      stopAuto = node && mode === 'auto' ? autoResponsive(node) : undefined;
    }, { flush: 'post' });
    onScopeDispose(() => stopAuto?.());
    // Virtual scrolling: the scroll position and the measured row height decide the rows drawn.
    const scrollTop = shallowRef(0);
    const viewport = shallowRef(480);
    const measuredRow = shallowRef(0);
    let frame = 0;
    const onScroll = (event: Event): void => {
      const node = event.currentTarget as HTMLElement;
      if (frame) return;
      frame = requestAnimationFrame(() => { frame = 0; scrollTop.value = node.scrollTop; viewport.value = node.clientHeight || viewport.value; });
    };
    // The viewport is measured once mounted and follows resizes where ResizeObserver exists.
    let stopViewport: (() => void) | undefined;
    watch([wrapEl, () => Boolean(props.virtual)], ([node, on]) => {
      stopViewport?.();
      stopViewport = undefined;
      const scroller = on ? node?.querySelector<HTMLElement>('.adt-scroll') : null;
      if (!scroller) return;
      const measure = (): void => { if (scroller.clientHeight > 0) viewport.value = scroller.clientHeight; };
      measure();
      const view = scroller.ownerDocument.defaultView as (Window & typeof globalThis) | null;
      if (typeof view?.ResizeObserver !== 'function') return;
      const observer = new view.ResizeObserver(measure);
      observer.observe(scroller);
      stopViewport = () => observer.disconnect();
    }, { flush: 'post' });
    onScopeDispose(() => stopViewport?.());
    // Without rowHeight: the first drawn row is measured once, on mount or the first render with rows.
    const measureRow = (): void => {
      if (!props.virtual || measuredRow.value) return;
      const row = wrapEl.value?.querySelector<HTMLElement>('tbody .adt-row');
      const height = row?.getBoundingClientRect().height ?? 0;
      if (height > 0) measuredRow.value = height;
    };
    onMounted(measureRow);
    onUpdated(measureRow);
    // Editing in place: the shared editor is mounted into the editing cell, which Vue leaves empty.
    const editing = shallowRef<{ rowId: string; columnId: string } | undefined>();
    let editor: (CellEditor & { rowId: string; columnId: string }) | undefined;
    const closeEditor = (): void => { editor?.destroy(); editor = undefined; };
    // The rows an edit can be in: the page, or every matching row when scrolled virtually.
    const editRows = (): readonly AnyRow[] => (props.virtual ? props.table.getFilteredRows() : binding.page.value.rows);
    const mountEditor = (): void => {
      const target = editing.value;
      if (!target) return closeEditor();
      const host = wrapEl.value?.querySelector('td[data-adt-edit-host]');
      if (editor && editor.rowId === target.rowId && editor.columnId === target.columnId) {
        // A re-created cell gets the editor back; a row only scrolled out of view keeps it for when it comes back.
        if (host) { if (!host.contains(editor.element)) host.append(editor.element); return; }
        if (props.virtual && editRows().some(row => row.id === target.rowId)) return;
        closeEditor();
        editing.value = undefined;
        return;
      }
      closeEditor();
      const row = editRows().find(candidate => candidate.id === target.rowId);
      const column = props.table.getColumns().find(candidate => candidate.id === target.columnId);
      if (!row || !column || !host || !props.onEdit) { editing.value = undefined; return; }
      const focusKey = `${row.id}:${column.id}`;
      const mounted = cellEditor(host.ownerDocument, {
        row, column, value: cellValue(column, row), labels: labels.value, onEdit: props.onEdit as EditHandler<unknown>,
        onClose: () => {
          if (editor !== created) return;
          closeEditor();
          editing.value = undefined;
          void nextTick(() => wrapEl.value?.querySelector<HTMLElement>(`.adt-edit[data-edit-key="${CSS.escape(focusKey)}"]`)?.focus());
        },
      });
      const created = Object.assign(mounted, { rowId: row.id, columnId: column.id });
      editor = created;
      host.append(mounted.element);
      mounted.focus();
    };
    onUpdated(mountEditor);
    onScopeDispose(closeEditor);
    onScopeDispose(() => { if (typeof document !== 'undefined') document.removeEventListener('click', closeMenus); });
    // Close the dialog when its row leaves the page (scrolled virtually: the matching rows).
    watch(() => binding.page.value, page => {
      const rows = props.virtual ? props.table.getFilteredRows() : page.rows;
      if (dialogRow.value !== undefined && !rows.some(row => row.id === dialogRow.value)) closeDialog();
    });

    return (): VNode => {
      const { table } = props;
      const responsive = responsiveMode.value;
      const collapsible = responsive === 'collapse' || responsive === 'modal' || responsive === 'auto';
      const detailSlot = slots.detail as ((props: DetailSlotProps) => VNode[]) | undefined; // absent unless given
      const expandable = collapsible || detailSlot !== undefined;
      const state = binding.state.value;
      const page = binding.page.value;
      const columns = binding.visibleColumns.value;
      const virtual = checkVirtual(props.virtual);
      if (virtual && table.getMode() === 'server') throw new TypeError('virtual scrolling needs a local table; use cursor paging for server tables');
      const all = virtual ? table.getFilteredRows() : undefined;
      const view = all ? virtualWindow(all.length, virtual!.rowHeight || measuredRow.value, scrollTop.value, viewport.value, virtual!.overscan) : undefined;
      const rows = all && view ? all.slice(view.start, view.end) : page.rows;
      // With virtual scrolling "all" is every matching row, not only those drawn.
      const pageIds = (all ?? page.rows).map(row => row.id);
      const actions = props.rowActions as readonly LooseAction[];
      const rowLabel = props.rowLabel as ((row: AnyRow) => string) | undefined;
      const label = labels.value;

      const head: VNode[] = [];
      const levels = new Set(columns.map((column, index) => priorityOf(column, index)));
      if (actions.length > 0) levels.add(2);
      const level = (column: AnyColumn): string => (collapsible ? ` adt-col--p${priorityOf(column, columns.indexOf(column))}` : '');
      if (expandable) head.push(h('td', { class: 'adt-expand-cell', key: '__expand' }));
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
        const width = state.columnWidths[column.id];
        head.push(h('th', {
          scope: 'col', class: `adt-th${level(column)}${numeric(column) ? ' adt-num' : ''}`, key: column.id,
          'aria-sort': primary?.field === column.id ? (primary.direction === 'asc' ? 'ascending' : 'descending') : undefined,
          'data-column-id': column.id, draggable: props.reorderableColumns ? 'true' : undefined,
          style: width !== undefined ? { width: `${width}px` } : undefined,
        }, [
          column.enableSorting
            ? h('button', {
              type: 'button', class: rule ? `adt-sort adt-sort--${rule.direction}` : 'adt-sort',
              onClick: (event: MouseEvent) => table.setSorting(nextSorting(table.getState().sorting, column.id, event.shiftKey && props.multiSort)),
            }, [column.header, h('span', { class: 'adt-sort-mark', 'aria-hidden': 'true' },
              rule ? `${rule.direction === 'asc' ? '▲' : '▼'}${state.sorting.length > 1 ? index + 1 : ''}` : '')])
            : column.header,
          props.resizableColumns
            ? h('span', {
              class: 'adt-resize', role: 'separator', 'aria-orientation': 'vertical', tabindex: 0,
              'aria-label': label.resizeColumn(column.header), 'data-column-id': column.id,
              'aria-valuemin': COLUMN_WIDTH_LIMITS.min, 'aria-valuemax': COLUMN_WIDTH_LIMITS.max, 'aria-valuenow': width,
            })
            : null,
        ]));
      }
      if (actions.length > 0) {
        head.push(h('th', { scope: 'col', class: `adt-th adt-actions${collapsible ? ' adt-col--p2' : ''}`, key: '__actions' }, label.actions));
      }
      const span = columns.length + (props.selectable ? 1 : 0) + (actions.length > 0 ? 1 : 0) + (expandable ? 1 : 0);
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
          return [h('div', { class: all ? 'adt-detail-item' : `adt-detail-item adt-col--p${priority}`, key: column.id, 'data-column-id': column.id }, [
            h('dt', column.header), h('dd', contentOf(column, row, texts[index]!) as never),
          ])];
        }),
        actions.length > 0
          ? h('div', { class: all ? 'adt-detail-item' : 'adt-detail-item adt-col--p2', key: '__actions', 'data-column-id': '__actions' }, [
            h('dt', label.actions), h('dd', { class: 'adt-detail-actions' }, actionButtons(row, name, Infinity)),
          ])
          : null,
      ]);

      const body: VNode[] = [];
      // Placeholder rows while the first rows of a remote table load.
      const skeleton = props.skeleton && props.status !== undefined && phase.value === 'loading' && page.rows.length === 0;
      if (skeleton) {
        for (let index = 0; index < Math.min(state.pageSize, SKELETON_ROWS); index++) {
          body.push(h('tr', { class: 'adt-row adt-skeleton-row', key: `__skeleton${index}` }, [
            expandable ? h('td', { class: 'adt-expand-cell' }) : null,
            props.selectable ? h('td', { class: 'adt-select' }) : null,
            ...columns.map((column, columnIndex) => h('td', {
              'data-label': column.header, key: column.id,
              class: [collapsible ? `adt-col--p${priorityOf(column, columnIndex)}` : '', numeric(column) ? 'adt-num' : ''].filter(Boolean).join(' ') || undefined,
            }, [h('span', { class: 'adt-skeleton' })])),
            actions.length > 0 ? h('td', { class: collapsible ? 'adt-actions adt-col--p2' : 'adt-actions' }) : null,
          ]));
        }
      } else if (rows.length === 0) {
        body.push(h('tr', { class: 'adt-empty', key: '__empty' }, [h('td', { colspan: span }, slots.empty ? slots.empty({}) : label.empty)]));
      }
      let dialogContent: VNode[] | undefined;
      const spacer = (pixels: number, key: string): VNode => h('tr', { class: 'adt-spacer', 'aria-hidden': 'true', key }, [h('td', { colspan: span, style: { height: `${pixels}px` } })]);
      if (view && view.before > 0) body.push(spacer(view.before, '__before'));
      rows.forEach((row, rowIndex) => {
        const texts = columns.map(column => text.value(column, row));
        const name = rowName(row, texts[0] ?? '', rowLabel);
        const selected = table.isSelected(row.id);
        const open = responsive !== 'modal' && expanded.value.has(row.id);
        const detailId = `${uid}-detail-${rowIndex}`;
        const cells: VNode[] = [];
        if (expandable) {
          cells.push(h('td', { class: 'adt-expand-cell', key: '__expand' }, [h('button', {
            type: 'button', class: 'adt-expand', 'aria-label': label.details(name), 'data-row': row.id,
            ...(responsive !== 'modal' ? { 'aria-expanded': String(open), 'aria-controls': detailId } : { 'aria-haspopup': 'dialog' }),
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
            detailSlot ? h('div', { class: 'adt-detail-content' }, detailSlot({ row })) : null,
          ].filter((node): node is VNode => node !== null);
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
          const editable = props.onEdit !== undefined && isEditable(column);
          const isEditing = editable && editing.value?.rowId === row.id && editing.value.columnId === column.id;
          const start = (): void => { editing.value = { rowId: row.id, columnId: column.id }; };
          cells.push(h('td', {
            'data-label': column.header, key: column.id,
            class: [collapsible ? `adt-col--p${priorityOf(column, index)}` : '', numeric(column) ? 'adt-num' : '',
              editable ? 'adt-editable' : '', isEditing ? 'adt-editing' : ''].filter(Boolean).join(' ') || undefined,
            'data-adt-edit-host': isEditing ? '' : undefined,
            onDblclick: editable && !isEditing
              ? (event: MouseEvent) => { if (!(event.target as Element).closest('a, button, input, select')) start(); }
              : undefined,
          }, isEditing ? undefined : [
            contentOf(column, row, texts[index]!) as never,
            editable
              ? h('button', {
                type: 'button', class: 'adt-edit', 'aria-label': label.editCell(column.header, name),
                'data-edit-key': `${row.id}:${column.id}`, onClick: start,
              }, [iconNode('edit')])
              : null,
          ]));
        });
        if (actions.length > 0) {
          cells.push(h('td', {
            class: collapsible ? 'adt-actions adt-col--p2' : 'adt-actions', 'data-label': label.actions, key: '__actions',
          }, actionButtons(row, name)));
        }
        const rowClass = ['adt-row', selected ? 'adt-row--selected' : '', open ? 'adt-row--expanded' : ''].filter(Boolean).join(' ');
        body.push(h('tr', { class: rowClass, 'data-row-id': row.id, key: row.id, 'aria-rowindex': view ? view.start + rowIndex + 2 : undefined }, cells));
        if (open) {
          body.push(h('tr', { class: 'adt-detail', id: detailId, key: `${row.id}__detail` }, [
            h('td', { colspan: span }, [
              responsive === 'collapse' || responsive === 'auto' ? detailList(row, texts, name, false) : null,
              detailSlot ? h('div', { class: 'adt-detail-content' }, detailSlot({ row })) : null,
            ]),
          ]));
        }
      });
      if (view && view.after > 0) body.push(spacer(view.after, '__after'));

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
      const height = scrollHeight(props.scrollY) ?? (virtual ? '480px' : undefined);
      const wrapClass = ['adt-table-wrap', `adt-responsive--${responsive}`, props.size === 'md' ? '' : `adt-size--${props.size}`,
        props.stickyHeader ? 'adt-sticky-header' : '', height ? 'adt-scroll-y' : '', busy ? 'adt-loading' : '', skeleton ? 'adt-skeleton-on' : '', virtual ? 'adt-virtual' : ''].filter(Boolean).join(' ');
      const tableClass = ['adt-table', collapsible && levels.has(2) ? 'adt-has-p2' : '', collapsible && levels.has(3) ? 'adt-has-p3' : '', detailSlot ? 'adt-has-detail' : '',
        Object.keys(state.columnWidths).length > 0 ? 'adt-fixed-layout' : '']
        .filter(Boolean).join(' ');
      return h('div', { ref: wrapEl, class: wrapClass, style: height ? { '--adt-scroll-y': height } : undefined, 'aria-busy': props.status ? String(busy) : undefined }, [
        notice,
        h('div', { class: 'adt-scroll', onScroll: virtual ? onScroll : undefined }, [h('table', { class: tableClass, 'aria-rowcount': all ? all.length + 1 : undefined }, [
          props.caption !== undefined ? h('caption', props.caption) : null,
          h('thead', [h('tr', head)]),
          h('tbody', skeleton ? { 'aria-hidden': 'true' } : null, body),
          // Footer totals of the columns with `aggregate` (every matching row).
          columns.some(column => column.aggregate !== undefined) ? h('tfoot', [h('tr', { class: 'adt-total' }, (() => {
            const totals = table.getAggregates();
            const cells: VNode[] = [];
            if (expandable) cells.push(h('td', { class: 'adt-expand-cell' }));
            if (props.selectable) cells.push(h('td', { class: 'adt-select' }));
            columns.forEach((column, index) => {
              const result = totals[column.id];
              const cellClass = [collapsible ? `adt-col--p${priorityOf(column, index)}` : '', result ? 'adt-num' : ''].filter(Boolean).join(' ') || undefined;
              cells.push(index === 0 && !result
                ? h('th', { scope: 'row', class: cellClass, 'data-label': column.header, key: column.id }, label.totals)
                : h('td', { class: cellClass, key: column.id, 'data-label': result ? `${column.header} · ${label.aggregate(result.aggregate)}` : column.header, title: result ? label.aggregate(result.aggregate) : undefined }, text.value.total(column, result)));
            });
            if (actions.length > 0) cells.push(h('td', { class: collapsible ? 'adt-actions adt-col--p2' : 'adt-actions' }));
            return cells;
          })())]) : null,
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

/** Placeholder rows while the first rows load: as many as a page, at most this many. */
const SKELETON_ROWS = 10;

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
    const binding = useTable(() => props.table);
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
    const binding = useTable(() => props.table);
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
  props: {
    table: tableProp, labels: labelsProp,
    /** Count every matching row as shown (virtual scrolling). */
    all: { type: Boolean, default: false },
  },
  setup(props) {
    const binding = useTable(() => props.table);
    return (): VNode => {
      void binding.page.value; // re-render on every table change
      return h('div', { class: 'adt-info', 'aria-live': 'polite', 'aria-atomic': 'true' }, pageInfoText(props.table, withLabels(props.labels), props.all));
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
    const binding = useTable(() => props.table);
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
  props: {
    table: tableProp, labels: labelsProp,
    /** Up/down buttons per column to change the order with the keyboard. */
    reorderable: { type: Boolean, default: false },
  },
  setup(props) {
    const binding = useTable(() => props.table);
    return (): VNode => {
      const label = withLabels(props.labels);
      const { hiddenColumns: hidden, columnOrder } = binding.state.value;
      const columns = props.table.getColumns();
      const byId = new Map(columns.map(column => [column.id, column]));
      const lastVisible = columns.length - hidden.length === 1;
      return h('details', { class: 'adt-columns' }, [
        h('summary', [iconNode('columns'), label.columns]),
        h('fieldset', [h('legend', label.showColumns), ...columnOrder.map((id, index) => {
          const column = byId.get(id)!;
          const shown = !hidden.includes(id);
          const checkbox = h('label', props.reorderable ? {} : { key: id }, [
            h('input', {
              type: 'checkbox', value: id, checked: shown,
              disabled: column.enableHiding === false || (lastVisible && shown),
              onChange: (event: Event) => props.table.setColumnVisibility(id, (event.target as HTMLInputElement).checked),
            }),
            h('span', column.header),
          ]);
          if (!props.reorderable) return checkbox;
          const move = (direction: 'up' | 'down'): VNode => {
            const to = direction === 'up' ? index - 1 : index + 1;
            const disabled = to < 0 || to >= columnOrder.length;
            return h('button', {
              type: 'button', class: 'adt-move', 'aria-disabled': disabled ? 'true' : undefined,
              'aria-label': direction === 'up' ? label.moveColumnUp(column.header) : label.moveColumnDown(column.header),
              onClick: () => { if (!disabled) props.table.moveColumn(id, to); },
            }, [iconNode(direction)]);
          };
          return h('div', { class: 'adt-column-item', key: id }, [checkbox, move('up'), move('down')]);
        }), columnsChanged(props.table)
          ? h('button', { type: 'button', class: 'adt-columns-reset', onClick: () => resetColumns(props.table) }, label.resetColumns)
          : null]),
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
    const latest = (): readonly BulkAction<unknown>[] => props.actions as readonly BulkAction<unknown>[];
    const mount = (): void => {
      part?.destroy();
      if (host.value) part = renderBulkActions(host.value, props.table, { actions: following(latest(), latest), labels: withLabels(props.labels) });
    };
    onMounted(mount);
    // Mounted once per table, actions and labels: a parent re-render keeps focus in the bar.
    watch([() => props.table, () => shapeOf(props.actions), () => labelsKey(props.labels)], mount);
    onScopeDispose(() => part?.destroy());
    return (): VNode => h('div', { ref: host, class: 'adt-feature' });
  },
});

/** Mount a DOM-renderer control in a wrapper element, again for a new table, labels or locale. */
function domControl(name: string, render: (el: HTMLElement, props: { table: AnyTable; labels: Partial<DataTableLabels>; locale: string }) => RenderedComponent) {
  return defineComponent({
    name,
    props: { table: tableProp, labels: labelsProp, locale: { type: String, default: 'en' } },
    setup(props) {
      const host = shallowRef<HTMLElement | null>(null);
      let part: RenderedComponent | undefined;
      const mount = (): void => {
        part?.destroy();
        if (host.value) part = render(host.value, { table: props.table, labels: withLabels(props.labels), locale: props.locale });
      };
      onMounted(mount);
      watch([() => props.table, () => labelsKey(props.labels), () => props.locale], mount);
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
    const latest = (): readonly MenuItem[] => props.items;
    const mount = (): void => {
      part?.destroy();
      if (host.value) part = renderMenu(host.value, { items: following(latest(), latest), labels: withLabels(props.labels), ...(props.label ? { label: props.label } : {}) });
    };
    onMounted(mount);
    // Mounted once per items, label and labels: a parent re-render keeps the menu open.
    watch([() => shapeOf(props.items), () => props.label, () => labelsKey(props.labels)], mount);
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
    /** Drag headers to move columns; the column menu gets up/down buttons. */
    reorderableColumns: { type: Boolean, default: false },
    /** Scroll through every matching row instead of pages (see `AcunDataTable`). */
    virtual: { type: [Boolean, Object] as PropType<boolean | { rowHeight?: number; overscan?: number }>, default: false },
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
      const tableSlots = Object.fromEntries(Object.entries(slots).filter(([name]) => name === 'cell' || name === 'empty' || name === 'detail' || name.startsWith('cell-')));
      const bar = (position: 'top' | 'bottom', start: (VNode | null | VNode[] | undefined)[], end: (VNode | null | VNode[] | undefined)[]): VNode =>
        h('div', { class: `adt-bar adt-${position}` }, [h('div', { class: 'adt-bar-start' }, start.flat()), h('div', { class: 'adt-bar-end' }, end.flat())]);
      return h('div', { class: props.size === 'md' ? 'adt' : `adt adt-size--${props.size}` }, [
        bar('top', [
          props.virtual ? null : h(AcunPageSize, { ...common, pageSizes: props.pageSizes }),
          props.search ? h('div', { class: 'adt-feature adt-feature--search' }, [h(AcunSearch, { ...common, debounceMs: props.debounceMs, ...(props.searchPlaceholder !== undefined ? { placeholder: props.searchPlaceholder } : {}) })]) : null,
          slots['top-start']?.(),
        ], [
          slots['top-end']?.(),
          hasFilters ? h(AcunFilters, { ...common, locale: props.locale }) : null,
          props.columnToggle ? h(AcunColumnToggle, { ...common, reorderable: props.reorderableColumns }) : null,
          props.tools.length > 0 ? h(AcunTools, { items: props.tools, labels: props.labels }) : null,
        ]),
        hasFilters ? h(AcunFilterChips, { ...common, locale: props.locale }) : null,
        props.bulkActions.length > 0 ? h(AcunBulkActions, { ...common, actions: props.bulkActions }) : null,
        h(AcunDataTable, { ...attrs, ...common, locale: props.locale, reorderableColumns: props.reorderableColumns, virtual: props.virtual }, tableSlots),
        bar('bottom', [h(AcunPageInfo, { ...common, all: Boolean(props.virtual) }), slots['bottom-start']?.()],
          [slots['bottom-end']?.(), props.virtual ? null : h(AcunPagination, { ...common, ...props.paging, locale: props.locale })]),
      ]);
    };
  },
});
