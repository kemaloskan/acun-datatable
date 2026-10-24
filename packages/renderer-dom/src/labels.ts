/** Every user-visible or screen-reader text the renderers produce. */
export interface DataTableLabels {
  readonly empty: string;
  readonly selectAll: string;
  /** Receives the row's name (see `rowLabel`), not its raw ID. */
  readonly selectRow: (name: string) => string;
  readonly pagination: string;
  readonly previous: string;
  readonly next: string;
  readonly first: string;
  readonly last: string;
  /** Accessible name of a page-number button. */
  readonly page: (page: number) => string;
  /** Range of the visible rows: `Showing 1 to 25 of 5,000 rows`. */
  readonly pageInfo: (from: number, to: number, totalRows: number) => string;
  /** Server mode when the server does not report a total: only the range is known. */
  readonly pageInfoOpen: (from: number, to: number) => string;
  readonly pageInfoEmpty: string;
  /** Accessible name of the page-size select. */
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
  first: 'First',
  last: 'Last',
  page: (page: number) => `Page ${en.number(page)}`,
  pageInfo: (from: number, to: number, totalRows: number) =>
    `Showing ${en.number(from)} to ${en.number(to)} of ${en.number(totalRows)} ${en.one(totalRows) ? 'row' : 'rows'}`,
  pageInfoOpen: (from: number, to: number) => `Showing rows ${en.number(from)} to ${en.number(to)}`,
  pageInfoEmpty: 'No rows to show',
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
  first: 'İlk',
  last: 'Son',
  page: (page: number) => `Sayfa ${tr.number(page)}`,
  pageInfo: (from: number, to: number, totalRows: number) =>
    `Toplam: ${tr.number(totalRows)} kaydın ${tr.number(from)} ile ${tr.number(to)} arasını gösteriyor`,
  pageInfoOpen: (from: number, to: number) => `${tr.number(from)} ile ${tr.number(to)} arasındaki kayıtları gösteriyor`,
  pageInfoEmpty: 'Gösterilecek kayıt yok',
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
  first: 'Erste',
  last: 'Letzte',
  page: (page: number) => `Seite ${de.number(page)}`,
  pageInfo: (from: number, to: number, totalRows: number) =>
    `${de.number(from)} bis ${de.number(to)} von ${de.number(totalRows)} ${de.one(totalRows) ? 'Eintrag' : 'Einträgen'}`,
  pageInfoOpen: (from: number, to: number) => `Einträge ${de.number(from)} bis ${de.number(to)}`,
  pageInfoEmpty: 'Keine Einträge vorhanden',
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
  first: 'Première',
  last: 'Dernière',
  page: (page: number) => `Page ${fr.number(page)}`,
  pageInfo: (from: number, to: number, totalRows: number) =>
    `Affichage de ${fr.number(from)} à ${fr.number(to)} sur ${fr.number(totalRows)} ${fr.one(totalRows) ? 'ligne' : 'lignes'}`,
  pageInfoOpen: (from: number, to: number) => `Affichage des lignes ${fr.number(from)} à ${fr.number(to)}`,
  pageInfoEmpty: 'Aucune ligne à afficher',
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
  first: 'Primera',
  last: 'Última',
  page: (page: number) => `Página ${es.number(page)}`,
  pageInfo: (from: number, to: number, totalRows: number) =>
    `Mostrando ${es.number(from)} a ${es.number(to)} de ${es.number(totalRows)} ${es.one(totalRows) ? 'fila' : 'filas'}`,
  pageInfoOpen: (from: number, to: number) => `Mostrando filas ${es.number(from)} a ${es.number(to)}`,
  pageInfoEmpty: 'No hay filas para mostrar',
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
