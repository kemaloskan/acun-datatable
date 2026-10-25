// The React demo, as an app would write it (bundled by scripts/demo-assets.mjs).
import { createRoot } from 'react-dom/client';
import { DataTableLayout, LABELS, useDataTable } from '@acunsoft/datatable-react';
import { columns, orders, texts } from './data.js';

function Orders({ language }) {
  const text = texts(language);
  const { table } = useDataTable({ data: orders, locale: language, initialState: { pageSize: 8 }, columns: columns(text) });
  return (
    <DataTableLayout table={table} locale={language} labels={LABELS[language]} selectable responsive="auto" pageSizes={[8, 25, 50]}
      cells={{ status: ({ value }) => <span className={`badge badge--${value}`}>{text.status[value]}</span> }} />
  );
}

window.mountReactDemo = (element, language = 'tr') => {
  const root = createRoot(element);
  root.render(<Orders language={language} />);
  return () => root.unmount();
};
