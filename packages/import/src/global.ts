// The <script> build: window.AcunImport, next to window.AcunDataTable.
//   <script src="…/acun-datatable-import.min.js"></script>
//   new AcunDataTable('#orders', { buttons: [AcunImport.importButton({ url: '/api/orders/import', table: … })] });
import { createImportClient } from './client';
import { importButton, openImport } from './ui';
import { resolveImportLabels } from './labels';

const AcunImport = Object.freeze({ openImport, importButton, createImportClient, resolveImportLabels });
(globalThis as unknown as { AcunImport: typeof AcunImport }).AcunImport = AcunImport;
