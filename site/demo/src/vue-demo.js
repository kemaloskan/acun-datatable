// The Vue demo, as an app would write it: the template below is the component's template
// (bundled by scripts/demo-assets.mjs with Vue's template compiler).
import { createApp } from 'vue';
import { AcunDataTableLayout, LABELS, useDataTable } from '@acunsoft/datatable-vue';
import { columns, orders, texts } from './data.js';

const Orders = {
  components: { AcunDataTableLayout },
  props: { language: { type: String, default: 'tr' } },
  setup(props) {
    const text = texts(props.language);
    const { table } = useDataTable({ data: orders, locale: props.language, initialState: { pageSize: 8 }, columns: columns(text) });
    return { table, labels: LABELS[props.language], statusLabel: text.status };
  },
  template: `
    <AcunDataTableLayout :table="table" :locale="language" :labels="labels" selectable responsive="auto" :page-sizes="[8, 25, 50]">
      <template #cell-status="{ value }">
        <span :class="'badge badge--' + value">{{ statusLabel[value] }}</span>
      </template>
    </AcunDataTableLayout>`,
};

window.mountVueDemo = (element, language = 'tr') => {
  const app = createApp(Orders, { language });
  app.mount(element);
  return () => app.unmount();
};
