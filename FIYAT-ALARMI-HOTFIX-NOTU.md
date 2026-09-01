# Fiyat Alarmı + Push Bildirim Hotfix Notu (01.09.2026)

> Bağımsız uçuş fiyat alarmı KORUNAN bir üründür ve bu hotfix ile geri
> getirilmiştir. Uçuş arama/karşılaştırma, provider connector'ları ve
> flight-worker GERİ GELMEMİŞTİR; eski uçuş arama URL'leri 410 dönmeye
> devam eder.

## Ne geri geldi / ne yeni

- Web: `/fiyat-kontrolu` (oluşturma), `/profil/fiyat-alarmlari` (yönetim),
  `/admin/fiyat-alarmlari` (admin), `/api/flight-alerts/**`,
  `/api/admin/fiyat-alarmlari/**`, `/api/cron/check-price-alerts`.
- Kanallar: **E-posta** (varsayılan) ve **Telefon bildirimi** (opsiyonel;
  varsayılan KAPALI, yalnız giriş yapmış kullanıcı seçebilir, izin
  kullanıcı "Telefon bildirimi"ni seçtiğinde açıklamalı istenir; ret
  durumunda e-posta ile devam edilir).
- Mobil: "Fiyat Alarmlarım" ekranı (oluştur/listele/durdur/sil/kanal
  değiştir), bildirim dokunuşu bu ekranı açar, profilde bildirim ayarları,
  logout'ta cihaz kaydı kapatılır. Uçuş arama sekmesi YOKTUR.
- Push sunucu katmanı: `lib/push/` — APNs (HTTP/2 + ES256 JWT, .p8) ve
  FCM HTTP v1 (service-account). Harici/ücretli servis eklenmedi.
- Idempotency: `flight_price_alert_notifications` unique(alert_id,
  channel, event_key) — aynı alarm + aynı fiyat olayı için çift gönderim
  engellenir. E-posta ve push ayrı ayrı loglanır; bir kanal düşerse
  diğeri çalışır. Geçersiz tokenlar otomatik devre dışı bırakılır.
- Migration: `20260902000000_price_alert_push_devices.sql`
  (push_devices + notifications; RLS + service-role-only; PUBLIC/anon
  açıkça REVOKE). `20260901110000_remove_flight_price_alert_data.sql`
  NO-OP yapıldı (alarm verisi SİLİNMEYECEK). **Production'a uygulanmadı.**
- Güvenilirlik (v3/v4): retry kuyruğu yeni-olay tespitinden ayrıdır (bir
  kanalın başarısı diğerinin retry'ını durdurmaz; olay snapshot'ı ile
  tamamlanır; en fazla 3 deneme); claim fencing token'lıdır (eski worker
  yeni sonucu ezemez); `mark_alert_notified` RPC'si cooldown alanlarını
  atomik/monotonik günceller (bildirilen fiyat asla yükselmez); cron ~48
  sn'lik soft deadline ile çalışır — yetişmeyen iş attempt harcamadan
  sonraki çalışmaya kalır; push gönderimleri cihaz başına zaman sınırıyla
  paraleldir. Logout yalnız MEVCUT cihazın kaydını kapatır (sunucunun
  döndürdüğü opak cihaz ID'siyle; token yerelde saklanmaz); diğer
  cihazlar açık kalır. `{all:true}` yalnız açık "tüm cihazlarda kapat"
  işlemi içindir.

## Cron

Tetikleyici: mevcut **cron-job.org** görevi ("LetsGo2Travel Fiyat Alarmı
Kontrolü"). Kimlik doğrulama YALNIZ header iledir:
`Authorization: Bearer <CRON_SECRET>`. **Query parametresi (`?secret=`)
desteklenmez ve destek kod düzeyinde kaldırılmıştır** — doğru secret query
ile gönderilse bile 401 döner (URL'ler loglara/proxylere sızabildiği için).
Endpoint yetkisiz istekte 401 döner. Vercel cron bilinçli olarak GERİ
EKLENMEDİ (çift çalışma olmasın). Kod deploy edilene kadar cron-job.org
görevi 410 almaya devam eder. Fiyat kaynağı: Travelpayouts Data API
(yalnız alarm kontrolü için; kullanıcıya arama/karşılaştırma yüzeyi yok).
Fiyat bulunamazsa sahte/tahmini fiyat üretilmez; alarm "fiyat verisi yok"
olarak loglanır.

**Production geçiş notu (deploy sırasında, ayrı onayla — bu paket YAPMAZ):**

1. cron-job.org görevindeki URL'den `?secret=...` kısmını kaldır; URL yalnız
   `https://<site>/api/cron/check-price-alerts` olmalı.
2. Göreve header ekle: `Authorization: Bearer <CRON_SECRET>`.
3. `CRON_SECRET` değerini **rotasyona sok** (eski değer URL'lerde taşındığı
   için sızmış kabul edilmeli): Vercel env'inde yeni değer + cron-job.org
   header'ında aynı yeni değer. Eski değer hiçbir yerde kalmamalı.

## Environment anahtar ADLARI (değerler yalnız Vercel/sunucu env'inde)

Zorunlu (e-posta + cron + fiyat): `CRON_SECRET`, `TRAVELPAYOUTS_TOKEN`,
`RESEND_API_KEY`, `RESEND_FROM`, `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_SITE_URL`
iOS push: `APNS_TEAM_ID`, `APNS_KEY_ID`, `APNS_PRIVATE_KEY` (.p8 PEM içeriği),
`APNS_BUNDLE_ID` (tr.com.letsgo2travel.app), `APNS_ENVIRONMENT` (sandbox|production)
Android push: `FCM_SERVICE_ACCOUNT_JSON` (service-account JSON içeriği)
Tam liste: `.env.example` (yalnız adlar; hiçbir değer repoda yoktur).

## iOS / APNs production kurulum kontrol listesi (Emir / macOS)

1. Apple Developer > Keys: **APNs Auth Key (.p8)** oluştur; Key ID ve
   Team ID'yi not et. `.p8` içeriğini YALNIZ Vercel env'ine koy
   (`APNS_PRIVATE_KEY`); dosyayı repoya/mesaja koyma.
2. Xcode > App target > Signing & Capabilities > **+ Push Notifications**
   capability ekle (entitlements dosyası `App/App.entitlements` zaten
   bağlı; `aps-environment=development` hazır — archive/dağıtımda Xcode
   production'a çevirir; `APNS_ENVIRONMENT=production` yapmayı unutma).
3. `npm run mobile:prepare:ios` sonrası Xcode'da gerçek cihazda çalıştır.
4. Bildirim izni akışı YALNIZ kullanıcı "Telefon bildirimi"ni açınca
   çıkmalı (uygulama ilk açılışında ÇIKMAMALI).
5. AppDelegate'e ek kod gerekmez (Capacitor push eklentisi kendi
   delegate köprüsünü kurar); farklı davranış görülürse eklenti
   dokümantasyonundaki AppDelegate parçalarını uygula.

## Android / FCM production kurulum kontrol listesi

1. Firebase Console'da proje oluştur; Android uygulaması
   `tr.com.letsgo2travel.app` ekle; **google-services.json** indir ve
   YALNIZ yerel build ortamına koy: `android/app/google-services.json`
   (repoya EKLEME — .gitignore'a ekli olduğunu doğrula).
2. `android/build.gradle` ve `android/app/build.gradle` içine Google
   Services plugin'ini ekle (`com.google.gms.google-services`) — bu adım
   json dosyası olmadan build'i bozacağı için repoda YAPILMADI; yerel
   kurulumda yapılır.
3. Firebase > Project Settings > Service accounts: service-account JSON
   üret; içeriğini Vercel `FCM_SERVICE_ACCOUNT_JSON` env'ine koy.
4. Android 13+ bildirim izni manifest'e eklendi; runtime izni kullanıcı
   opt-in'inde istenir.

## Gerçek cihaz test adımları (deploy + env sonrası)

1. iPhone'da (TestFlight/dev build) hesapla giriş yap; Fiyat Alarmlarım >
   yeni alarm > "Telefon bildirimi"ni aç → izin iste ekranı gelmeli;
   izin ver → alarm oluştur.
2. Supabase'de `push_devices` tablosunda cihazın (yalnız satır varlığı)
   oluştuğunu doğrula; token değerini kopyalama/paylaşma.
3. Test alarmı: hedef fiyatı mevcut fiyatın üstünde bir değere koy;
   cron-job.org görevini bir kez elle tetikle (veya `Authorization:
   Bearer <CRON_SECRET>` header'ıyla çağır — `?secret=` ÇALIŞMAZ).
4. Telefona push + e-posta gelmeli; bildirime dokununca uygulama
   "Fiyat Alarmlarım" ekranını açmalı.
5. Cron'u hemen tekrar tetikle → AYNI olay için ikinci bildirim
   GELMEMELİ (idempotency + 24 saat kuralı).
6. İzni sistem ayarlarından kapat → cron sonrası e-posta gelmeye devam
   etmeli; `push_devices` kaydı ilk geçersiz gönderimde devre dışı kalmalı.
7. Logout → cihaz kaydının kapandığını doğrula; Android'de aynı akışı
   tekrar et.
8. Bu adımlar macOS/gerçek cihaz + gerçek APNs/FCM credential gerektirir;
   bu paket ortamında çalıştırılamadıkları için durumları NOT VERIFIED'dır.
