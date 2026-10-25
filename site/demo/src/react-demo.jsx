// The React demo, as an app would write it (bundled by scripts/demo-assets.mjs).
import { createRoot } from 'react-dom/client';
import { DataTableLayout, labelsTr, useDataTable } from '@acunsoft/datatable-react';
import { orders, statusLabel } from './data.js';

function Orders() {
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
  return (
    <DataTableLayout table={table} locale="tr" labels={labelsTr} selectable responsive="auto" pageSizes={[8, 25, 50]}
      cells={{ status: ({ value }) => <span className={`badge badge--${value}`}>{statusLabel[value]}</span> }} />
  );
}

window.mountReactDemo = element => {
  const root = createRoot(element);
  root.render(<Orders />);
  return () => root.unmount();
};
