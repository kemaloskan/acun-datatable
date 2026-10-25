import type { DataTable } from '@acunsoft/datatable-core';

type Attributes = Readonly<Record<string, string | boolean | undefined>>;

/**
 * Create an element. Text goes through `textContent` and attributes through
 * `setAttribute`, so no value is ever parsed as HTML.
 */
export function element<K extends keyof HTMLElementTagNameMap>(
  doc: Document, tag: K, attributes: Attributes = {}, text?: string,
): HTMLElementTagNameMap[K] {
  const node = doc.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) {
    if (value === undefined || value === false) continue;
    node.setAttribute(name, value === true ? '' : value);
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Re-render and move keyboard focus back to the control with the same `data-adt-focus` key. */
export function keepFocus(root: HTMLElement, render: () => void): void {
  const active = root.ownerDocument.activeElement as HTMLElement | null;
  const key = active && root.contains(active) ? active.dataset?.['adtFocus'] : undefined;
  const inDialog = active?.closest?.('dialog') != null;
  render();
  if (key === undefined) return;
  // The same control again: in a dialog when focus was in one (its row's buttons also sit in
  // the table behind it), and a shown copy before one hidden by the responsive layout.
  const matches = [...root.querySelectorAll<HTMLElement>('[data-adt-focus]')]
    .filter(node => node.dataset['adtFocus'] === key && (node.closest('dialog') != null) === inDialog);
  (matches.find(node => node.getClientRects().length > 0) ?? matches[0])?.focus();
}

export function checkTarget(container: unknown, table: unknown): void {
  const node = container as { ownerDocument?: { createElement?: unknown }; replaceChildren?: unknown } | null;
  if (!node || typeof node.ownerDocument?.createElement !== 'function' || typeof node.replaceChildren !== 'function') {
    throw new TypeError('container must be a DOM element');
  }
  const candidate = table as Partial<DataTable<unknown>> | null;
  if (!candidate || typeof candidate.getPage !== 'function' || typeof candidate.subscribe !== 'function') {
    throw new TypeError('table must be created with createDataTable');
  }
}

/** A rendered component; `destroy` unsubscribes and removes its elements. */
export interface RenderedComponent {
  destroy(): void;
}

/** SVG path data of the built-in stroke icons (24×24 view box), for the Vue and React packages. */
export const ICONS = Object.freeze({
  first: 'M11 17l-5-5 5-5M18 17l-5-5 5-5',
  previous: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  last: 'M13 17l5-5-5-5M6 17l5-5-5-5',
  search: 'M21 21l-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  columns: 'M9 4v16M15 4v16M4 4h16v16H4z',
  expand: 'M12 8v8M8 12h8M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  collapse: 'M8 12h8M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z',
  close: 'M18 6 6 18M6 6l12 12',
  filter: 'M3 5h18l-7 8.5V19l-4 2v-7.5z',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  view: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  edit: 'M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z',
  delete: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6',
  more: 'M12 5.5h.01M12 12h.01M12 18.5h.01',
  copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
  check: 'M20 6 9 17l-5-5',
  up: 'M18 15l-6-6-6 6',
  down: 'M6 9l6 6 6-6',
} as const);

/** A decorative stroke icon (hidden from screen readers; the control carries the name). */
export function icon(doc: Document, name: keyof typeof ICONS | { readonly path: string }): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = doc.createElementNS(ns, 'svg');
  for (const [key, value] of Object.entries({
    class: 'adt-icon', viewBox: '0 0 24 24', width: '16', height: '16', fill: 'none', stroke: 'currentColor',
    'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true', focusable: 'false',
  })) svg.setAttribute(key, value);
  const path = doc.createElementNS(ns, 'path');
  path.setAttribute('d', typeof name === 'string' ? ICONS[name] : name.path);
  svg.append(path);
  return svg;
}

/**
 * Keep an open dropdown (`<details>` with its panel after the `<summary>`) inside the
 * window: the panel opens towards the end of its button and is shifted sideways
 * (`--adt-menu-shift`) when it would stick out, e.g. on a phone where the button
 * sits at the start of the row. Call it from the `toggle` event.
 */
export function placeMenu(menu: HTMLDetailsElement): void {
  menu.style.removeProperty('--adt-menu-shift');
  const panel = menu.querySelector<HTMLElement>(':scope > :not(summary)');
  if (!menu.open || !panel) return;
  const margin = 8;
  const view = menu.ownerDocument.documentElement.clientWidth;
  const box = panel.getBoundingClientRect();
  let shift = box.right > view - margin ? view - margin - box.right : 0;
  if (box.left + shift < margin) shift = margin - box.left;
  if (shift !== 0) menu.style.setProperty('--adt-menu-shift', `${Math.round(shift)}px`);
}

/** Set or clear `aria-disabled`; unlike `disabled`, a focused control keeps focus. */
export function ariaDisabled(node: HTMLElement, value: boolean): void {
  if (value) node.setAttribute('aria-disabled', 'true');
  else node.removeAttribute('aria-disabled');
}

type Child = Node | string | number | null | undefined | false;

/**
 * Build an element for a custom cell without any HTML parsing: attributes
 * are set with `setAttribute`, strings become text nodes.
 * `el('span', { class: 'badge badge--paid' }, 'Ödendi')`.
 */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K, attributes: Readonly<Record<string, string | boolean | undefined>> = {}, ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = element(document, tag, attributes);
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'number' ? String(child) : child);
  }
  return node;
}
