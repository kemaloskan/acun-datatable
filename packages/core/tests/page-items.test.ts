import { describe, expect, it } from 'vitest';
import { getPageItems } from '../src/index';

describe('getPageItems', () => {
  it('lists every page while they fit', () => {
    expect(getPageItems(1, 1)).toEqual([1]);
    expect(getPageItems(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('keeps a fixed length and slides the window between gaps', () => {
    expect(getPageItems(1, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
    expect(getPageItems(4, 20)).toEqual([1, 2, 3, 4, 5, 'gap', 20]);
    expect(getPageItems(5, 20)).toEqual([1, 'gap', 4, 5, 6, 'gap', 20]);
    expect(getPageItems(16, 20)).toEqual([1, 'gap', 15, 16, 17, 'gap', 20]);
    expect(getPageItems(17, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
    expect(getPageItems(20, 20)).toEqual([1, 'gap', 16, 17, 18, 19, 20]);
    for (let page = 1; page <= 20; page++) expect(getPageItems(page, 20)).toHaveLength(7);
  });

  it('never hides a single page behind a gap', () => {
    expect(getPageItems(4, 8)).toEqual([1, 2, 3, 4, 5, 'gap', 8]);
    expect(getPageItems(5, 8)).toEqual([1, 'gap', 4, 5, 6, 7, 8]);
  });

  it('supports wider windows and no boundaries', () => {
    expect(getPageItems(50, 100, { siblings: 2, boundaries: 2 })).toEqual([1, 2, 'gap', 48, 49, 50, 51, 52, 'gap', 99, 100]);
    expect(getPageItems(50, 100, { siblings: 1, boundaries: 0 })).toEqual(['gap', 49, 50, 51, 'gap']);
    expect(getPageItems(1, 5_000_000).at(-1)).toBe(5_000_000);
  });

  it('clamps the page and validates input', () => {
    expect(getPageItems(9, 3)).toEqual([1, 2, 3]);
    expect(() => getPageItems(0, 3)).toThrow('page must be');
    expect(() => getPageItems(1, 0)).toThrow('pageCount must be');
    expect(() => getPageItems(1, 3, { siblings: -1 })).toThrow('siblings must be');
  });
});
