// The <script> build: window.AcunDataTable, everything in one file.
import { AcunDataTable } from './acun-datatable';

(globalThis as { AcunDataTable?: typeof AcunDataTable }).AcunDataTable = AcunDataTable;
