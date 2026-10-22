// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('source hygiene', () => {
  it('never uses HTML-parsing DOM APIs', () => {
    const dir = fileURLToPath(new URL('../src/', import.meta.url));
    const files = readdirSync(dir);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(dir + file, 'utf8');
      expect(source, file).not.toMatch(/innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|createContextualFragment/);
    }
  });
});
