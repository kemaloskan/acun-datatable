// React fixture: the documented pattern — table and runner made once, connected in an effect.
import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { DataTable, DataTableLayout, labelsEn } from '@acunsoft/datatable-react';
import { ordersTable, peopleTable } from './columns.js';

function Orders() {
  const orders = useMemo(() => ordersTable(), []);
  useEffect(() => orders.connect(), [orders]);
  return <DataTableLayout table={orders.table} status={orders.runner} locale="tr" labels={labelsEn} selectable />;
}

function People() {
  const table = useMemo(() => peopleTable(), []);
  return <DataTable table={table} labels={labelsEn} virtual={{ rowHeight: 40 }} scrollY="400px" />;
}

const virtual = new URLSearchParams(location.search).has('virtual');
createRoot(document.getElementById('orders')).render(<StrictMode>{virtual ? <People /> : <Orders />}</StrictMode>);
document.body.dataset.ready = 'true';
