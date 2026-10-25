// The rows of the framework demos: the same 120 orders for every framework. The texts
// (column names, statuses) come from the page's dictionary, i18n.js.
const names = ['Ayşe Yılmaz', 'Ali Kaya', 'İrem Şahin', 'Çağrı Öztürk', 'Zeynep Doğan', 'Ümit Kılıç', 'Deniz Ak', 'Gülşen Erdoğan', 'Hakan Çelik', 'Şule Aydın'];
const cities = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya'];
const statuses = ['new', 'paid', 'shipped', 'cancelled'];
export const orders = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1, customer: names[(i * 7) % names.length], city: cities[(i * 5) % cities.length],
  total: (((i * 2654435761 + 31337) % 2_500_000) / 100 + 40).toFixed(2), status: statuses[(i * 3) % statuses.length],
}));
export const texts = language => window.DEMO_I18N?.[language] ?? window.DEMO_I18N?.tr;
export const columns = text => [
  { id: 'customer', header: text.col.customer, accessorKey: 'customer', enableSorting: true, enableFiltering: true },
  { id: 'city', header: text.col.city, accessorKey: 'city', enableSorting: true, enableFiltering: true },
  { id: 'total', header: text.col.total, accessorKey: 'total', type: 'decimal', enableSorting: true },
  { id: 'status', header: text.col.status, accessorKey: 'status' },
];
