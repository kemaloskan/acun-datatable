// The <script> build: window.AcunDataTable, everything in one file.
import { el } from '@acunsoft/datatable-dom';
import { AcunDataTable } from './acun-datatable';

// AcunDataTable.el builds safe custom cells without a bundler.
(globalThis as { AcunDataTable?: typeof AcunDataTable }).AcunDataTable = Object.assign(AcunDataTable, { el });
