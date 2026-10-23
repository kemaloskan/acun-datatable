import { describe, expect, it } from 'vitest';
import { createDataTable } from '@acunsoft/datatable-core';
import { renderBulkActions, renderPagination, renderSearch, renderTable } from '../src/index';

const XSS = [
  '<img src=x onerror="window.__xss=1">',
  '<script>window.__xss=1</script>',
  '"><svg onload=window.__xss=1>',
  'javascript:window.__xss=1',
];

describe('XSS fixture (SPEC M3)', () => {
  it('renders hostile cell values, headers, captions and labels as literal text', () => {
    document.body.replaceChildren();
    const host = document.createElement('div');
    const controls = document.createElement('div');
    document.body.append(host, controls);
    const data = XSS.map((value, index) => ({ id: index + 1, value }));
    const table = createDataTable({
      data,
      columns: [{ id: 'value', header: XSS[0]!, accessorKey: 'value', enableSorting: true, enableFiltering: true }],
      getRowId: row => `${row.id}<b>`,
    });
    renderTable(host, table, {
      caption: XSS[1]!, selectable: true, labels: { selectRow: id => `${XSS[2]} ${id}` },
      rowActions: [{ id: 'edit', label: XSS[3]!, onSelect: () => undefined }],
    });
    renderPagination(controls, table, { labels: { previous: XSS[0]! } });
    renderSearch(controls.appendChild(document.createElement('div')), table, { placeholder: XSS[1]!, labels: { search: XSS[2]! } });
    renderBulkActions(controls.appendChild(document.createElement('div')), table, { actions: [{ id: 'go', label: XSS[0]!, onSelect: () => undefined }] });
    table.selectRow(table.getPage().rows[0]!.id);

    const texts = [...host.querySelectorAll('tbody td:not(.adt-select):not(.adt-actions)')].map(td => td.textContent);
    expect(host.querySelector('.adt-action')!.textContent).toBe(XSS[3]);
    expect(controls.querySelector('.adt-bulk-action')!.textContent).toBe(XSS[0]);
    expect(texts).toEqual(XSS);
    expect(host.querySelector('caption')!.textContent).toBe(XSS[1]);
    expect(host.querySelector('th button')!.firstChild!.textContent).toBe(XSS[0]);
    expect(host.querySelector('tbody tr')!.getAttribute('data-row-id')).toBe('1<b>');

    for (const root of [host, controls]) {
      expect(root.querySelectorAll('img, script, svg, b')).toHaveLength(0);
    }
    expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
  });
});
