# LetsGo2Travel Build 16

## Bu sürümde

- Kosova etkinlik aramaları `XK` ülke filtresi yerine PredictHQ tarafından desteklenen `PRN` IATA kapsamını kullanır.
- “Dünyaca Ünlü Sanatçılar” alanı yaklaşan konserleri PredictHQ etki puanına göre otomatik sıralar; seçili ülkede sonuç yoksa dünya listesine geçer.
- Etkinlik, kokpit ve fiyat alarmı takvimlerinde geçmiş ve aşırı uzak tarihler engellenir. Bugün için geçmiş bir uçuş saati de kaydedilemez.
- Etkinlik API’si tarihleri kullanıcının IANA saat dilimine göre ayrıca doğrular.
- iOS tarih/saat kutularının sağa taşması giderildi, varış alanındaki gereksiz mavi yüzey kaldırıldı ve kategori seçenekleri kart içinde satıra sarıldı.
- Şehir kaynağı ve canlı etkinlik sağlayıcısı hataları artık “sonuç bulunamadı” durumundan ayrılır ve yeniden deneme sunar.

## Yayın kurulumu

1. Build 16 değişiklik paketini mevcut deponun kökünde uygula.
2. Vercel Production ortamında mevcut `PREDICTHQ_ACCESS_TOKEN` değişkenini koru.
3. Commit’i `main` dalına gönder; Vercel sunucu/API güncellemesini otomatik yayınlasın.
4. Codemagic ile iOS Build 16’yı üretip TestFlight’a gönder.

Yeni bir Supabase migration’ı veya yeni ortam değişkeni yoktur. iOS ve Android web varlıkları paket hazırlanırken Build 16 için yeniden üretilecektir.

## Yerel doğrulama

```bash
npm ci
npm --prefix mobile ci
npm run lint
npm run test:app
npm run test:alerts
npm run build
npm run mobile:prepare:all
```
