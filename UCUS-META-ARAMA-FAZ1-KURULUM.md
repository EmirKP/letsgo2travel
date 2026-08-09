# LetsGo2Travel Uçuş Meta-Arama Faz 1 — Kurulum

## Önemli durum

Bu paket üretim temeli ve dürüst “kaynak erişimi bekleniyor” akışıdır. Enuygun, Ucuzabilet veya doğrudan havayolu için resmî API/sandbox/credential sağlanmadığından canlı uçuş sonucu üretmez. Migration başlangıçta bütün kaynakları pasif ve `partner_access_required` olarak ekler.

Canlı ortama geçmeden önce gerçek deponun mevcut `tsconfig.json`, ESLint/Next yapılandırması ve canlı Supabase şemasıyla merge incelemesi yapın. Bu teslimde eksik olan orijinal root config dosyalarının yerine yeni config uydurulmadı.

## 1. Ortam değişkenleri

Web/API ortamına aşağıdaki üç bağımsız server-only değeri ekleyin:

```bash
openssl rand -hex 32
openssl rand -hex 32
openssl rand -hex 32
```

İlk çıktıyı `FLIGHT_WORKER_SECRET`, ikinci çıktıyı `FLIGHT_RATE_LIMIT_SECRET`, üçüncü çıktıyı `ADMIN_SESSION_SECRET` olarak tanımlayın. Production admin oturumu ortak `ADMIN_PASSWORD` değerini imza anahtarı olarak kullanmaz ve dedicated secret eksikse fail-closed davranır. Bunları `NEXT_PUBLIC_*` adıyla eklemeyin ve mobil uygulamaya koymayın.

Mevcut Supabase server ayarlarının da hazır olması gerekir:

```text
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY veya SUPABASE_SECRET_KEY
```

## 2. Supabase migration

Önce canlı veritabanının yedeğini alın ve migration'ı staging projesinde deneyin:

```bash
supabase link --project-ref PROJE_REF
supabase db push --dry-run
supabase db push
```

Uygulanacak dosya:

```text
supabase/migrations/20260809_flight_meta_search_foundation.sql
```

Migration sonrasında doğrulayın:

```sql
select id, integration_status, permission_status, enabled
from public.flight_sources
order by id;

select schemaname, tablename, policyname
from pg_policies
where tablename like 'flight_%' or tablename = 'connector_health_logs'
order by tablename, policyname;

select relname, relrowsecurity
from pg_class
where relname like 'flight_%' or relname = 'connector_health_logs';
```

Beklenen kaynak durumu: üç kaynak da `enabled=false`; resmî izin ve connector bitmeden bunu SQL ile zorla değiştirmeyin.

Acil geri dönüş gerekirse `supabase/rollback/20260809_flight_meta_search_foundation_rollback.sql` dosyasını yalnız yedek aldıktan ve Faz 1 verisinin silinmesini açıkça kabul ettikten sonra elle çalıştırın. Bu dosya `db push` tarafından otomatik uygulanmaz; `pgcrypto` veya paylaşılan `extensions` şemasını kaldırmaz.

Canlı şemada ayrıca `profiles.role` kolonunun sıradan kullanıcı tarafından güncellenemediğini RLS ve column grant seviyesinde doğrulayın. Mevcut repo bu kritik admin-role migration'ını içermediği için bu kontrol otomatik kanıtlanamadı.

## 3. Web/API dağıtımı

Gerçek depodaki config dosyalarıyla standart doğrulama akışını çalıştırın:

```bash
npm ci
npm run test:flights
npm run lint
npm run build
```

Bu paketin incelendiği eksik snapshotta root `tsconfig.json` ve ESLint config bulunmadığından tam Next production build sertifikası verilemedi. Standart Next alias ayarlarıyla yapılan bağımsız strict TypeScript kontrolü geçti.

## 4. VDS worker

VDS üzerinde proje kökünde:

```bash
cp flight-worker/.env.example .env.flight-worker
chmod 600 .env.flight-worker
```

`.env.flight-worker` içinde:

```text
API_BASE_URL=https://www.letsgo2travel.com.tr
FLIGHT_WORKER_SECRET=web_ortamindaki_ayni_uzun_secret
WORKER_NAME=flight-worker-01
BUSY_POLL_INTERVAL_MS=3000
IDLE_POLL_INTERVAL_MS=15000
CLAIM_LIMIT=2
CONNECTOR_TIMEOUT_MS=30000
```

Ardından:

```bash
docker compose -f docker-compose.flight-worker.yml build --pull
docker compose -f docker-compose.flight-worker.yml up -d
docker compose -f docker-compose.flight-worker.yml ps
docker compose -f docker-compose.flight-worker.yml logs --tail=100 flight-worker
```

Worker service-role anahtarı taşımaz. Yalnız HTTPS üzerinden `x-flight-worker-secret` ile internal claim/report/heartbeat uçlarına gider. Faz 1 connector'ları ağdan fiyat çekmez ve `integration_required` raporlar.

## 5. Partner erişimleri

Public sayfa taramasında Enuygun veya Ucuzabilet için entegrasyonda kullanılabilecek açık, resmî partner API sözleşmesi bulunmadı. Bu, API olmadığı anlamına gelmez; ticari erişim doğrudan yazılı olarak istenmelidir.

- Enuygun: [resmî site](https://www.enuygun.com/) ve [iletişim](https://www.enuygun.com/iletisim/)
- Ucuzabilet: [resmî site](https://www.ucuzabilet.com/) ve [iletişim](https://www.ucuzabilet.com/iletisim)

Başvuruda arama kapsamı, fiyat/bagaj/fare-rule alanları, rate limit, cache, revalidation, deep-link, affiliate tracking, KVKK/veri saklama ve production kullanım iznini yazılı olarak netleştirin. Doğrudan havayolu için ilgili havayolunun resmî NDC/partner programı ayrı ayrı onaylanmalıdır.

## 6. Bir kaynağı etkinleştirme sırası

1. Yazılı izin ve sözleşmeyi `flight_source_permissions` içinde secrets içermeden kaydedin.
2. Credential'ı yalnız VDS/server secret store'a ekleyin.
3. Kaynak mapper/search/revalidation/checkout testlerini staging'de çalıştırın.
4. Kaynağın checkout domainini kod allowlist'ine ekleyin.
5. `RUNTIME_READY_CONNECTORS` içine yalnız gerçekten tamamlanan connector kimliğini ekleyin.
6. DB'de `permission_status=approved`, `integration_status=active` yapın.
7. Admin panelinden kaynağı etkinleştirin.

Bu sıra tamamlanmazsa admin API kaynağı etkinleştirmeyi reddeder.

## 7. Operasyon kontrolleri

- `/admin/ucus-kaynaklari`: kaynak, izin, connector ve worker durumu.
- Worker heartbeat iki dakikadan eskiyse VDS loglarını inceleyin.
- Arama API'si `RATE_LIMIT_NOT_CONFIGURED` verirse migration ve `FLIGHT_RATE_LIMIT_SECRET` ayarını kontrol edin.
- `NO_ACTIVE_SOURCES` benzeri boş durum üretimde beklenen Faz 1 davranışıdır; fixture veya sahte fiyatla kapatmayın.
- Eski `flight_price_alerts` sistemi bu Faz 1 migration'ına taşınmadı. Çok kaynaklı alarm Faz 3 işi olarak ayrı ele alınmalıdır.
