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
    expect(labelsEn.pageInfo(1, 1, 1)).toBe('Showing 1 to 1 of 1 row');
    expect(labelsEn.pageInfo(26, 50, 16_000)).toBe('Showing 26 to 50 of 16,000 rows');
    expect(labelsTr.pageInfo(1, 25, 1600)).toBe('Toplam: 1.600 kaydın 1 ile 25 arasını gösteriyor');
    expect(labelsDe.pageInfo(1, 1, 1)).toBe('1 bis 1 von 1 Eintrag');
    expect(labelsDe.pageInfo(1, 25, 1600)).toBe('1 bis 25 von 1.600 Einträgen');
    expect(labelsFr.pageInfo(1, 1, 0)).toBe('Affichage de 1 à 1 sur 0 ligne'); // French: 0 is singular
    expect(labelsFr.pageInfo(1, 25, 1600)).toBe('Affichage de 1 à 25 sur 1\u202f600 lignes');
    expect(labelsEs.pageInfo(1, 1, 1)).toBe('Mostrando 1 a 1 de 1 fila');
    expect(labelsTr.page(1200)).toBe('Sayfa 1.200');
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
