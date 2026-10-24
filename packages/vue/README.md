# @acunsoft/datatable-vue

Vue 3 components and composables for
[`@acunsoft/datatable-core`](https://www.npmjs.com/package/@acunsoft/datatable-core):
an accessible table, pagination, search, a column menu and bulk actions, with
slots for custom cells. Written with render functions: no build plugin needed.

```bash
npm install vue @acunsoft/datatable-core @acunsoft/datatable-vue
```

```vue
<script setup lang="ts">
import { ref } from 'vue';
import {
  AcunBulkActions, AcunColumnToggle, AcunDataTable, AcunPageInfo, AcunPageSize, AcunPagination, AcunSearch,
  labelsTr, useDataTable,
} from '@acunsoft/datatable-vue';
import '@acunsoft/datatable-dom/styles.css'; // optional neutral styles

const orders = ref<Order[]>([]); // replace the array to update the table
const { table } = useDataTable<Order>({
  data: orders,
  columns: [
    { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
    { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', enableSorting: true },
    { id: 'status', header: 'Durum', accessorKey: 'status' },
  ],
  locale: 'tr',
});
const rowActions = [{ id: 'edit', label: 'Düzenle', onSelect: (row) => edit(row.original) }];
const bulk = [{ id: 'archive', label: 'Arşivle', onSelect: ({ ids }) => archive(ids) }];
</script>

<template>
  <!-- The same layout as renderDataTable: a bar above and a bar below the table. -->
  <div class="adt">
    <div class="adt-bar adt-top">
      <div class="adt-bar-start">
        <AcunPageSize :table="table" :labels="labelsTr" :page-sizes="[10, 25, 50]" />
        <div class="adt-feature--search"><AcunSearch :table="table" :labels="labelsTr" /></div>
      </div>
      <div class="adt-bar-end">
        <AcunColumnToggle :table="table" :labels="labelsTr" />
      </div>
    </div>
    <AcunBulkActions :table="table" :actions="bulk" :labels="labelsTr" />
    <AcunDataTable :table="table" caption="Siparişler" locale="tr" selectable :labels="labelsTr" :row-actions="rowActions">
      <template #cell-status="{ value }">
        <span :class="`badge badge--${value}`">{{ value }}</span>
      </template>
    </AcunDataTable>
    <div class="adt-bar adt-bottom">
      <div class="adt-bar-start"><AcunPageInfo :table="table" :labels="labelsTr" /></div>
      <div class="adt-bar-end"><AcunPagination :table="table" :labels="labelsTr" locale="tr" /></div>
    </div>
  </div>
</template>
```

## Composables

- **`useDataTable(options)`** creates a table for the component and destroys it
  with the component. `data` may be an array, a ref or a getter; a new array
  replaces the data (local mode). Returns `{ table, state, page, visibleColumns,
  totalRows }`, all reactive.
- **`useTable(table)`** follows a table you created yourself (for example a
  server-mode table connected with `@acunsoft/datatable-http`); it unsubscribes
  with the component and does not destroy the table.

## Components

| Component | Props |
|---|---|
| `AcunDataTableLayout` | `table`, `labels`, `locale`, `pageSizes`, `search`, `searchPlaceholder`, `debounceMs`, `filters`, `columnToggle`, `tools`, `bulkActions`, `paging`, `size`; other attributes and the cell slots go to `AcunDataTable`; slots `top-start`, `top-end`, `bottom-start`, `bottom-end` |
| `AcunFilters` · `AcunFilterChips` · `AcunTools` | `table`, `labels`, `locale` · `items` |
| `AcunDataTable` | `table`, `caption`, `selectable`, `locale`, `labels`, `format`, `rowLabel`, `rowActions`, `maxInlineActions`, `status`, `skeleton`, `onEdit`, `virtual`, `fixedColumns`, `resizableColumns`, `reorderableColumns`, `responsive`, `size`, `stickyHeader`, `scrollY`, `multiSort` |
| `AcunPagination` | `table`, `siblings`, `boundaries`, `firstLast`, `locale`, `labels` |
| `AcunPageSize` | `table`, `pageSizes`, `labels` |
| `AcunPageInfo` | `table`, `labels` |
| `AcunSearch` | `table`, `placeholder`, `debounceMs`, `labels` |
| `AcunColumnToggle` | `table`, `labels` |
| `AcunBulkActions` | `table`, `actions`, `labels` |

The markup, `adt-*` class names, keyboard behaviour and accessibility match
[`@acunsoft/datatable-dom`](https://www.npmjs.com/package/@acunsoft/datatable-dom)
(its README describes them), so `@acunsoft/datatable-dom/styles.css` styles
both. `AcunDataTable` slots: `cell-<columnId>` or `cell` with
`{ column, row, value, text }`, `empty`, and `detail` with `{ row }`: a child
row under each row, opened by a ⊕ button (in the dialog with
`responsive="modal"`). The `detail` slot renders only while its row is open,
so a component in it can fetch its own data when it mounts:

```vue
<AcunDataTable :table="table">
  <template #detail="{ row }"><OrderLines :order-id="row.id" /></template>
</AcunDataTable>
```

Everything is rendered as text by Vue; nothing uses `v-html`.

Server mode: pass the HTTP runner as `status` to show loading and error
states, as with the DOM renderer.

## License

[MIT](LICENSE). Provided “as is”, without warranty of any kind; the authors and Acunsoft accept no liability for any damage or data loss arising from its use (see LICENSE).
