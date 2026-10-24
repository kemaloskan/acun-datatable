// React fixture: the documented pattern — table and runner made once, connected in an effect.
import { StrictMode, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { DataTableLayout, labelsEn } from '@acunsoft/datatable-react';
import { ordersTable } from './columns.js';

function Orders() {
  const orders = useMemo(() => ordersTable(), []);
  useEffect(() => orders.connect(), [orders]);
  return <DataTableLayout table={orders.table} status={orders.runner} locale="tr" labels={labelsEn} selectable />;
}

createRoot(document.getElementById('orders')).render(<StrictMode><Orders /></StrictMode>);
document.body.dataset.ready = 'true';
