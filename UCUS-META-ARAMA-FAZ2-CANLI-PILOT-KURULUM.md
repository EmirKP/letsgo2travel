# LetsGo2Travel Uçuş Meta-Arama — Faz 2 Canlı Pilot Kurulumu

Tarih: 09.08.2026

Bu sürüm, sahte fiyat veya tüketici sayfası kazıma kullanmadan, resmî Enuygun/Wingie MCP uçuş araçlarından canlı kaynak toplamı alır. LetsGo2Travel ödeme ya da biletleme yapmaz; tutarı seçim anında yeniden doğrular ve kullanıcıyı yalnız allowlist içindeki resmî satıcı alan adına/yoluna yönlendirir. Public şema zorunlu ücret kapsamını açıkça taahhüt etmediği için Enuygun toplamları `partial` işaretlenir ve organik “en ucuz” sıralamasına alınmaz.

## 1. Mimari akış

1. Web veya mobil uygulama `POST /api/flights/searches` ile arama oluşturur.
2. API, her etkin kaynak için Supabase üzerinde bağımsız bir iş üretir.
3. Ayrı `flight-worker`, işi lease/token ile alır ve resmî `flight_search` aracını çağırır.
4. Teklifler doğrulanır ve aynı uçuşlar tek güzergâh altında gruplanır. Yalnız zorunlu ücretleri ve istenen bagajı eksiksiz doğrulanmış teklifler fiyat/değer sıralamasına alınır; süre sıralaması bağımsızdır.
5. İstemci opaque arama tokenıyla sonuçları poll eder; provider checkout URL'si istemciye verilmez.
6. Kullanıcı satıcıyı seçtiğinde fiyat ve bagaj/tarife koşulları `revalidate` edilir. Tutar veya materyal koşul değişmişse ikinci açık onay istenir. Offer CAS güncellemesi ve audit tek DB transaction'ıdır.
7. `flight_allocate`, yeniden aramayla aynı MCP oturumunda çalışır. Deep link yalnız sunucuda üretilir; HTTPS, exact host, exact path ve izinli query şeması kontrolünden sonra aynı sekmede açılır. Redirect ayrıca kullanıcının onayladığı tutar/para birimi/doğrulama sürümünü DB kaydıyla eşleştirir.

## 2. Veritabanı migration'ları

Supabase SQL Editor veya migration pipeline içinde sırayla çalıştırın:

1. `supabase/migrations/20260809_flight_meta_search_foundation.sql`
2. `supabase/migrations/20260809190000_flight_meta_search_live_provider.sql`

İkinci migration:

- `public_mcp` entegrasyon yöntemini ve `public_documented` izin durumunu ekler.
- Enuygun kaynağını yalnız TRY, tek yön/gidiş-dönüş ve 300 saniye tazelik süresiyle etkinleştirir.
- Public-documented kaynakların worker tarafından claim edilmesi için RPC'yi günceller.
- Tekrar çalıştırıldığında adminin sonradan kapattığı kaynağı yeniden açmaz; yalnız yeni satırı veya değişmemiş foundation placeholder'ını aktive eder.
- Sağlayıcı için dakikada 60 çağrılık varsayılan global pilot kotası ve eski rate-limit kayıtları için TTL index/temizliği kurar; admin daha önce özel limit verdiyse migration bunu ezmez.
- Trip.com, Kiwi.com, eDreams ve Mytrip'i partner erişimi bekleyen kapalı katalog girdileri olarak ekler.

Migration'ları önce staging veritabanında çalıştırın. Bu teslim sırasında herhangi bir uzak Supabase projesine migration uygulanmamıştır.

## 3. Web/API ortam değişkenleri

`.env.local.example` dosyasını temel alarak en az şu değerleri tanımlayın:

```dotenv
NEXT_PUBLIC_SITE_URL=https://www.letsgo2travel.com.tr
NEXT_PUBLIC_SUPABASE_URL=https://PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

FLIGHT_WORKER_SECRET=EN_AZ_32_KARAKTER_BAGIMSIZ_SECRET
FLIGHT_RATE_LIMIT_SECRET=EN_AZ_32_KARAKTER_FARKLI_SECRET
FLIGHT_DISABLED_SOURCES=
```

Secret üretmek için örnek:

```bash
openssl rand -hex 32
```

`SUPABASE_SERVICE_ROLE_KEY`, `FLIGHT_WORKER_SECRET` ve `FLIGHT_RATE_LIMIT_SECRET` hiçbir `NEXT_PUBLIC_` değişkenine veya mobil pakete konmamalıdır.

Acil kapatma örneği:

```dotenv
FLIGHT_DISABLED_SOURCES=enuygun
```

## 4. Flight worker kurulumu

Sunucuda `.env.flight-worker` oluşturun:

```dotenv
API_BASE_URL=https://www.letsgo2travel.com.tr
FLIGHT_WORKER_SECRET=WEB_ORTAMIYLA_AYNI_SECRET
WORKER_NAME=flight-worker-01
BUSY_POLL_INTERVAL_MS=3000
IDLE_POLL_INTERVAL_MS=15000
CLAIM_LIMIT=2
CONNECTOR_TIMEOUT_MS=30000
SHUTDOWN_GRACE_MS=25000
ENUYGUN_MCP_ENABLED=true
```

Docker ile:

```bash
docker compose -f docker-compose.flight-worker.yml build
docker compose -f docker-compose.flight-worker.yml up -d
docker compose -f docker-compose.flight-worker.yml logs -f --tail=100
```

Worker read-only filesystem, `no-new-privileges` ve sınırlı geçici klasörle çalışır. Enuygun connector'ı API anahtarı istemeyen resmî public MCP'yi kullanır; ileride eklenecek özel partner connector'larının credential'ları yalnız worker ortamında tutulmalıdır.

## 5. Doğrulama komutları

```bash
npm ci
npm run test:flights
npm run lint -- --max-warnings=0
npx tsc --noEmit
npm run build

npm --prefix flight-worker run check
npm --prefix mobile run lint
npm --prefix mobile run build
npm run mobile:doctor -- --platform=ios
npm run mobile:doctor -- --platform=android
```

Üretimde ayrıca:

- `/admin/ucus-kaynaklari` içinde Enuygun `Aktif`, izin `Resmî olarak herkese açık`, connector `Hazır` görünmelidir.
- Worker heartbeat'i görünmelidir.
- Arama sonucunda checkout URL'si bulunmamalı; yalnız `offerId` üzerinden revalidate/redirect çağrısı yapılmalıdır.
- Fiyat değişikliği senaryosunda kullanıcı ikinci kez onay vermeden yönlendirme olmamalıdır.

## 6. Rollback

Yalnız canlı sağlayıcı adımını geri almak için:

```text
supabase/rollback/20260809190000_flight_meta_search_live_provider_rollback.sql
```

Bu rollback, forward migration'ın migration öncesinde aldığı secret içermeyen Enuygun kaynak snapshot'ını kullanır. Migration sonrasında admin tarafından değiştirilmiş etkinlik/izin kill-switch alanları tahmin edilerek ezilmez; snapshot eksikse güvenli biçimde durur.

Tüm Faz 1 omurgasını da kaldırmak gerekirse, önce canlı sağlayıcı rollback'ini, ardından `supabase/rollback/20260809_flight_meta_search_foundation_rollback.sql` dosyasını çalıştırın.

## 7. Pilot sınırı

Bu teslimde gerçek fiyat veren ilk kaynak Enuygun'dur. Trip.com, Kiwi.com, eDreams, Mytrip, Ucuzabilet ve havayolları resmî partner/sandbox erişimi alınmadan etkinleştirilmez. Mimari çoklu kaynağa hazırdır; kapalı kaynaklar fiyat üretmez ve çalışıyormuş gibi gösterilmez.

Yeni meta-arama, Travelpayouts/Aviasales kullanmaz. Projedeki eski fiyat alarmı uyumluluk kodu ayrı bir legacy modüldür; kaldırılmadığı sürece yalnız o özellik için ilgili ortam değişkenleri gerekebilir.
