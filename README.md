# Letsgo2Travel

Next.js 16 App Router ile hazırlanmış seyahat affiliate platformu.

## Bu sürümde yapılanlar

- Renk sistemi daha premium hale getirildi: koyu lacivert, petrol turkuazı ve yumuşak altın tonları.
- Ana sayfa daha detaylı hale getirildi:
  - Hero istatistik kartları
  - Öne çıkan kampanya analizi
  - Rota koleksiyonları
  - Nasıl çalışır planlama akışı
  - Güven/affiliate açıklama paneli
  - Daha detaylı SEO blog alanı
- Kampanyalar sayfası bölge etiketleri ve kullanıcı notlarıyla genişletildi.
- Vizesiz ülkeler sayfası açıklayıcı kategori kartlarıyla detaylandırıldı.
- eSIM, Oteller ve Turlar sayfaları satış/affiliate akışına daha uygun içerikle zenginleştirildi.
- Fallback demo verileri genişletildi: daha fazla uçuş fırsatı, ülke rehberi ve blog içeriği eklendi.
- Header menüsü düzenlendi; fiyat alarmı ve blog akışı öne çıkarıldı.
- Next build ortamında çok fazla worker açılmasını engellemek için `next.config.ts` içine güvenli build concurrency ayarı eklendi.

## Kurulum

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

## Kontrol

```bash
npm run lint
npm run build
```

Bu paket içinde `node_modules`, `.next` ve gerçek `.env.local` dosyaları yoktur.
