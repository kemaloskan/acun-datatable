// The rows of the framework demos: the same 120 orders for every framework.
const names = ['Ayşe Yılmaz', 'Ali Kaya', 'İrem Şahin', 'Çağrı Öztürk', 'Zeynep Doğan', 'Ümit Kılıç', 'Deniz Ak', 'Gülşen Erdoğan', 'Hakan Çelik', 'Şule Aydın'];
const cities = ['İstanbul', 'Ankara', 'İzmir', 'Bursa', 'Antalya', 'Konya'];
const statuses = ['new', 'paid', 'shipped', 'cancelled'];
export const orders = Array.from({ length: 120 }, (_, i) => ({
  id: i + 1, customer: names[(i * 7) % names.length], city: cities[(i * 5) % cities.length],
  total: (((i * 2654435761 + 31337) % 2_500_000) / 100 + 40).toFixed(2), status: statuses[(i * 3) % statuses.length],
}));
export const statusLabel = { new: 'Yeni', paid: 'Ödendi', shipped: 'Kargoda', cancelled: 'İptal' };
