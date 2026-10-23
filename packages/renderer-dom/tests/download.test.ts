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
