import {
  createElement as h, useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore,
  type ChangeEvent, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode,
} from 'react';
import { getPageItems, type ColumnDef, type DataTable, type Row } from '@acunsoft/datatable-core';
import {
  cellValue, checkPageSizes, checkResponsive, checkSize, createCellText, ICONS, labelsEn, nextSorting, pageInfoText,
  numeric, pageSizeChoices, priorityOf, rowName, type ResponsiveMode, type TableSize,
  type BulkAction, type BulkSelection, type CellFormatter, type DataTableLabels, type RowAction, type StatusSource,
} from '@acunsoft/datatable-dom';
import { useTable } from './hooks.js';

/** Controls that do not touch rows accept a table of any row type. */
type AnyTable = DataTable<any>;

const withLabels = (labels?: Partial<DataTableLabels>): DataTableLabels => ({ ...labelsEn, ...labels });

/** What a custom cell renderer receives. */
export interface CellRenderProps<TData> {
  readonly column: ColumnDef<TData>;
  readonly row: Row<TData>;
  /** The raw value from the accessor. */
  readonly value: unknown;
  /** The default display text. */
  readonly text: string;
}

export interface DataTableProps<TData> {
  readonly table: DataTable<TData>;
  readonly caption?: string;
  readonly selectable?: boolean;
  /** Locale for default number and date text. Default `'en'`. */
  readonly locale?: string;
  readonly labels?: Partial<DataTableLabels>;
  /** Plain-text formatters per column ID. */
  readonly format?: Readonly<Record<string, CellFormatter<TData>>>;
  /** Custom cells per column ID, e.g. `{ status: ({ value }) => h(Badge, { value }) }`. */
  readonly cells?: Readonly<Record<string, (props: CellRenderProps<TData>) => ReactNode>>;
  /** Shown instead of the default empty text. */
  readonly empty?: ReactNode;
  readonly rowLabel?: (row: Row<TData>) => string;
  readonly rowActions?: readonly RowAction<TData>[];
  /** Server mode: loading and error states, e.g. the HTTP package's runner. */
  readonly status?: StatusSource;
  /** Narrow screens: `cards` (default), `scroll`, `collapse` or `modal`; see `ColumnDef.priority`. */
  readonly responsive?: ResponsiveMode;
  /** Density: `sm`, `md` (default) or `lg`. */
  readonly size?: TableSize;
}

const noStatus = (): (() => void) => () => undefined;

/** Read only the phase: sources may return a new object from `getState()` every time. */
function useStatus(status: StatusSource | undefined): string {
  const subscribe = useCallback(
    (onChange: () => void) => (status ? status.subscribe(() => onChange()) : noStatus()),
    [status],
  );
  const read = (): string => status?.getState().status ?? 'idle';
  return useSyncExternalStore(subscribe, read, read);
}

/**
 * An accessible `<table>` for a `createDataTable` table, with the same markup
 * and `adt-*` classes as `@acunsoft/datatable-dom` (its `styles.css` applies):
 * sort buttons with `aria-sort`, Shift+click multi-sort, row and page
 * checkboxes, row actions named after the row, `data-label` for the
 * narrow-screen layout and server-mode states. Custom cells are React
 * elements, escaped by React unless you use `dangerouslySetInnerHTML`.
 */
export function DataTable<TData>(props: DataTableProps<TData>): ReactElement {
  const { table, selectable = false, locale = 'en', rowActions = [] } = props;
  const { state, page, visibleColumns: columns } = useTable(table);
  const labels = withLabels(props.labels);
  const text = useMemo(
    () => createCellText(table.getColumns(), { locale, labels, ...(props.format ? { format: props.format } : {}) }),
    // `labels` is a new object every render; only its yes/no texts matter here.
    [table, locale, props.format, labels.yes, labels.no],
  );
  const phase = useStatus(props.status);
  const pageIds = page.rows.map(row => row.id);
  const pageStatus = table.getSelectionStatus(pageIds);
  const selectAll = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (selectAll.current) selectAll.current.indeterminate = pageStatus === 'some';
  });
  const responsive = checkResponsive(props.responsive);
  const size = checkSize(props.size);
  const collapsible = responsive === 'collapse' || responsive === 'modal';
  const uid = useId();
  // Responsive collapse: open rows. Modal: the row shown in the dialog.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [dialogRow, setDialogRow] = useState<string | undefined>();
  const dialog = useRef<HTMLDialogElement>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const dialogVisible = dialogRow !== undefined && pageIds.includes(dialogRow);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (dialogVisible && !node.open) {
      if (typeof node.showModal === 'function') node.showModal();
      else node.setAttribute('open', '');
    } else if (!dialogVisible && node.open) {
      if (typeof node.close === 'function') node.close();
      else node.removeAttribute('open');
    }
  }, [dialogVisible]);
  const closeDialog = (): void => {
    const node = dialog.current;
    if (node?.open && typeof node.close === 'function') node.close();
    else node?.removeAttribute('open');
  };
  const onDialogClose = (): void => {
    const id = dialogRow;
    setDialogRow(undefined);
    // Back to the row's button (Safari does not focus a clicked button).
    [...(wrap.current?.querySelectorAll<HTMLElement>('.adt-expand') ?? [])].find(button => button.dataset['row'] === id)?.focus();
  };
  const levels = new Set(columns.map((column, index) => priorityOf(column, index)));
  if (rowActions.length > 0) levels.add(2);
  const span = columns.length + (selectable ? 1 : 0) + (rowActions.length > 0 ? 1 : 0) + (collapsible ? 1 : 0);
  const actionButtons = (row: Row<TData>, name: string): ReactNode[] => rowActions.filter(action => action.hidden?.(row) !== true).map(action => {
    const disabled = action.disabled?.(row) === true;
    return h('button', {
      type: 'button', className: 'adt-action', 'data-action': action.id, key: action.id,
      'aria-label': labels.rowAction(action.label, name), 'aria-disabled': disabled ? 'true' : undefined,
      onClick: () => { if (!disabled) action.onSelect(row); },
    }, action.label);
  });
  const contentOf = (column: ColumnDef<TData>, row: Row<TData>, value: string): ReactNode => {
    const render = props.cells?.[column.id];
    return render ? render({ column, row, value: cellValue(column, row), text: value }) : value;
  };
  // The values of a row: all of them (dialog) or only those a narrow screen hides (details row).
  const detailList = (row: Row<TData>, texts: readonly string[], name: string, all: boolean): ReactElement => h('dl', { className: 'adt-detail-list' },
    ...columns.flatMap((column, index) => {
      const priority = priorityOf(column, index);
      if (!all && priority === 1) return [];
      return [h('div', { className: all ? 'adt-detail-item' : `adt-detail-item adt-col--p${priority}`, key: column.id },
        h('dt', null, column.header), h('dd', null, contentOf(column, row, texts[index]!)))];
    }),
    rowActions.length > 0
      ? h('div', { className: all ? 'adt-detail-item' : 'adt-detail-item adt-col--p2', key: '__actions' },
        h('dt', null, labels.actions), h('dd', { className: 'adt-detail-actions' }, actionButtons(row, name)))
      : null);

  const head: ReactNode[] = [];
  if (collapsible) head.push(h('td', { className: 'adt-expand-cell', key: '__expand' }));
  if (selectable) {
    head.push(h('th', { scope: 'col', className: 'adt-select', key: '__select' },
      table.getSelectionMode() === 'multiple' && pageIds.length > 0
        ? h('input', {
          type: 'checkbox', ref: selectAll, 'aria-label': labels.selectAll, checked: pageStatus === 'all',
          onChange: () => (table.getSelectionStatus(pageIds) === 'all'
            ? table.setSelectedRows(table.getState().selectedIds.filter(id => !pageIds.includes(id)))
            : table.selectRows(pageIds)),
        })
        : null));
  }
  const primary = state.sorting[0];
  for (const column of columns) {
    const index = state.sorting.findIndex(rule => rule.field === column.id);
    const rule = state.sorting[index];
    head.push(h('th', {
      scope: 'col', key: column.id,
      className: `adt-th${collapsible ? ` adt-col--p${priorityOf(column, columns.indexOf(column))}` : ''}${numeric(column) ? ' adt-num' : ''}`,
      'aria-sort': primary?.field === column.id ? (primary.direction === 'asc' ? 'ascending' : 'descending') : undefined,
    }, column.enableSorting
      ? h('button', {
        type: 'button', className: rule ? `adt-sort adt-sort--${rule.direction}` : 'adt-sort',
        onClick: (event: MouseEvent) => table.setSorting(nextSorting(table.getState().sorting, column.id, event.shiftKey)),
      }, column.header, h('span', { className: 'adt-sort-mark', 'aria-hidden': 'true' },
        rule ? `${rule.direction === 'asc' ? '▲' : '▼'}${state.sorting.length > 1 ? index + 1 : ''}` : ''))
      : column.header));
  }
  if (rowActions.length > 0) {
    head.push(h('th', { scope: 'col', className: collapsible ? 'adt-th adt-actions adt-col--p2' : 'adt-th adt-actions', key: '__actions' }, labels.actions));
  }

  const body: ReactNode[] = [];
  if (page.rows.length === 0) {
    body.push(h('tr', { className: 'adt-empty', key: '__empty' }, h('td', { colSpan: span }, props.empty ?? labels.empty)));
  }
  let dialogContent: ReactNode[] = [];
  page.rows.forEach((row, rowIndex) => {
    const texts = columns.map(column => text(column, row));
    const name = rowName(row, texts[0] ?? '', props.rowLabel);
    const selected = table.isSelected(row.id);
    const open = responsive === 'collapse' && expanded.has(row.id);
    const detailId = `${uid}-detail-${rowIndex}`;
    const cells: ReactNode[] = [];
    if (collapsible) {
      cells.push(h('td', { className: 'adt-expand-cell', key: '__expand' }, h('button', {
        type: 'button', className: 'adt-expand', 'aria-label': labels.details(name), 'data-row': row.id,
        ...(responsive === 'collapse' ? { 'aria-expanded': open, 'aria-controls': detailId } : { 'aria-haspopup': 'dialog' as const }),
        onClick: () => {
          if (responsive === 'modal') return setDialogRow(row.id);
          setExpanded(current => {
            const next = new Set(current);
            if (!next.delete(row.id)) next.add(row.id);
            return next;
          });
        },
      }, icon(open ? 'collapse' : 'expand'))));
    }
    if (dialogRow === row.id) {
      dialogContent = [
        h('div', { className: 'adt-dialog-head', key: 'head' },
          h('h2', { className: 'adt-dialog-title', id: `${uid}-dialog-title` }, labels.details(name)),
          h('button', { type: 'button', className: 'adt-dialog-close', 'aria-label': labels.close, onClick: closeDialog }, icon('close'))),
        h('div', { key: 'body' }, detailList(row, texts, name, true)),
      ];
    }
    if (selectable) {
      cells.push(h('td', { className: 'adt-select', key: '__select' }, h('input', {
        type: 'checkbox', 'aria-label': labels.selectRow(name), checked: selected, onChange: () => table.toggleRow(row.id),
      })));
    }
    columns.forEach((column, index) => {
      cells.push(h('td', {
        'data-label': column.header, key: column.id,
        className: [collapsible ? `adt-col--p${priorityOf(column, index)}` : '', numeric(column) ? 'adt-num' : ''].filter(Boolean).join(' ') || undefined,
      }, contentOf(column, row, texts[index]!)));
    });
    if (rowActions.length > 0) {
      cells.push(h('td', {
        className: collapsible ? 'adt-actions adt-col--p2' : 'adt-actions', 'data-label': labels.actions, key: '__actions',
      }, actionButtons(row, name)));
    }
    const rowClass = ['adt-row', selected ? 'adt-row--selected' : '', open ? 'adt-row--expanded' : ''].filter(Boolean).join(' ');
    body.push(h('tr', { className: rowClass, 'data-row-id': row.id, key: row.id }, cells));
    if (open) {
      body.push(h('tr', { className: 'adt-detail', id: detailId, key: `${row.id}__detail` },
        h('td', { colSpan: span }, detailList(row, texts, name, false))));
    }
  });

  const busy = phase === 'loading';
  const notice = phase === 'loading'
    ? h('div', { className: 'adt-notice', role: 'status', 'aria-live': 'polite' }, h('span', { className: 'adt-notice-text' }, labels.loading))
    : phase === 'error'
      ? h('div', { className: 'adt-notice', role: 'alert' },
        h('span', { className: 'adt-notice-text' }, labels.error),
        typeof props.status?.retry === 'function'
          ? h('button', { type: 'button', className: 'adt-retry', onClick: () => { void props.status!.retry!(); } }, labels.retry)
          : null)
      : h('div', { className: 'adt-notice', role: 'status', 'aria-live': 'polite' });
  const wrapClass = ['adt-table-wrap', `adt-responsive--${responsive}`, size === 'md' ? '' : `adt-size--${size}`, busy ? 'adt-loading' : '']
    .filter(Boolean).join(' ');
  const tableClass = ['adt-table', collapsible && levels.has(2) ? 'adt-has-p2' : '', collapsible && levels.has(3) ? 'adt-has-p3' : '']
    .filter(Boolean).join(' ');
  return h('div', { className: wrapClass, ref: wrap, 'aria-busy': props.status ? busy : undefined },
    notice,
    h('div', { className: 'adt-scroll' }, h('table', { className: tableClass },
      props.caption !== undefined ? h('caption', null, props.caption) : null,
      h('thead', null, h('tr', null, head)),
      h('tbody', null, body))),
    responsive === 'modal'
      ? h('dialog', {
        ref: dialog, className: 'adt-dialog', 'aria-labelledby': `${uid}-dialog-title`, onClose: onDialogClose,
        onClick: (event: MouseEvent) => { if (event.target === event.currentTarget) closeDialog(); },
      }, dialogContent)
      : null);
}

const icon = (name: keyof typeof ICONS): ReactElement => h('svg', {
  className: 'adt-icon', viewBox: '0 0 24 24', width: 16, height: 16, fill: 'none', stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false',
}, h('path', { d: ICONS[name] }));

export interface PaginationProps {
  readonly table: AnyTable;
  /** Pages shown on each side of the current page. Default 1. */
  readonly siblings?: number;
  /** Pages always shown at the start and the end. Default 1. */
  readonly boundaries?: number;
  /** Also show "first" and "last" buttons. Default `false`. */
  readonly firstLast?: boolean;
  /** Locale for the page numbers' digit grouping. Default `'en'`. */
  readonly locale?: string;
  readonly labels?: Partial<DataTableLabels>;
}

/**
 * Numbered pages: `‹ 1 … 4 5 6 … 20 ›`, with a fixed number of buttons while
 * there are more pages than fit. With an unknown server total it numbers the
 * pages seen so far and keeps "next" while the page is full.
 */
export function Pagination({
  table, siblings = 1, boundaries = 1, firstLast = false, locale = 'en', labels: custom,
}: PaginationProps): ReactElement {
  const { page, totalRows } = useTable(table);
  const labels = withLabels(custom);
  const numbers = useMemo(() => new Intl.NumberFormat(locale), [locale]);
  const known = totalRows !== undefined;
  const items = getPageItems(page.page, known ? page.pageCount : page.page, { siblings, boundaries });
  const atStart = page.page <= 1;
  const atEnd = page.page >= page.pageCount;
  const arrow = (name: 'first' | 'previous' | 'next' | 'last', disabled: boolean, target: number): ReactElement => h('button', {
    type: 'button', className: `adt-page adt-page-arrow adt-${name}`, 'aria-label': labels[name],
    'aria-disabled': disabled ? 'true' : undefined, onClick: () => { if (!disabled) table.setPage(target); },
  }, icon(name));
  return h('nav', { className: 'adt-paging', 'aria-label': labels.pagination },
    firstLast ? arrow('first', atStart, 1) : null,
    arrow('previous', atStart, page.page - 1),
    h('span', { className: 'adt-page-numbers' }, items.map((item, index) => item === 'gap'
      ? h('span', { className: 'adt-page-gap', 'aria-hidden': 'true', key: `gap${index}` }, '…')
      : h('button', {
        type: 'button', className: 'adt-page', key: item, 'aria-label': labels.page(item),
        'aria-current': item === page.page ? 'page' : undefined, onClick: () => table.setPage(item),
      }, numbers.format(item)))),
    arrow('next', atEnd, page.page + 1),
    firstLast && known ? arrow('last', atEnd, page.pageCount) : null);
}

export interface PageSizeProps {
  readonly table: AnyTable;
  /** Default `[10, 25, 50, 100]`; the current size is always listed. */
  readonly pageSizes?: readonly number[];
  readonly labels?: Partial<DataTableLabels>;
}

/** A rows-per-page select with a visually hidden label. */
export function PageSize({ table, pageSizes = [10, 25, 50, 100], labels: custom }: PageSizeProps): ReactElement {
  checkPageSizes(pageSizes);
  const { state } = useTable(table);
  return h('label', { className: 'adt-length' },
    h('span', { className: 'adt-sr-only' }, withLabels(custom).pageSize),
    h('select', {
      className: 'adt-control', value: String(state.pageSize),
      onChange: (event: ChangeEvent<HTMLSelectElement>) => table.setPageSize(Number(event.target.value)),
    }, pageSizeChoices(pageSizes, state.pageSize).map(size => h('option', { value: String(size), key: size }, String(size)))));
}

export interface PageInfoProps {
  readonly table: AnyTable;
  readonly labels?: Partial<DataTableLabels>;
}

/** The visible range and the total, `1–25 of 5,000 rows`, as a polite live region. */
export function PageInfo({ table, labels: custom }: PageInfoProps): ReactElement {
  useTable(table); // re-render on every table change
  return h('div', { className: 'adt-info', 'aria-live': 'polite', 'aria-atomic': 'true' }, pageInfoText(table, withLabels(custom)));
}

export interface SearchProps {
  readonly table: AnyTable;
  readonly placeholder?: string;
  readonly debounceMs?: number;
  readonly labels?: Partial<DataTableLabels>;
}

/** A search input with an icon and a visually hidden label, bound to the global search; debounced, Enter applies at once. */
export function Search({ table, placeholder, debounceMs = 250, labels: custom }: SearchProps): ReactElement {
  if (!Number.isFinite(debounceMs) || debounceMs < 0) throw new RangeError('debounceMs must be a non-negative number');
  const { state } = useTable(table);
  const [text, setText] = useState(state.globalSearch);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const typing = useRef(false);
  useEffect(() => {
    if (!typing.current && timer.current === undefined) setText(state.globalSearch);
  }, [state.globalSearch]);
  useEffect(() => () => clearTimeout(timer.current), []);
  const apply = (value: string): void => {
    clearTimeout(timer.current);
    timer.current = undefined;
    table.setGlobalSearch(value);
  };
  const labels = withLabels(custom);
  return h('label', { className: 'adt-search' },
    h('span', { className: 'adt-sr-only' }, labels.search),
    icon('search'),
    h('input', {
      type: 'search', className: 'adt-control', autoComplete: 'off', value: text, placeholder: placeholder ?? `${labels.search}…`,
      onFocus: () => { typing.current = true; },
      onBlur: () => { typing.current = false; },
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        const value = event.target.value;
        setText(value);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => apply(value), debounceMs);
      },
      onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => { if (event.key === 'Enter') apply(event.currentTarget.value); },
    }));
}

export interface ColumnToggleProps {
  readonly table: AnyTable;
  readonly labels?: Partial<DataTableLabels>;
}

/** A "Columns" menu (`<details>`) with a labelled checkbox per column. */
export function ColumnToggle({ table, labels: custom }: ColumnToggleProps): ReactElement {
  const { state } = useTable(table);
  const labels = withLabels(custom);
  const columns = table.getColumns();
  const lastVisible = columns.length - state.hiddenColumns.length === 1;
  return h('details', { className: 'adt-columns' },
    h('summary', null, icon('columns'), labels.columns),
    h('fieldset', null, h('legend', null, labels.showColumns), columns.map(column => {
      const shown = !state.hiddenColumns.includes(column.id);
      return h('label', { key: column.id },
        h('input', {
          type: 'checkbox', value: column.id, checked: shown,
          disabled: column.enableHiding === false || (lastVisible && shown),
          onChange: (event: ChangeEvent<HTMLInputElement>) => table.setColumnVisibility(column.id, event.target.checked),
        }),
        h('span', null, column.header));
    })));
}

export interface BulkActionsProps<TData> {
  readonly table: DataTable<TData>;
  readonly actions: readonly BulkAction<TData>[];
  readonly labels?: Partial<DataTableLabels>;
}

/** A bar for the selected rows: "3 selected", action buttons, "Clear selection". Hidden without a selection. */
export function BulkActions<TData>({ table, actions, labels: custom }: BulkActionsProps<TData>): ReactElement {
  const { state } = useTable(table);
  const labels = withLabels(custom);
  const ids = state.selectedIds;
  const selection: BulkSelection<TData> = { ids, rows: table.getSelectedRows() };
  return h('div', { className: 'adt-selection', role: 'group', 'aria-label': labels.bulkActions, hidden: ids.length === 0 },
    h('span', { className: 'adt-selection-count', role: 'status', 'aria-live': 'polite' }, ids.length === 0 ? '' : labels.selectedCount(ids.length)),
    actions.map(action => {
      const disabled = action.disabled?.(selection) === true;
      return h('button', {
        type: 'button', className: 'adt-bulk-action', 'data-action': action.id, key: action.id,
        'aria-disabled': disabled ? 'true' : undefined,
        onClick: () => { if (!disabled) action.onSelect(selection); },
      }, action.label);
    }),
    h('button', { type: 'button', className: 'adt-clear-selection', onClick: () => table.clearSelection() }, labels.clearSelection));
}
