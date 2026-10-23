import type { ColumnType } from '@acunsoft/datatable-core';

/** Why a value or header was rejected; stable, for your own messages. */
export type ImportIssueCode = 'invalid' | 'required' | 'missing-column' | 'duplicate-column';

/** The texts of import problems. Built in: English, Turkish, German, French, Spanish. */
export interface ImportMessages {
  /** `type` is the column type (`text` when the column has none). */
  readonly invalid: (type: ColumnType) => string;
  readonly required: string;
  readonly missingColumn: string;
  readonly duplicateColumn: string;
}

const typeNames = (names: Record<ColumnType, string>) => (type: ColumnType): string => names[type];

const en = typeNames({ text: 'text', number: 'number', decimal: 'decimal', date: 'date', datetime: 'datetime', boolean: 'boolean' });
export const importMessagesEn: ImportMessages = Object.freeze({
  invalid: (type: ColumnType) => `not a valid ${en(type)} value`,
  required: 'required value is empty',
  missingColumn: 'required column is missing',
  duplicateColumn: 'column appears twice; the first one is used',
});

const tr = typeNames({ text: 'metin', number: 'sayı', decimal: 'ondalık sayı', date: 'tarih', datetime: 'tarih ve saat', boolean: 'evet/hayır' });
export const importMessagesTr: ImportMessages = Object.freeze({
  invalid: (type: ColumnType) => `geçerli bir ${tr(type)} değeri değil`,
  required: 'zorunlu değer boş',
  missingColumn: 'zorunlu kolon eksik',
  duplicateColumn: 'kolon iki kez var; ilki kullanıldı',
});

const de = typeNames({ text: 'Text', number: 'Zahl', decimal: 'Dezimalzahl', date: 'Datum', datetime: 'Datum mit Uhrzeit', boolean: 'Ja/Nein' });
export const importMessagesDe: ImportMessages = Object.freeze({
  invalid: (type: ColumnType) => `kein gültiger Wert (${de(type)})`,
  required: 'Pflichtwert fehlt',
  missingColumn: 'Pflichtspalte fehlt',
  duplicateColumn: 'Spalte kommt doppelt vor; die erste wird verwendet',
});

const fr = typeNames({ text: 'texte', number: 'nombre', decimal: 'nombre décimal', date: 'date', datetime: 'date et heure', boolean: 'oui/non' });
export const importMessagesFr: ImportMessages = Object.freeze({
  invalid: (type: ColumnType) => `valeur invalide (${fr(type)})`,
  required: 'valeur obligatoire manquante',
  missingColumn: 'colonne obligatoire manquante',
  duplicateColumn: 'colonne en double ; la première est utilisée',
});

const es = typeNames({ text: 'texto', number: 'número', decimal: 'número decimal', date: 'fecha', datetime: 'fecha y hora', boolean: 'sí/no' });
export const importMessagesEs: ImportMessages = Object.freeze({
  invalid: (type: ColumnType) => `valor no válido (${es(type)})`,
  required: 'falta un valor obligatorio',
  missingColumn: 'falta una columna obligatoria',
  duplicateColumn: 'columna duplicada; se usa la primera',
});

const MESSAGES: Readonly<Record<string, ImportMessages>> = Object.freeze({
  en: importMessagesEn, tr: importMessagesTr, de: importMessagesDe, fr: importMessagesFr, es: importMessagesEs,
});

/** The import messages for a BCP 47 locale (`'de-AT'` → German), English otherwise. */
export function resolveImportMessages(locale: string | undefined, overrides: Partial<ImportMessages> = {}): ImportMessages {
  const language = (locale ?? 'en').toLowerCase().split(/[-_]/)[0] ?? 'en';
  return { ...(MESSAGES[language] ?? importMessagesEn), ...overrides };
}
