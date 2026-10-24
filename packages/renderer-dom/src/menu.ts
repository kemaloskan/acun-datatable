import { element, icon, type RenderedComponent } from './dom';
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
  const summary = element(doc, 'summary', {}, options.label ?? labels.tools);
  summary.prepend(icon(doc, 'download'));
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
    if (root.open && !root.contains(event.target as Node)) root.open = false;
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
