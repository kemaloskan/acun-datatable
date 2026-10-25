import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadFile } from '../src/index';

afterEach(() => vi.restoreAllMocks());

describe('downloadFile', () => {
  it('clicks a temporary link with the right name and type, then cleans up', async () => {
    const created: Blob[] = [];
    URL.createObjectURL = vi.fn((blob: Blob) => { created.push(blob); return 'blob:test'; });
    URL.revokeObjectURL = vi.fn();
    const clicks: HTMLAnchorElement[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { clicks.push(this); });
    vi.useFakeTimers();
    downloadFile(new Uint8Array([1, 2]), 'orders.xlsx');
    expect(clicks[0]!.download).toBe('orders.xlsx');
    expect(clicks[0]!.href).toBe('blob:test');
    expect(created[0]!.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    expect(document.querySelector('a')).toBeNull();
    vi.runAllTimers();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test');
    downloadFile('a,b', 'x.csv');
    expect(created[1]!.type).toBe('text/csv;charset=utf-8');
    expect(await created[1]!.text()).toBe('a,b');
    vi.useRealTimers();
  });

  it('rejects paths and empty names', () => {
    expect(() => downloadFile('x', '../x.csv')).toThrow('plain file name');
    expect(() => downloadFile('x', ' ')).toThrow('plain file name');
  });
});

describe('printRows', () => {
  it('prints only the given rows, in a hidden frame with the page styles, then removes it', async () => {
    const { printRows } = await import('../src/index');
    const style = document.createElement('style');
    style.textContent = '.badge { color: green; }';
    document.head.append(style);
    let printed: Document | undefined;
    const done = printRows(document, {
      title: 'Orders', subtitle: '2 rows', headers: ['Customer', 'Total'], numeric: [false, true],
      rows: [['Ayşe', '1.250,50'], ['<b>x</b>', Object.assign(document.createElement('span'), { className: 'badge', textContent: 'Paid' })]],
    });
    const frame = document.querySelector('iframe')!;
    frame.contentWindow!.print = () => { printed = frame.contentDocument!; };
    await done;
    expect(printed!.querySelector('h1')!.textContent).toBe('Orders');
    expect([...printed!.querySelectorAll('th')].map(th => th.textContent)).toEqual(['Customer', 'Total']);
    expect(printed!.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(printed!.querySelector('tbody tr:last-child td')!.textContent).toBe('<b>x</b>'); // text, never markup
    expect(printed!.querySelector('tbody .badge')!.textContent).toBe('Paid'); // your own cells come along
    expect(printed!.querySelector('td.adt-num')).not.toBeNull();
    expect(printed!.head.textContent).toContain('.badge'); // with the page's styles
    frame.contentWindow!.dispatchEvent(new Event('afterprint'));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(document.querySelector('iframe')).toBeNull();
    style.remove();
  });
});
