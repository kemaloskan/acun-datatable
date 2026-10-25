---
"@acunsoft/datatable-dom": patch
"@acunsoft/datatable-react": patch
"@acunsoft/datatable-vue": patch
---

Virtual scrolling keeps the column widths: they are measured once the first
rows are drawn and kept while other rows scroll into view, instead of being
sized anew for every window of rows. They are measured again when the
columns or the table's width change; widths set by the user still win.
