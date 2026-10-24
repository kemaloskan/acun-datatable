// Vue fixture: the documented pattern — table and runner made in setup, connected once mounted.
import { createApp, defineComponent, h, onMounted, onUnmounted } from 'vue';
import { AcunDataTableLayout, labelsEn } from '@acunsoft/datatable-vue';
import { ordersTable } from './columns.js';

const Orders = defineComponent(() => {
  const { table, runner, connect } = ordersTable();
  let disconnect;
  onMounted(() => { disconnect = connect(); });
  onUnmounted(() => disconnect?.());
  return () => h(AcunDataTableLayout, { table, status: runner, locale: 'tr', labels: labelsEn, selectable: true });
});

createApp(Orders).mount('#orders');
document.body.dataset.ready = 'true';
