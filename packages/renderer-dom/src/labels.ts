/** Every user-visible or screen-reader text the renderers produce. */
export interface DataTableLabels {
  readonly empty: string;
  readonly selectAll: string;
  /** Receives the row's name (see `rowLabel`), not its raw ID. */
  readonly selectRow: (name: string) => string;
  readonly pagination: string;
  readonly previous: string;
  readonly next: string;
  readonly pageStatus: (page: number, pageCount: number, totalRows: number) => string;
  /** Server mode when the server does not report a total: only the page is known. */
  readonly pageStatusOpen: (page: number) => string;
  readonly pageSize: string;
  readonly search: string;
  /** Text for `true` / `false` cells. */
  readonly yes: string;
  readonly no: string;
  /** Server mode states (with the `status` option of `renderTable`). */
  readonly loading: string;
  readonly error: string;
  readonly retry: string;
  /** Header of the row-actions column. */
  readonly actions: string;
  /** Accessible name of a row-action button: the action and the row's name. */
  readonly rowAction: (action: string, name: string) => string;
  /** Bulk-actions bar. */
  readonly bulkActions: string;
  readonly selectedCount: (count: number) => string;
  readonly clearSelection: string;
  /** Column visibility menu. */
  readonly columns: string;
  readonly showColumns: string;
}

/** Plural-aware word choice and locale digit grouping for count texts. */
function counter(locale: string): { readonly number: (value: number) => string; readonly one: (value: number) => boolean } {
  const numbers = new Intl.NumberFormat(locale);
  const plural = new Intl.PluralRules(locale);
  return { number: value => numbers.format(value), one: value => plural.select(value) === 'one' };
}
const en = counter('en');
const tr = counter('tr');
const de = counter('de');
const fr = counter('fr');
const es = counter('es');

export const labelsEn: DataTableLabels = Object.freeze({
  empty: 'No matching rows',
  selectAll: 'Select all rows on this page',
  selectRow: (name: string) => `Select ${name}`,
  pagination: 'Pagination',
  previous: 'Previous',
  next: 'Next',
  pageStatus: (page: number, pageCount: number, totalRows: number) =>
    `Page ${en.number(page)} of ${en.number(pageCount)} · ${en.number(totalRows)} ${en.one(totalRows) ? 'row' : 'rows'}`,
  pageStatusOpen: (page: number) => `Page ${en.number(page)}`,
  pageSize: 'Rows per page',
  search: 'Search',
  yes: 'Yes',
  no: 'No',
  loading: 'Loading…',
  error: 'The data could not be loaded.',
  retry: 'Try again',
  actions: 'Actions',
  rowAction: (action: string, name: string) => `${action}: ${name}`,
  bulkActions: 'Selected rows',
  selectedCount: (count: number) => `${en.number(count)} selected`,
  clearSelection: 'Clear selection',
  columns: 'Columns',
  showColumns: 'Show columns',
});

export const labelsTr: DataTableLabels = Object.freeze({
  empty: 'Eşleşen kayıt yok',
  selectAll: 'Bu sayfadaki tüm satırları seç',
  selectRow: (name: string) => `${name} satırını seç`,
  pagination: 'Sayfalama',
  previous: 'Önceki',
  next: 'Sonraki',
  pageStatus: (page: number, pageCount: number, totalRows: number) =>
    `Sayfa ${tr.number(page)} / ${tr.number(pageCount)} · ${tr.number(totalRows)} kayıt`,
  pageStatusOpen: (page: number) => `Sayfa ${tr.number(page)}`,
  pageSize: 'Sayfa başına satır',
  search: 'Ara',
  yes: 'Evet',
  no: 'Hayır',
  loading: 'Yükleniyor…',
  error: 'Veriler yüklenemedi.',
  retry: 'Tekrar dene',
  actions: 'İşlemler',
  rowAction: (action: string, name: string) => `${name}: ${action}`,
  bulkActions: 'Seçili satırlar',
  selectedCount: (count: number) => `${tr.number(count)} seçili`,
  clearSelection: 'Seçimi temizle',
  columns: 'Kolonlar',
  showColumns: 'Gösterilecek kolonlar',
});

export const labelsDe: DataTableLabels = Object.freeze({
  empty: 'Keine passenden Einträge',
  selectAll: 'Alle Zeilen auf dieser Seite auswählen',
  selectRow: (name: string) => `${name} auswählen`,
  pagination: 'Seitennavigation',
  previous: 'Zurück',
  next: 'Weiter',
  pageStatus: (page: number, pageCount: number, totalRows: number) =>
    `Seite ${de.number(page)} von ${de.number(pageCount)} · ${de.number(totalRows)} ${de.one(totalRows) ? 'Eintrag' : 'Einträge'}`,
  pageStatusOpen: (page: number) => `Seite ${de.number(page)}`,
  pageSize: 'Zeilen pro Seite',
  search: 'Suchen',
  yes: 'Ja',
  no: 'Nein',
  loading: 'Wird geladen…',
  error: 'Die Daten konnten nicht geladen werden.',
  retry: 'Erneut versuchen',
  actions: 'Aktionen',
  rowAction: (action: string, name: string) => `${action}: ${name}`,
  bulkActions: 'Ausgewählte Zeilen',
  selectedCount: (count: number) => `${de.number(count)} ausgewählt`,
  clearSelection: 'Auswahl aufheben',
  columns: 'Spalten',
  showColumns: 'Angezeigte Spalten',
});

export const labelsFr: DataTableLabels = Object.freeze({
  empty: 'Aucune ligne correspondante',
  selectAll: 'Sélectionner toutes les lignes de cette page',
  selectRow: (name: string) => `Sélectionner ${name}`,
  pagination: 'Pagination',
  previous: 'Précédent',
  next: 'Suivant',
  pageStatus: (page: number, pageCount: number, totalRows: number) =>
    `Page ${fr.number(page)} sur ${fr.number(pageCount)} · ${fr.number(totalRows)} ${fr.one(totalRows) ? 'ligne' : 'lignes'}`,
  pageStatusOpen: (page: number) => `Page ${fr.number(page)}`,
  pageSize: 'Lignes par page',
  search: 'Rechercher',
  yes: 'Oui',
  no: 'Non',
  loading: 'Chargement…',
  error: 'Impossible de charger les données.',
  retry: 'Réessayer',
  actions: 'Actions',
  rowAction: (action: string, name: string) => `${action} : ${name}`,
  bulkActions: 'Lignes sélectionnées',
  selectedCount: (count: number) => `${fr.number(count)} ${fr.one(count) ? 'sélectionnée' : 'sélectionnées'}`,
  clearSelection: 'Effacer la sélection',
  columns: 'Colonnes',
  showColumns: 'Colonnes affichées',
});

export const labelsEs: DataTableLabels = Object.freeze({
  empty: 'No hay filas coincidentes',
  selectAll: 'Seleccionar todas las filas de esta página',
  selectRow: (name: string) => `Seleccionar ${name}`,
  pagination: 'Paginación',
  previous: 'Anterior',
  next: 'Siguiente',
  pageStatus: (page: number, pageCount: number, totalRows: number) =>
    `Página ${es.number(page)} de ${es.number(pageCount)} · ${es.number(totalRows)} ${es.one(totalRows) ? 'fila' : 'filas'}`,
  pageStatusOpen: (page: number) => `Página ${es.number(page)}`,
  pageSize: 'Filas por página',
  search: 'Buscar',
  yes: 'Sí',
  no: 'No',
  loading: 'Cargando…',
  error: 'No se pudieron cargar los datos.',
  retry: 'Reintentar',
  actions: 'Acciones',
  rowAction: (action: string, name: string) => `${action}: ${name}`,
  bulkActions: 'Filas seleccionadas',
  selectedCount: (count: number) => `${es.number(count)} ${es.one(count) ? 'seleccionada' : 'seleccionadas'}`,
  clearSelection: 'Borrar selección',
  columns: 'Columnas',
  showColumns: 'Columnas visibles',
});

/** The bundled label sets by language. */
export const LABELS: Readonly<Record<'en' | 'tr' | 'de' | 'fr' | 'es', DataTableLabels>> = Object.freeze({
  en: labelsEn, tr: labelsTr, de: labelsDe, fr: labelsFr, es: labelsEs,
});

/**
 * The labels for a BCP 47 locale: `'de-AT'` → German, `'pt-BR'` → English
 * (the fallback). Pass `overrides` to change single texts.
 */
export function resolveLabels(locale: string | undefined, overrides: Partial<DataTableLabels> = {}): DataTableLabels {
  const language = (locale ?? 'en').toLowerCase().split(/[-_]/)[0] as keyof typeof LABELS;
  return { ...(LABELS[language] ?? labelsEn), ...overrides };
}
