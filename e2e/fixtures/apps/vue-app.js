// Vue fixture: the documented pattern — table and runner made in setup, connected once mounted.
import { createApp, defineComponent, h, onMounted, onUnmounted } from 'vue';
import { AcunDataTable, AcunDataTableLayout, labelsEn } from '@acunsoft/datatable-vue';
import { ordersTable, peopleTable } from './columns.js';

const Orders = defineComponent(() => {
  const { table, runner, connect } = ordersTable();
  let disconnect;
  onMounted(() => { disconnect = connect(); });
  onUnmounted(() => disconnect?.());
  return () => h(AcunDataTableLayout, { table, status: runner, locale: 'tr', labels: labelsEn, selectable: true });
});

const People = defineComponent(() => {
  const table = peopleTable();
  return () => h(AcunDataTable, { table, labels: labelsEn, virtual: { rowHeight: 40 }, scrollY: '400px' });
});

createApp(new URLSearchParams(location.search).has('virtual') ? People : Orders).mount('#orders');
document.body.dataset.ready = 'true';
