// The Vue demo, as an app would write it: the template below is the component's template
// (bundled by scripts/demo-assets.mjs with Vue's template compiler).
import { createApp } from 'vue';
import { AcunDataTableLayout, labelsTr, useDataTable } from '@acunsoft/datatable-vue';
import { orders, statusLabel } from './data.js';

const Orders = {
  components: { AcunDataTableLayout },
  setup() {
    const { table } = useDataTable({
      data: orders,
      locale: 'tr',
      initialState: { pageSize: 8 },
      columns: [
        { id: 'customer', header: 'Müşteri', accessorKey: 'customer', enableSorting: true, enableFiltering: true },
        { id: 'city', header: 'Şehir', accessorKey: 'city', enableSorting: true, enableFiltering: true },
        { id: 'total', header: 'Tutar', accessorKey: 'total', type: 'decimal', enableSorting: true },
        { id: 'status', header: 'Durum', accessorKey: 'status' },
      ],
    });
    return { table, labelsTr, statusLabel };
  },
  template: `
    <AcunDataTableLayout :table="table" locale="tr" :labels="labelsTr" selectable responsive="auto" :page-sizes="[8, 25, 50]">
      <template #cell-status="{ value }">
        <span :class="'badge badge--' + value">{{ statusLabel[value] }}</span>
      </template>
    </AcunDataTableLayout>`,
};

window.mountVueDemo = element => {
  const app = createApp(Orders);
  app.mount(element);
  return () => app.unmount();
};
