# LetsGo2Travel Build 15

## Bu sürümde

- Ticketmaster'ın kapsamadığı ülkelerde veya sıfır sonuç verdiği aramalarda PredictHQ otomatik yedek sağlayıcı olarak çalışır.
- Şehir alanı serbest metin yerine seçilen ülkeye bağlı, sunucuda doğrulanan seçenekler kullanır.
- Dar ekranlardaki etkinlik formu, kart satırları ve işlem düğmeleri hizalandı.
- Harita yakınlaştırması, native WebView yakınlaştırması ve iOS odak yakınlaştırması kapatıldı.

## Yayın kurulumu

1. Bu Build 15 Git paketini mevcut depo olarak aç veya mevcut depona fetch et.
2. Vercel proje ayarlarında `PREDICTHQ_ACCESS_TOKEN` adında sunucu tarafı ortam değişkeni oluştur.
3. Değeri Production ve gerekiyorsa Preview ortamlarına ekle. Değişken adını `NEXT_PUBLIC_` veya `VITE_` ile başlatma.
4. Build 15 commit'ini yayın dalına gönderip yeniden deploy et.

Ticketmaster anahtarı mevcutsa ana sağlayıcı olarak kalır. PredictHQ anahtarı yoksa uygulama bozulmaz; Ticketmaster ve editoryal kayıtlarla çalışır ancak kapsam dışı ülkelerde canlı sonuçların sınırlı olduğunu bildirir.

Yeni bir Supabase migration'ı yoktur. iOS ve Android web varlıkları Build 15 için üretilip senkronlanmıştır.

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

`npm run smoke`, Supabase ortam değişkenlerinin tanımlı olduğu bir yayın/CI ortamında çalıştırılmalıdır.
