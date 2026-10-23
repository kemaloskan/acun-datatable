// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('package hygiene', () => {
  it('never injects HTML: every value is rendered as text by React', () => {
    const dir = new URL('../src/', import.meta.url);
    for (const file of readdirSync(dir)) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      expect(source, file).not.toMatch(/dangerouslySetInnerHTML\s*:|innerHTML\s*=|insertAdjacentHTML|DOMParser/);
    }
  });
});
