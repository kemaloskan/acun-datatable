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

export const labelsEn: DataTableLabels = Object.freeze({
  empty: 'No matching rows',
  selectAll: 'Select all rows on this page',
  selectRow: (name: string) => `Select ${name}`,
  pagination: 'Pagination',
  previous: 'Previous',
  next: 'Next',
  pageStatus: (page: number, pageCount: number, totalRows: number) => `Page ${page} of ${pageCount} · ${totalRows} rows`,
  pageStatusOpen: (page: number) => `Page ${page}`,
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
  selectedCount: (count: number) => `${count} selected`,
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
  pageStatus: (page: number, pageCount: number, totalRows: number) => `Sayfa ${page} / ${pageCount} · ${totalRows} kayıt`,
  pageStatusOpen: (page: number) => `Sayfa ${page}`,
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
  selectedCount: (count: number) => `${count} seçili`,
  clearSelection: 'Seçimi temizle',
  columns: 'Kolonlar',
  showColumns: 'Gösterilecek kolonlar',
});
