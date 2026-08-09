# LetsGo2Travel Uçuş Meta-Arama — Faz 1 Teslim Raporu

## 1. Oluşturulan mimari

Web ve mobil form `POST /api/flights/searches` ile normalize edilmiş arama oluşturur. API, ortak Postgres rate limitini tüketir, aramayı ve bacakları yazar, yalnız izinli/aktif/kodda hazır connector'lar için job üretir. Worker job'ları lease token ile claim eder; kaynak sonucu server'da normalize edilip itinerary/segment/offer olarak ayrıştırılır. Sonuç API'si erişim tokeni veya sahibiyle kademeli durum ve gruplanmış teklifleri döndürür.

Çekirdek katmanda request validation, connector sözleşmesi, kaynak izolasyonu, normalizer, checkout allowlist, itinerary fingerprint/gruplama, bagaj ve zorunlu ücret duyarlı fiyat uygunluğu ile açıklanabilir sıralama bulunur.

## 2. Gerçek bağlanan bilet kaynakları

Yok. Teslim sırasında hiçbir resmî API sözleşmesi, sandbox, credential veya partner feed sağlanmadı. Production'da sahte uçuş/fiyat üretilmez.

## 3–6. Kaynak durumları

| Kaynak | Gerçek durum | Production davranışı |
|---|---|---|
| Enuygun | Partner/API erişimi bekleniyor | Pasif, `integration_required` |
| Ucuzabilet | Partner/API erişimi bekleniyor | Pasif, `integration_required` |
| Doğrudan havayolu | Havayolu/NDC seçimi ve izin bekleniyor | Pasif, `integration_required` |
| Fixture connector | Yalnız birim testi | `NODE_ENV=test` dışında oluşturulamaz |

Public incelemede kullanılabilir açık partner API sözleşmesi bulunmadı; başvuru için [Enuygun iletişim](https://www.enuygun.com/iletisim/) ve [Ucuzabilet iletişim](https://www.ucuzabilet.com/iletisim) kanalları kullanılmalıdır.

## 7–8. Değiştirilen ve yeni dosyalar

Paket; uçuş core/connector/server modüllerini, async API rotalarını, web/mobil ekranlarını, admin kaynak ekranını, worker'ı, migration'ı, testleri, env örneklerini ve bu belgeleri içerir. Tam liste `UCUS-META-ARAMA-FAZ1-DOSYA-MANIFESTI.txt` dosyasındadır.

Eski Google Flights davranışı artık uçuş sonucu kaynağı olarak kullanılmaz. Uyumluluk ucu ve eski rota CTA'ları LetsGo2Travel'ın kendi arama sayfasına gider. Mevcut küratörlü `biletler` fiyatları canlı itinerary/offer verisi sayılmaz.

## 9. Veritabanı migration'ı

`20260809_flight_meta_search_foundation.sql` mevcut `biletler` ve `flight_price_alerts` verilerine dokunmadan yeni tabloları ekler. Para integer minor unit, zamanlar `timestamptz`, criteria JSONB ve kaynak/iş statusleri kontrollü metin değerleridir. Veri kaybını kabul eden acil geri dönüş için otomatik migration dizini dışında, açık uyarılı `supabase/rollback/20260809_flight_meta_search_foundation_rollback.sql` sağlanmıştır.

Queue claim RPC'si `FOR UPDATE SKIP LOCKED`, 90 saniyelik lease, hash'li lease token, sınırlı attempt ve exhausted job için dead-letter kullanır. Rate-limit RPC'si atomik pencere sayacı uygular. Yeni tabloların tümünde RLS açılır; hassas access-token hash'i ve checkout URL'si içeren tablolar dahil uçuş meta-arama tabloları anon/authenticated rollerine doğrudan kapatılır. Kullanıcı erişimi yalnız owner/opaque-token kontrolü yapan server API üzerinden sağlanır.

Migration staging veya production Supabase'e uygulanmadı; bu ortamda Supabase/PostgreSQL CLI yoktu. Canlı şemayla karşılaştırma zorunludur.

## 10. Worker değişiklikleri

Yeni `flight-worker` Node ESM servisi HTTPS internal API üzerinden claim/report/heartbeat yapar. Service-role taşımaz; ayrı `FLIGHT_WORKER_SECRET` kullanır. Claim edilen işler paralel çalıştırılır, connector timeout'u lease süresinin altında tutulur, aynı report UUID ile üç sınırlı rapor denemesi yapılır ve SIGTERM/SIGINT kontrollü kapanır.

Docker image non-root kullanıcı, read-only filesystem, `no-new-privileges` ve küçük `tmpfs` ile çalışacak şekilde Compose dosyası eklendi.

## 11. Güvenlik önlemleri

- Strict allowlist request validation ve küçük body sınırı.
- Dağıtık/atomik DB rate limit; secret yoksa fail-closed.
- Anonim arama tokeninin yalnız SHA-256 hash'i DB'de.
- Owner veya opaque token kontrolü; sonuçlar `private, no-store`.
- Worker secret için timing-safe karşılaştırma ve ayrı secret.
- Lease ownership, expiry, retry sınırı ve report idempotency.
- İstemciden fiyat/checkout URL kabul etmeyen offer-ID redirect.
- Server-side revalidation zorunluluğu ve connector kodunda sabit HTTPS host allowlist'i.
- Kaynak metin temizleme, provider payload/secret döndürmeme.
- Sponsorlu teklifin organik “en ucuz” ve “en avantajlı” hesabından çıkarılması.
- Admin API'de server rol kontrolü, same-origin mutation, alan allowlist'i ve audit log.
- Production admin cookie'sinde ayrı en az 32 karakter `ADMIN_SESSION_SECRET`; ortak parolaya fallback yok.
- Resmî izin + aktif entegrasyon + kod connector'ı olmadan kaynak açamama.

Canlı DB'de `profiles.role` kolon yetkileri repo migration'larından doğrulanamadı. Admin kaynak kontrolü açılmadan önce sıradan kullanıcının rolünü değiştiremediği kesinleştirilmelidir.

## 12. Testler

`npm run test:flights`: 26/26 geçti. Request, conditional-price güveni, URL allowlist, normalizasyon, rota/yolcu/zaman doğrulaması, bagaj ve zorunlu ücret, farklı para birimi, grouping/codeshare ayrımı, şeffaf ranking, production fixture guard, placeholder connector, adapter override, kaynak hata/no-result/timeout ve malformed/çelişkili sonuçlar kapsandı.

`npm --prefix mobile run lint`: geçti.

`npm --prefix mobile run build`: geçti; 50 modül üretim derlemesinde dönüştürüldü.

`npm --prefix flight-worker run check`: geçti.

Standart Next alias ayarlarıyla inferred strict TypeScript kontrolü: geçti.

## 13. Production build sonucu

Tam Next production build **sertifikalanmadı**. Teslim edilen snapshotta orijinal root `tsconfig.json` ve ESLint config bulunmuyordu; bunları uydurup gerçek depodaki dosyaların üzerine yazmak güvenli değildi. Bağımsız build denemesi de uçuş sayfasına gelmeden snapshotta eksik olan `@/lib/supabase-client` ve `@/lib/visa/appointmentStatus` modüllerinde durdu. Bu nedenle gerçek repoda `npm ci`, `npm run lint`, `npm run test:flights`, `npm run build` tekrar çalıştırılmalıdır.

Mobil production build başarılıdır. Docker/Supabase/VDS çalıştırması ortam araçları ve erişimi olmadığından fiziksel olarak doğrulanmadı.

## 14–15. VDS ve Supabase işlemleri

Tam komutlar `UCUS-META-ARAMA-FAZ1-KURULUM.md` içindedir. Özetle migration staging'de uygulanmalı, server-only secrets eklenmeli, web deploy edilmeli, `.env.flight-worker` VDS'de oluşturulmalı ve Compose ile worker başlatılmalıdır.

## 16. Alınması gereken erişimler

Her pilot kaynak için yazılı ticari/teknik kullanım izni, resmî API/feed/NDC dokümanı, sandbox, credential, kota/cache kuralı, fiyat/bagaj/fare-rule alanları, revalidation ve checkout deep-link sözleşmesi gerekir. Havayolu doğrudan entegrasyonu “genel” bir connector değildir; seçilen her havayolu veya onaylı NDC aggregator ayrı izin ve mapper gerektirir.

## 17. Harici erişim nedeniyle tamamlanamayanlar

- Canlı Enuygun/Ucuzabilet/doğrudan havayolu araması.
- Gerçek çok kaynaklı fiyat karşılaştırması ve kademeli canlı sonuç.
- Gerçek offer revalidation ve checkout deep link.
- Kaynaklar arası FX; onaylı kur kaynağı verilmedi.
- Faz 3 çok kaynaklı fiyat alarmı ve geçmişi.
- Supabase migration/RLS entegrasyon testi, VDS container ve fiziksel iOS/Android testi.

## 18. Bilinen kalan konular

- Mevcut `flight_price_alerts` Travelpayouts tabanlı legacy sistemdir; yeni meta-arama alarmı değildir ve Faz 3'te veri modeli/worker/idempotency ile taşınmalıdır.
- Havalimanı autocomplete mevcut kodda Travelpayouts katalog ucunu kullanmaya devam eder; bu uçuş fiyatı kaynağı değildir fakat istenirse bağımsız yerel airport datasetine taşınmalıdır.
- Job result persistence çok sayıda teklifte tek DB RPC/transaction haline getirilmelidir; mevcut upsert/idempotency temeli pilot öncesi yük testi ister.
- Production persistence sıralaması, test edilen çekirdek ranking fonksiyonuyla tek uygulamada birleştirilmeli; eşzamanlı raporlarda search-generation kilidi veya ayrı deterministik ranking job'ı eklenmelidir.
- Worker'ın 15 saniyelik report HTTP süresi, çoklu DB upsert akışından önce bulk transactional ingest ile uyumlu hale getirilmelidir.
- Geçici network/timeout hataları için `scheduled_at` tabanlı exponential backoff uygulanmalı; kalıcı auth/format/integration hatalarından ayrılmalıdır.
- API/Supabase stub entegrasyon testleri; claim/lease kaybı, duplicate report, CAS ve paralel finalize yarışlarını kapsamalıdır. Mevcut 26 test çekirdek sözleşmeyi doğrular, production route/DB yolunu sertifikalamaz.
- Kaynak toggle ve audit yazımı canlı pilot öncesi tek transactional DB RPC'ye taşınmalıdır; mevcut API audit hatasında best-effort rollback yapar.
- Checkout öncesi gerçek revalidation için ayrı worker queue/handler henüz yoktur; bu nedenle canlı kaynak `supports_revalidation` ile açılamaz.
- Sonuç API'si pilot ölçeğinden önce server-side pagination/explicit cap ile PostgREST satır ve URL sınırlarına karşı sertleştirilmelidir.
- Connector quota/circuit-breaker ve kaynak bazlı cache şeması pilot connector ile birlikte tamamlanmalıdır.
- Arama criteria cache-reuse, esnek tarih, yakın havalimanı, transit-vize uyarısı ve Seyahat Kokpiti bağlantısı sonraki fazlardadır.
- Kaynak `allowed_domains` DB alanı bilgilendirme içindir; güvenlik kararı yalnız kod allowlist'inden alınır.

Sonuç: Bu teslim, gerçek partner erişimi geldiğinde adapter eklenebilecek güvenli ve testli Faz 1 temelidir; tamamlanmış canlı meta-arama ürünü olarak sunulmamalıdır.
