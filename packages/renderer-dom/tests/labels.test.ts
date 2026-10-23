import { describe, expect, it } from 'vitest';
import { LABELS, labelsDe, labelsEn, labelsEs, labelsFr, labelsTr, resolveLabels } from '../src/index';

describe('built-in labels', () => {
  it('ship every text in every language', () => {
    const keys = Object.keys(labelsEn).sort();
    for (const [language, labels] of Object.entries(LABELS)) {
      expect(Object.keys(labels).sort(), language).toEqual(keys);
      for (const [key, value] of Object.entries(labels)) {
        const text = typeof value === 'function' ? (value as (...args: unknown[]) => string)(2, 3, 4) : value;
        expect(typeof text === 'string' && text.trim() !== '', `${language}.${key}`).toBe(true);
      }
      expect(Object.isFrozen(labels)).toBe(true);
    }
  });

  it('use singular and plural forms and the locale digit grouping', () => {
    expect(labelsEn.pageStatus(1, 1, 1)).toBe('Page 1 of 1 · 1 row');
    expect(labelsEn.pageStatus(2, 640, 16_000)).toBe('Page 2 of 640 · 16,000 rows');
    expect(labelsTr.pageStatus(1, 1, 1600)).toBe('Sayfa 1 / 1 · 1.600 kayıt');
    expect(labelsDe.pageStatus(1, 1, 1)).toBe('Seite 1 von 1 · 1 Eintrag');
    expect(labelsDe.pageStatus(1, 2, 1600)).toBe('Seite 1 von 2 · 1.600 Einträge');
    expect(labelsFr.pageStatus(1, 1, 0)).toBe('Page 1 sur 1 · 0 ligne'); // French: 0 is singular
    expect(labelsFr.pageStatus(1, 1, 1600)).toBe('Page 1 sur 1 · 1 600 lignes');
    expect(labelsEs.pageStatus(1, 1, 1)).toBe('Página 1 de 1 · 1 fila');
    expect(labelsFr.selectedCount(1)).toBe('1 sélectionnée');
    expect(labelsEs.selectedCount(3)).toBe('3 seleccionadas');
  });

  it('resolve a locale to its language, falling back to English', () => {
    expect(resolveLabels('de-AT')).toEqual(labelsDe);
    expect(resolveLabels('tr_TR')).toEqual(labelsTr);
    expect(resolveLabels('FR')).toEqual(labelsFr);
    expect(resolveLabels('pt-BR')).toEqual(labelsEn);
    expect(resolveLabels(undefined)).toEqual(labelsEn);
    expect(resolveLabels('es', { search: 'Filtrar' }).search).toBe('Filtrar');
  });
});
