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
  render();
  if (key === undefined) return;
  for (const node of root.querySelectorAll<HTMLElement>('[data-adt-focus]')) {
    if (node.dataset['adtFocus'] === key) {
      node.focus();
      return;
    }
  }
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
