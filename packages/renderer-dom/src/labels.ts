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
  /** The "⋮" button of a row's extra actions. */
  readonly moreActions: (name: string) => string;
  /** Bulk-actions bar. */
  readonly bulkActions: string;
  readonly selectedCount: (count: number) => string;
  readonly clearSelection: string;
  readonly selectAllMatching: (total: number) => string;
  readonly allMatchingSelected: (total: number) => string;
  /** Column visibility menu. */
  readonly columns: string;
  readonly showColumns: string;
  /** Responsive `collapse` / `modal`: the details button of a row and the dialog title. */
  readonly details: (name: string) => string;
  readonly close: string;
  /** Filter panel and chips. */
  readonly filters: string;
  readonly clearFilters: string;
  readonly removeFilter: (column: string) => string;
  readonly activeFilters: (count: number) => string;
  readonly filterAny: string;
  readonly filterMin: string;
  readonly filterMax: string;
  readonly filterFrom: string;
  readonly filterTo: string;
  /** Tools menu (export, copy, print). */
  readonly tools: string;
  readonly export: string;
  readonly exportExcel: string;
  readonly exportCsv: string;
  readonly copy: string;
  readonly copied: (count: number) => string;
  readonly print: string;
  readonly exportTooLarge: (max: number) => string;
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
  details: (name: string) => `Details of ${name}`,
  close: 'Close',
  filters: 'Filters',
  clearFilters: 'Clear filters',
  removeFilter: (column: string) => `Remove filter: ${column}`,
  activeFilters: (count: number) => `${en.number(count)} ${en.one(count) ? 'filter' : 'filters'} active`,
  filterAny: 'Any',
  filterMin: 'Min',
  filterMax: 'Max',
  filterFrom: 'From',
  filterTo: 'To',
  tools: 'Tools',
  export: 'Export',
  exportExcel: 'Excel (.xlsx)',
  exportCsv: 'CSV',
  copy: 'Copy',
  copied: (count: number) => `${en.number(count)} ${en.one(count) ? 'row' : 'rows'} copied`,
  print: 'Print',
  exportTooLarge: (max: number) => `The export exceeds ${en.number(max)} rows; narrow the filters.`,
  moreActions: (name: string) => `More actions: ${name}`,
  selectAllMatching: (total: number) => `Select all ${en.number(total)} matching rows`,
  allMatchingSelected: (total: number) => `All ${en.number(total)} matching rows selected`,
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
  details: (name: string) => `${name} ayrıntıları`,
  close: 'Kapat',
  filters: 'Filtreler',
  clearFilters: 'Filtreleri temizle',
  removeFilter: (column: string) => `Filtreyi kaldır: ${column}`,
  activeFilters: (count: number) => `${tr.number(count)} filtre etkin`,
  filterAny: 'Tümü',
  filterMin: 'En az',
  filterMax: 'En çok',
  filterFrom: 'Başlangıç',
  filterTo: 'Bitiş',
  tools: 'Araçlar',
  export: 'Dışa aktar',
  exportExcel: 'Excel (.xlsx)',
  exportCsv: 'CSV',
  copy: 'Kopyala',
  copied: (count: number) => `${tr.number(count)} satır kopyalandı`,
  print: 'Yazdır',
  exportTooLarge: (max: number) => `Dışa aktarma ${tr.number(max)} satırı aşıyor; filtreleri daraltın.`,
  moreActions: (name: string) => `Diğer işlemler: ${name}`,
  selectAllMatching: (total: number) => `Eşleşen ${tr.number(total)} kaydın tümünü seç`,
  allMatchingSelected: (total: number) => `Eşleşen ${tr.number(total)} kaydın tümü seçili`,
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
  details: (name: string) => `Details zu ${name}`,
  close: 'Schließen',
  filters: 'Filter',
  clearFilters: 'Filter zurücksetzen',
  removeFilter: (column: string) => `Filter entfernen: ${column}`,
  activeFilters: (count: number) => `${de.number(count)} Filter aktiv`,
  filterAny: 'Alle',
  filterMin: 'Min.',
  filterMax: 'Max.',
  filterFrom: 'Von',
  filterTo: 'Bis',
  tools: 'Werkzeuge',
  export: 'Exportieren',
  exportExcel: 'Excel (.xlsx)',
  exportCsv: 'CSV',
  copy: 'Kopieren',
  copied: (count: number) => `${de.number(count)} ${de.one(count) ? 'Zeile' : 'Zeilen'} kopiert`,
  print: 'Drucken',
  exportTooLarge: (max: number) => `Der Export übersteigt ${de.number(max)} Zeilen; grenzen Sie die Filter ein.`,
  moreActions: (name: string) => `Weitere Aktionen: ${name}`,
  selectAllMatching: (total: number) => `Alle ${de.number(total)} passenden Einträge auswählen`,
  allMatchingSelected: (total: number) => `Alle ${de.number(total)} passenden Einträge ausgewählt`,
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
  details: (name: string) => `Détails de ${name}`,
  close: 'Fermer',
  filters: 'Filtres',
  clearFilters: 'Effacer les filtres',
  removeFilter: (column: string) => `Retirer le filtre : ${column}`,
  activeFilters: (count: number) => `${fr.number(count)} ${fr.one(count) ? 'filtre actif' : 'filtres actifs'}`,
  filterAny: 'Tous',
  filterMin: 'Min.',
  filterMax: 'Max.',
  filterFrom: 'Du',
  filterTo: 'Au',
  tools: 'Outils',
  export: 'Exporter',
  exportExcel: 'Excel (.xlsx)',
  exportCsv: 'CSV',
  copy: 'Copier',
  copied: (count: number) => `${fr.number(count)} ${fr.one(count) ? 'ligne copiée' : 'lignes copiées'}`,
  print: 'Imprimer',
  exportTooLarge: (max: number) => `L’export dépasse ${fr.number(max)} lignes ; affinez les filtres.`,
  moreActions: (name: string) => `Autres actions : ${name}`,
  selectAllMatching: (total: number) => `Sélectionner les ${fr.number(total)} lignes correspondantes`,
  allMatchingSelected: (total: number) => `Les ${fr.number(total)} lignes correspondantes sont sélectionnées`,
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
  details: (name: string) => `Detalles de ${name}`,
  close: 'Cerrar',
  filters: 'Filtros',
  clearFilters: 'Borrar filtros',
  removeFilter: (column: string) => `Quitar filtro: ${column}`,
  activeFilters: (count: number) => `${es.number(count)} ${es.one(count) ? 'filtro activo' : 'filtros activos'}`,
  filterAny: 'Todos',
  filterMin: 'Mín.',
  filterMax: 'Máx.',
  filterFrom: 'Desde',
  filterTo: 'Hasta',
  tools: 'Herramientas',
  export: 'Exportar',
  exportExcel: 'Excel (.xlsx)',
  exportCsv: 'CSV',
  copy: 'Copiar',
  copied: (count: number) => `${es.number(count)} ${es.one(count) ? 'fila copiada' : 'filas copiadas'}`,
  print: 'Imprimir',
  exportTooLarge: (max: number) => `La exportación supera ${es.number(max)} filas; acota los filtros.`,
  moreActions: (name: string) => `Más acciones: ${name}`,
  selectAllMatching: (total: number) => `Seleccionar las ${es.number(total)} filas coincidentes`,
  allMatchingSelected: (total: number) => `Las ${es.number(total)} filas coincidentes están seleccionadas`,
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
