# LetsGo2Travel — Aşama 0 Değişiklik Raporu (31.08.2026)

> Bu depo sürümünde uçuş arama/karşılaştırma/crawler/worker/provider sistemleri
> **kalıcı olarak** kaldırılmıştır. **HOTFIX (01.09.2026):** Bağımsız uçuş fiyat
> alarmı KORUNAN üründür ve geri getirilmiştir (e-posta + telefon push bildirimi;
> ayrıntı: FIYAT-ALARMI-HOTFIX-NOTU.md). Uçuş arama/karşılaştırma geri GELMEMİŞTİR. LetsGo2Travel artık bir seyahat
> işletim sistemidir: etkinlik/destinasyon keşfi, uçuş hariç bütçe, Seyahat
> Kokpiti ve topluluk. Ayrıntılı teslim raporu için proje sahibine iletilen
> `ASAMA0-TESLIM-RAPORU.md` belgesine bakın.

## Kaldırılanlar (özet)

- **Meta-arama:** `lib/flights/**`, `app/api/flights/**`, `app/api/internal/flights/**`,
  `/ucak-bileti-ara`, `/flights`, `/canli-ucus`, `FlightSearchExperience`, `FlightSearchCard`
- ~~Fiyat alarmı~~ → **HOTFIX ile geri getirildi** (bağımsız araç): `/fiyat-kontrolu`,
  `/profil/fiyat-alarmlari`, `/admin/fiyat-alarmlari`, `/api/flight-alerts/**`,
  `/api/cron/check-price-alerts` (cron-job.org tetikler; Vercel cron bilinçli olarak GERİ EKLENMEDİ),
  `lib/price-alert*`, yalnız alarm kontrolü için `lib/travelpayouts.ts`
- **Fırsat (biletler) sistemi:** `/kampanyalar`, `/ucak-bileti/[slug]`, `app/api/{firsatlar,one-cikan-rotalar,ucak-bileti}`,
  `app/api/admin/biletler/**`, `HomeDealsTicker`, `HomeDealPreview`, `DealCard`, `lib/prices.ts`
- **Worker:** `flight-worker/**`, `docker-compose.flight-worker.yml` (repo tarafı; VDS temizliği ayrı onaylı)
- **Mobil:** `FlightSearchScreen`, `AirportAutocomplete`, uçuş API/storage katmanı, "Bilet Ara" sekme/deep-link'i
- **SEO/PWA:** uçuş sitemap girdileri, manifest kısayolu, uçuş metadata/JSON-LD metinleri
- **Admin:** Uçuş Kaynakları ve Fiyat Alarmları ekranları; dashboard'daki fırsat CRUD/KPI'ları
- **Dokümanlar/scriptler:** 8 adet `UCUS-META-ARAMA-*` dosyası, kök dizindeki manuel
  `supabase_price_alerts_mail_upgrade.sql` scripti ve `supabase/rollback/` altındaki 2
  yardımcı rollback scripti (standart migration geçmişinin DIŞINDAKİ dosyalar).
  **`supabase/migrations/` altındaki 3 uçuş migration'ı ise KORUNDU** — production'da
  uygulanmış olabilecek migration geçmişi silinmez; kaldırma yalnız yeni ileri yönlü
  migration'larla yapılır (aşağıda), `supabase migration repair` gerektiren durum yoktur

## Eski URL davranışı

Tüm eski uçuş sayfaları ve API'leri `proxy.ts` üzerinden kontrollü **410 Gone**
döner (sayfalar için noindex HTML, API'ler için JSON); hiçbir job, sağlayıcı
çağrısı veya veri yazımı üretmez. `npm run smoke` bunu doğrular.

## Korunanlar

- Seyahat Kokpiti + `trips` tablosu (manuel uçuş / **PNR** dahil) — web + mobil
- `visa-worker/**`, tüm vize sistemi, Chrome Vize Yardımcısı
- `lib/airports.ts` + `/api/airports` (gelecekteki Havalimanı Rehberi temeli)
- eSIM/oteller/turlar affiliate akışları, `app/go` (aviasales çıkarıldı), `affiliate_clicks`
- Topluluk, forum, Kaşifler Ligi, rozet/puan, blog, ülke rehberleri, hukuki sayfalar
- `mail_delivery_logs` (artık RLS kilitli), newsletter/`subscribers`

## Yeni migration'lar (`supabase/migrations/`) — PRODUCTION'A UYGULANMADI

| Sıra | Dosya | Amaç |
|---|---|---|
| 1 | `20260901000000_secure_price_alert_tables_interim.sql` | Geçici kilit: flight_price_alerts/_logs RLS + service_role-only |
| 2 | `20260901000100_secure_mail_delivery_logs.sql` | Kalıcı kilit: mail_delivery_logs RLS + service_role-only |
| 3 | `20260901100000_remove_flight_meta_search_system.sql` | 15 meta-arama tablosu + 4 fonksiyon (CASCADE'siz, sayım NOTICE'lı) |
| 4 | `20260901110000_remove_flight_price_alert_data.sql` | **NO-OP yapıldı (hotfix):** alarm verisi silinmeyecek |
| 5 | `20260901120000_remove_biletler_deal_system.sql` | user_favorites → biletler → increment_deal_click |
| 6 | `20260901130000_remove_country_guides_avg_flight_price.sql` | Tahmini uçuş fiyatı kolonu düşer; `airport_code` korunur |
| 7 | `20260901140000_rename_forum_flight_category.sql` | Forum kategorisi "Uçak Bileti & Havalimanı" → "Uçuş & Havalimanı" (içerik silinmez, slug korunur) |

Zincirin tamamı izole lokal PostgreSQL 16 klonunda test edildi: önce tarihsel
şema (kök scriptler + `supabase/migrations` altındaki 7 eski migration) kuruldu,
ardından 7 yeni migration sırayla uygulandı (7/7 exit 0; korunan veriler ve
forum içerikleri doğrulandı). Her biri production'da **ayrı, exact-adlı onay**
ister; 3–6 öncesinde şifreli managed backup + restore testi zorunludur.

## Kaldırılan env anahtar adları (yalnız ad)

`FLIGHT_WORKER_SECRET`, `FLIGHT_RATE_LIMIT_SECRET`, `FLIGHT_DISABLED_SOURCES`,
`ENUYGUN_MCP_ENABLED`, `TRAVELPAYOUTS_TOKEN`, `NEXT_PUBLIC_TRAVELPAYOUTS_MARKER`,
`TRAVELPAYOUTS_MARKER`, flight-worker'a özel `API_BASE_URL`/`WORKER_NAME`/poll
ayarları. Kod ve build bunların hiçbiri olmadan çalışır (doğrulandı).
Vercel/VDS/GitHub taraflarındaki kaldırma işlemleri ayrı onaylıdır; runtime
referansını kaldırmak sağlayıcı credential'ını revoke etmek değildir.

## Diğer

- `package.json` adı `bilet-sitem` → `letsgo2travel` (lockfile güncellendi)
- `country_guides.avg_flight_price` alanının tüm kod referansları (tip + örnek veri) kaldırıldı
- Forum kategorisi etiketi kodda "Uçuş & Havalimanı" oldu (slug `ucak-bileti-havalimani` korunarak — URL'ler kırılmaz); DB satırları için kontrollü data migration hazır
- BottomNav ortası ve ana sayfa arama bölümü **Keşfet** odaklı yapıldı
- Bütçe hesaplayıcı artık **uçuş hariç** çalışır ve zorunlu açıklamayı gösterir
- `public/sw.js` cache `l2t-shell-v31` (eski uçuş shell'leri düşer)
- iDATA kurulum TXT'lerindeki VDS IP/SSH bilgisi `<VDS_SUNUCU_IP>` ile maskelendi
- Fiyat alarmı kapanış e-postası planı KALDIRILDI (hizmet kapanmıyor; hotfix)
- Yeni: `supabase/migrations/20260902000000_price_alert_push_devices.sql` (push cihaz + idempotency; production'a uygulanmadı)
