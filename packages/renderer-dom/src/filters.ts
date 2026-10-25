import type { ColumnDef, ColumnType, DataTable, FilterOption, FilterRule } from '@acunsoft/datatable-core';
import { checkTarget, element, fillButton, icon, placeMenu, type RenderedComponent, type ToolbarButton } from './dom';
import { labelsEn, type DataTableLabels } from './labels';

/** The kind of control a filter-panel column gets. */
export type FilterKind = 'text' | 'options' | 'range' | 'dates' | 'boolean';

/** One control of the filter panel, derived from a column with `filter`. */
export interface FilterControl {
  readonly field: string;
  readonly label: string;
  readonly kind: FilterKind;
  readonly type?: ColumnType;
  readonly options?: readonly FilterOption[];
}

/** What a control shows: inputs are strings, as in the DOM. */
export interface FilterValues {
  readonly text?: string;
  /** `options`: the ticked values, as strings. */
  readonly selected?: readonly string[];
  /** `range` / `dates`: the bounds; an empty string is open. */
  readonly min?: string;
  readonly max?: string;
  /** `boolean`: `'true'`, `'false'` or `''` (any). */
  readonly flag?: string;
}

/** The filter-panel controls of a table's columns (every column with `filter`). */
export function filterControls<TData>(columns: readonly ColumnDef<TData>[]): readonly FilterControl[] {
  return columns.filter(column => column.filter && column.enableFiltering).map(column => {
    const options = typeof column.filter === 'object' ? column.filter.options : undefined;
    const kind: FilterKind = options ? 'options'
      : column.type === 'boolean' ? 'boolean'
        : column.type === 'number' || column.type === 'decimal' ? 'range'
          : column.type === 'date' || column.type === 'datetime' ? 'dates'
            : 'text';
    return Object.freeze({
      field: column.id, label: column.header, kind,
      ...(column.type ? { type: column.type } : {}),
      ...(options ? { options } : {}),
    });
  });
}

const text = (value: unknown): string => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? ''));

/** Read a control's values back from the table's filter rules (also rules from a URL). */
export function readFilter(control: FilterControl, rules: readonly FilterRule[]): FilterValues {
  const own = rules.filter(rule => rule.field === control.field);
  switch (control.kind) {
    case 'text':
      return { text: text(own.find(rule => rule.operator === 'contains')?.value) };
    case 'boolean': {
      const rule = own.find(rule => rule.operator === 'eq');
      return { flag: rule === undefined ? '' : String(rule.value === true || rule.value === 'true' || rule.value === 1 || rule.value === '1') };
    }
    case 'options': {
      const selected = own.flatMap(rule => rule.operator === 'in' && Array.isArray(rule.value) ? rule.value
        : rule.operator === 'eq' ? [rule.value] : []);
      return { selected: selected.map(text) };
    }
    default: {
      let min = '';
      let max = '';
      for (const rule of own) {
        if (rule.operator === 'between' && Array.isArray(rule.value)) [min, max] = [text(rule.value[0]), text(rule.value[1])];
        if (rule.operator === 'gte' || rule.operator === 'gt') min = text(rule.value);
        if (rule.operator === 'lte' || rule.operator === 'lt') max = text(rule.value);
      }
      return { min, max };
    }
  }
}

/** The filter rules for a control's values; none when it constrains nothing. */
export function filterRules(control: FilterControl, values: FilterValues): readonly FilterRule[] {
  const { field } = control;
  switch (control.kind) {
    case 'text': {
      const value = (values.text ?? '').trim();
      return value === '' ? [] : [{ field, operator: 'contains', value }];
    }
    case 'boolean':
      return values.flag === 'true' || values.flag === 'false' ? [{ field, operator: 'eq', value: values.flag === 'true' }] : [];
    case 'options': {
      const chosen = (control.options ?? []).filter(option => (values.selected ?? []).includes(String(option.value))).map(option => option.value);
      return chosen.length === 0 ? [] : [{ field, operator: 'in', value: chosen }];
    }
    default: {
      const min = (values.min ?? '').trim();
      const max = (values.max ?? '').trim();
      if (min !== '' && max !== '') return [{ field, operator: 'between', value: [min, max] }];
      if (min !== '') return [{ field, operator: 'gte', value: min }];
      if (max !== '') return [{ field, operator: 'lte', value: max }];
      return [];
    }
  }
}

/** The table's rules with one field's rules replaced. */
export function replaceFilter(rules: readonly FilterRule[], field: string, next: readonly FilterRule[]): FilterRule[] {
  return [...rules.filter(rule => rule.field !== field), ...next];
}

/** Chip text of an active control, e.g. `Durum: Ödendi, Kargoda` or `Tutar: ≥ 100`; undefined when inactive. */
export function describeFilter(control: FilterControl, values: FilterValues, labels: DataTableLabels, locale = 'en'): string | undefined {
  const rules = filterRules(control, values);
  if (rules.length === 0) return undefined;
  const show = (value: string): string => {
    if (control.kind === 'dates' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
      const [y, m, d] = value.slice(0, 10).split('-').map(Number);
      return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(y!, m! - 1, d!));
    }
    if (control.kind === 'range' && value !== '' && Number.isFinite(Number(value))) return new Intl.NumberFormat(locale).format(Number(value));
    return value;
  };
  let summary: string;
  switch (control.kind) {
    case 'text': summary = `“${(values.text ?? '').trim()}”`; break;
    case 'boolean': summary = values.flag === 'true' ? labels.yes : labels.no; break;
    case 'options':
      summary = (control.options ?? []).filter(option => (values.selected ?? []).includes(String(option.value))).map(option => option.label).join(', ');
      break;
    default: {
      const min = (values.min ?? '').trim();
      const max = (values.max ?? '').trim();
      summary = min !== '' && max !== '' ? `${show(min)} – ${show(max)}` : min !== '' ? `≥ ${show(min)}` : `≤ ${show(max)}`;
    }
  }
  return `${control.label}: ${summary}`;
}

/** Where the filter fields open: under the button (default), from the side, or centred. */
export type FilterPanelMode = 'dropdown' | 'drawer' | 'modal';
const PANEL_MODES: readonly FilterPanelMode[] = ['dropdown', 'drawer', 'modal'];

export interface RenderFilterPanelOptions {
  readonly labels?: Partial<DataTableLabels>;
  /** For dates and numbers in the chips. Default `'en'`. */
  readonly locale?: string;
  /** Delay before typing in a text or number field filters, in ms. Default 300. */
  readonly debounceMs?: number;
}

export interface RenderFiltersOptions extends RenderFilterPanelOptions {
  /**
   * Where the fields open: `'dropdown'` under the button (default), `'drawer'`
   * from the side of the window, `'modal'` in a centred dialog. For your own
   * drawer, modal or sidebar, put `renderFilterPanel()` in it instead.
   */
  readonly panel?: FilterPanelMode;
  /** The button's text, icon and classes. */
  readonly button?: ToolbarButton;
}

let panels = 0;

interface FilterPanel {
  readonly node: HTMLElement;
  /** How many columns of the panel are filtered. */
  active(): number;
  destroy(): void;
}

/** The fields and "Clear filters", following the table's filters (also set from outside). */
function buildFilterPanel<TData>(
  doc: Document, table: DataTable<TData>, controls: readonly FilterControl[], labels: DataTableLabels, delay: number, changed: (active: number) => void,
): FilterPanel {
  const uid = `adt-filters-${++panels}`;
  const panel = element(doc, 'div', { class: 'adt-filter-panel', role: 'group', 'aria-label': labels.filters });
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const apply = (control: FilterControl, values: FilterValues): void => {
    table.setFilters(replaceFilter(table.getState().filters, control.field, filterRules(control, values)));
  };
  const syncers: (() => void)[] = [];
  controls.forEach((control, index) => {
    const set = element(doc, 'fieldset', { class: `adt-filter adt-filter--${control.kind}`, 'data-field': control.field });
    set.append(element(doc, 'legend', {}, control.label));
    const id = `${uid}-${index}`;
    const debounced = (read: () => FilterValues): (() => void) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      return () => {
        if (timer) { clearTimeout(timer); timers.delete(timer); }
        timer = setTimeout(() => { timers.delete(timer!); timer = undefined; apply(control, read()); }, delay);
        timers.add(timer);
      };
    };
    if (control.kind === 'text') {
      const input = element(doc, 'input', { type: 'search', class: 'adt-control', id, 'aria-label': control.label, autocomplete: 'off' });
      const read = (): FilterValues => ({ text: input.value });
      input.addEventListener('input', debounced(read));
      input.addEventListener('change', () => apply(control, read()));
      set.append(input);
      syncers.push(() => { if (doc.activeElement !== input) input.value = readFilter(control, table.getState().filters).text ?? ''; });
    } else if (control.kind === 'boolean') {
      const radios = (['', 'true', 'false'] as const).map(flag => {
        const radio = element(doc, 'input', { type: 'radio', name: id, value: flag });
        radio.addEventListener('change', () => apply(control, { flag }));
        const label = element(doc, 'label', { class: 'adt-filter-choice' });
        label.append(radio, element(doc, 'span', {}, flag === '' ? labels.filterAny : flag === 'true' ? labels.yes : labels.no));
        set.append(label);
        return radio;
      });
      syncers.push(() => {
        const flag = readFilter(control, table.getState().filters).flag ?? '';
        radios.forEach(radio => { radio.checked = radio.value === flag; });
      });
    } else if (control.kind === 'options') {
      const boxes = (control.options ?? []).map(option => {
        const box = element(doc, 'input', { type: 'checkbox', value: String(option.value) });
        box.addEventListener('change', () => apply(control, { selected: boxes.filter(item => item.checked).map(item => item.value) }));
        const label = element(doc, 'label', { class: 'adt-filter-choice' });
        label.append(box, element(doc, 'span', {}, option.label));
        set.append(label);
        return box;
      });
      syncers.push(() => {
        const selected = readFilter(control, table.getState().filters).selected ?? [];
        boxes.forEach(box => { box.checked = selected.includes(box.value); });
      });
    } else {
      const dates = control.kind === 'dates';
      const field = (bound: 'min' | 'max'): HTMLInputElement => element(doc, 'input', {
        type: dates ? 'date' : 'number', class: 'adt-control', ...(dates ? {} : { inputmode: 'decimal', step: 'any' }),
        'aria-label': `${control.label}: ${dates ? (bound === 'min' ? labels.filterFrom : labels.filterTo) : (bound === 'min' ? labels.filterMin : labels.filterMax)}`,
        placeholder: dates ? undefined : bound === 'min' ? labels.filterMin : labels.filterMax,
      });
      const min = field('min');
      const max = field('max');
      const read = (): FilterValues => ({ min: min.value, max: max.value });
      for (const input of [min, max]) {
        input.addEventListener('input', debounced(read));
        input.addEventListener('change', () => apply(control, read()));
      }
      const row = element(doc, 'div', { class: 'adt-filter-range' });
      row.append(min, element(doc, 'span', { 'aria-hidden': 'true' }, '–'), max);
      set.append(row);
      syncers.push(() => {
        const values = readFilter(control, table.getState().filters);
        if (doc.activeElement !== min) min.value = values.min ?? '';
        if (doc.activeElement !== max) max.value = values.max ?? '';
      });
    }
    panel.append(set);
  });
  const clear = element(doc, 'button', { type: 'button', class: 'adt-button adt-filter-clear' }, labels.clearFilters);
  clear.addEventListener('click', () => {
    const fields = new Set(controls.map(control => control.field));
    table.setFilters(table.getState().filters.filter(rule => !fields.has(rule.field)));
  });
  const foot = element(doc, 'div', { class: 'adt-filter-foot' });
  foot.append(clear);
  panel.append(foot);

  const active = (): number => controls.filter(control => filterRules(control, readFilter(control, table.getState().filters)).length > 0).length;
  const update = (): void => {
    syncers.forEach(sync => sync());
    const count = active();
    clear.disabled = count === 0;
    changed(count);
  };
  update();
  const unsubscribe = table.subscribe((_, event) => { if (event.type === 'filters') update(); });
  return {
    node: panel,
    active,
    destroy: () => {
      timers.forEach(timer => clearTimeout(timer));
      unsubscribe();
      panel.remove();
    },
  };
}

/**
 * Render only the filter fields and "Clear filters" — no button, no menu —
 * into any element: your own drawer, modal, offcanvas or sidebar. The fields
 * follow the table's filters, so the chips and `setFilters` stay in step.
 * Renders nothing without filter columns.
 */
export function renderFilterPanel<TData>(container: HTMLElement, table: DataTable<TData>, options: RenderFilterPanelOptions = {}): RenderedComponent {
  checkTarget(container, table);
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };
  const controls = filterControls(table.getColumns());
  if (controls.length === 0) {
    container.replaceChildren();
    return { destroy: () => undefined };
  }
  const panel = buildFilterPanel(doc, table, controls, labels, options.debounceMs ?? 300, () => undefined);
  container.replaceChildren(panel.node);
  return { destroy: () => panel.destroy() };
}

/**
 * Render a "Filters" button with one control per column that has `filter`:
 * text (contains), min–max for numbers, from–to for dates, yes/no, or a list
 * of `options`. Changes apply at once (typing after `debounceMs`); the
 * button shows how many filters are active. `panel` opens the fields under
 * the button, in a drawer or in a modal. Renders nothing without filter
 * columns. Controls follow external changes (a URL, chips, `setFilters`).
 */
export function renderFilters<TData>(container: HTMLElement, table: DataTable<TData>, options: RenderFiltersOptions = {}): RenderedComponent {
  checkTarget(container, table);
  const mode = options.panel ?? 'dropdown';
  if (!PANEL_MODES.includes(mode)) throw new RangeError(`panel must be one of ${PANEL_MODES.join(', ')}`);
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };
  const controls = filterControls(table.getColumns());
  if (controls.length === 0) {
    container.replaceChildren();
    return { destroy: () => undefined };
  }
  const dropdown = mode === 'dropdown';
  const root = element(doc, dropdown ? 'details' : 'div', { class: `adt-columns adt-menu adt-filters${dropdown ? '' : ` adt-filters--${mode}`}` });
  const button = element(doc, dropdown ? 'summary' : 'button', dropdown ? {} : { type: 'button', class: 'adt-filter-open', 'aria-haspopup': 'dialog' });
  const badge = element(doc, 'span', { class: 'adt-badge', 'aria-hidden': 'true' });
  const count = element(doc, 'span', { class: 'adt-sr-only' });
  button.append(badge, count);
  fillButton(doc, button, { label: labels.filters, icon: 'filter' }, options.button);
  const panel = buildFilterPanel(doc, table, controls, labels, options.debounceMs ?? 300, active => {
    badge.textContent = active > 0 ? String(active) : '';
    badge.hidden = active === 0;
    count.textContent = active > 0 ? labels.activeFilters(active) : '';
  });
  root.append(button);
  container.replaceChildren(root);
  const cleanups: (() => void)[] = [];

  if (dropdown) {
    const menu = root as HTMLDetailsElement;
    menu.append(panel.node);
    menu.addEventListener('toggle', () => placeMenu(menu));
    // Close like a menu: Escape (focus back on the button) or a click outside.
    menu.addEventListener('keydown', event => {
      if (event.key === 'Escape' && menu.open) { menu.open = false; button.focus(); }
    });
    const outside = (event: Event): void => {
      // The path at the time of the click: a control that re-rendered away still counts as inside.
      if (menu.open && !event.composedPath().includes(menu)) menu.open = false;
    };
    doc.addEventListener('click', outside);
    cleanups.push(() => doc.removeEventListener('click', outside));
  } else {
    // A drawer or a modal: a <dialog> (Escape closes it, focus stays inside, the page behind is inert).
    const title = `adt-filters-title-${++panels}`;
    const dialog = element(doc, 'dialog', { class: `adt-dialog adt-filter-dialog adt-filter-dialog--${mode}`, 'aria-labelledby': title });
    const head = element(doc, 'div', { class: 'adt-dialog-head' });
    const close = element(doc, 'button', { type: 'button', class: 'adt-dialog-close', 'aria-label': labels.close });
    close.append(icon(doc, 'close'));
    head.append(element(doc, 'h2', { class: 'adt-dialog-title', id: title }, labels.filters), close);
    const done = element(doc, 'button', { type: 'button', class: 'adt-button adt-button--primary adt-filter-done' }, labels.close);
    panel.node.querySelector('.adt-filter-foot')!.append(done);
    dialog.append(head, panel.node);
    root.append(dialog);
    button.addEventListener('click', () => {
      if (dialog.open) return;
      if (typeof dialog.showModal === 'function') dialog.showModal();
      else dialog.setAttribute('open', '');
    });
    const shut = (): void => {
      if (typeof dialog.close === 'function') dialog.close();
      else { dialog.removeAttribute('open'); dialog.dispatchEvent(new Event('close')); }
    };
    for (const node of [close, done]) node.addEventListener('click', shut);
    // A click on the backdrop (the dialog element itself, outside its content box) closes it.
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      const inside = event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom;
      if (!inside) shut();
    });
    dialog.addEventListener('close', () => button.focus());
    cleanups.push(() => { if (dialog.open) shut(); });
  }

  return {
    destroy: () => {
      cleanups.forEach(cleanup => cleanup());
      panel.destroy();
      root.remove();
    },
  };
}

/**
 * Render the active filters as removable chips (`Durum: Ödendi ×`) with a
 * "Clear filters" button; hidden while no filter-panel column is filtered.
 */
export function renderFilterChips<TData>(container: HTMLElement, table: DataTable<TData>, options: Omit<RenderFiltersOptions, 'debounceMs'> = {}): RenderedComponent {
  checkTarget(container, table);
  const doc = container.ownerDocument;
  const labels: DataTableLabels = { ...labelsEn, ...options.labels };
  const controls = filterControls(table.getColumns());
  const root = element(doc, 'div', { class: 'adt-filter-chips', role: 'group', 'aria-label': labels.filters });
  container.replaceChildren(root);
  const update = (): void => {
    const rules = table.getState().filters;
    const chips = controls.flatMap(control => {
      const label = describeFilter(control, readFilter(control, rules), labels, options.locale);
      if (label === undefined) return [];
      const chip = element(doc, 'span', { class: 'adt-chip' }, label);
      const remove = element(doc, 'button', { type: 'button', class: 'adt-chip-remove', 'aria-label': labels.removeFilter(control.label), 'data-adt-focus': `chip:${control.field}` });
      remove.append(icon(doc, 'close'));
      remove.addEventListener('click', () => table.setFilters(replaceFilter(table.getState().filters, control.field, [])));
      chip.append(remove);
      return [chip];
    });
    root.hidden = chips.length === 0;
    if (chips.length > 0) {
      const clear = element(doc, 'button', { type: 'button', class: 'adt-chip-clear' }, labels.clearFilters);
      const fields = new Set(controls.map(control => control.field));
      clear.addEventListener('click', () => table.setFilters(table.getState().filters.filter(rule => !fields.has(rule.field))));
      root.replaceChildren(...chips, clear);
    } else {
      root.replaceChildren();
    }
  };
  update();
  const unsubscribe = table.subscribe((_, event) => { if (event.type === 'filters') update(); });
  return { destroy: () => { unsubscribe(); root.remove(); } };
}
