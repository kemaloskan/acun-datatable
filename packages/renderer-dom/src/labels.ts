/** Every user-visible or screen-reader text the renderers produce. */
export interface DataTableLabels {
  readonly empty: string;
  readonly selectAll: string;
  readonly selectRow: (id: string) => string;
  readonly pagination: string;
  readonly previous: string;
  readonly next: string;
  readonly pageStatus: (page: number, pageCount: number, totalRows: number) => string;
  readonly pageSize: string;
  readonly search: string;
}

export const labelsEn: DataTableLabels = Object.freeze({
  empty: 'No matching rows',
  selectAll: 'Select all rows on this page',
  selectRow: (id: string) => `Select row ${id}`,
  pagination: 'Pagination',
  previous: 'Previous',
  next: 'Next',
  pageStatus: (page: number, pageCount: number, totalRows: number) => `Page ${page} of ${pageCount} · ${totalRows} rows`,
  pageSize: 'Rows per page',
  search: 'Search',
});

export const labelsTr: DataTableLabels = Object.freeze({
  empty: 'Eşleşen kayıt yok',
  selectAll: 'Bu sayfadaki tüm satırları seç',
  selectRow: (id: string) => `${id} numaralı satırı seç`,
  pagination: 'Sayfalama',
  previous: 'Önceki',
  next: 'Sonraki',
  pageStatus: (page: number, pageCount: number, totalRows: number) => `Sayfa ${page} / ${pageCount} · ${totalRows} kayıt`,
  pageSize: 'Sayfa başına satır',
  search: 'Ara',
});
