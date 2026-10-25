import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('package hygiene', () => {
  it('never injects HTML: every text from a back end is set as text', () => {
    const dir = new URL('../src/', import.meta.url);
    for (const file of readdirSync(dir).filter(name => name.endsWith('.ts'))) {
      const source = readFileSync(new URL(file, dir), 'utf8');
      expect(source, file).not.toMatch(/innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|DOMParser|document\.write/);
    }
  });

  it('adds no dependency: the other ACUN DataTable packages are not imported', () => {
    const dir = new URL('../src/', import.meta.url);
    for (const file of readdirSync(dir).filter(name => name.endsWith('.ts') && name !== 'testing.ts')) {
      expect(readFileSync(new URL(file, dir), 'utf8'), file).not.toMatch(/from '@acunsoft\//);
    }
  });
});
