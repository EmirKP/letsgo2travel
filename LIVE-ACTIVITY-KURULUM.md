# Dynamic Island / Live Activity — Kurulum Durumu

> Widget Extension hedefi artık **doğrudan `project.pbxproj` içinde**:
> elle Xcode adımı KALMADI. `npm run mobile:doctor` widget hedefini,
> eklenti kaydını ve Info.plist beyanlarını otomatik denetler.

## Depoda hazır olanlar (Xcode adımı gerektirmez)

- `ios/App/App.xcodeproj/project.pbxproj`
  - `FlightActivityWidget` hedefi (`com.apple.product-type.app-extension`,
    bundle: `tr.com.letsgo2travel.app.FlightActivityWidget`, iOS 16.2,
    build 9 / 1.4.0 uygulamayla aynı)
  - "Embed Foundation Extensions" fazı (`dstSubfolderSpec = 13` → PlugIns)
  - `FlightActivityAttributes.swift` HEM App HEM widget hedefinde derlenir
  - `FlightLiveActivityPlugin.swift` + `MainViewController.swift` App
    hedefinde derlenir
- `ios/App/FlightActivityWidget/Info.plist` —
  `NSExtensionPointIdentifier = com.apple.widgetkit-extension`
- `ios/App/App/Info.plist` — `NSSupportsLiveActivities = YES`
- `ios/App/App/Base.lproj/Main.storyboard` — köprü denetleyicisi
  `MainViewController` (Capacitor 8'de uygulama içi özel eklenti kaydı
  için resmî yöntem; `capacitorDidLoad` içinde
  `registerPluginInstance(FlightLiveActivityPlugin())`)
- `codemagic.yaml` — `ios_signing.bundle_identifier` deseni
  (`tr.com.letsgo2travel.app*`) widget profilini de kapsar
- JS katmanı: `mobile/src/lib/liveActivity.ts` (eklenti yoksa/desteksizse
  otomatik YEREL BİLDİRİM fallback'i — akış hiçbir cihazda kırılmaz)

## Kalan DIŞ adımlar (yalnız Apple hesabı/imzalama; kod adımı değil)

1. **App Store Connect / Developer hesabında** widget App ID'sinin
   (`tr.com.letsgo2travel.app.FlightActivityWidget`) oluşması: Codemagic
   otomatik imzalama (App Store Connect entegrasyonu) ilk build'de App
   ID + profili kendisi oluşturabilir; oluşturamazsa Developer portalda
   bir kez elle açılır. Live Activity için ek entitlement GEREKMEZ
   (uygulama içi başlatma).
2. Codemagic'te build alınıp TestFlight'a gönderilmesi (mevcut iş akışı;
   komut değişikliği yok).
3. Migration'ların üretim Supabase'ine uygulanması (yukarıdaki iki dosya;
   ayrı onay).
4. Harici zamanlayıcıya (fiyat alarmı cron'u ile aynı mekanizma) yeni iş:
   her 10–15 dakikada `GET /api/cron/live-activity`,
   `Authorization: Bearer <CRON_SECRET>` başlığıyla.

## Push-to-start mimarisi (uygulama KAPALIYKEN otomatik başlatma)

"Uygulama açılınca kalkışa ≤3 saat varsa başlat" yaklaşımı otomatik
sayılmaz; gerçek otomasyon APNs `liveactivity` push'u ile yapılır:

1. **Cihaz (iOS 17.2+)**: `FlightLiveActivityPlugin` yüklenirken
   `pushToStartTokenUpdates` dinlenir; token JS'e event ile verilir.
   Uygulama içinden başlatılan aktiviteler `pushType: .token` ile açılır
   ve güncelleme/bitirme tokenları da (`pushTokenUpdates`) JS'e akar.
2. **JS** (`mobile/src/lib/liveActivityPush.ts`): tokenlar Bearer
   oturumla `/api/live-activity/tokens`'a kaydedilir (bellek dışında
   saklanmaz, loglanmaz; oturum yoksa girişten sonra flush edilir).
3. **Sunucu**: `live_activity_tokens` + `live_activity_events` tabloları
   (RLS default-deny, service-role); kayıt ucu trip SAHİPLİĞİNİ doğrular.
4. **Cron** `GET /api/cron/live-activity` (yalnız `Bearer CRON_SECRET`):
   - kalkışa ≤3 saat kalan uçuşlar için push-to-start gönderir
     (`apns-push-type: liveactivity`, topic
     `tr.com.letsgo2travel.app.push-type.liveactivity`),
   - kalkış +1 saat geçince activity-update tokenıyla `event: end`
     gönderir → aktivite uygulama açılmadan da BİTER,
   - mükerrer göndermez (`live_activity_events`), geçersiz tokenları
     kapatır; token değeri hiçbir log/yanıtta yoktur.
5. **Fallback**: iOS 16.2–17.1 veya token kaydı yoksa mevcut davranış
   aynen sürer: uygulama açıkken başlatma + yerel bildirim hatırlatması.

Mevcut `APNS_TEAM_ID / APNS_KEY_ID / APNS_PRIVATE_KEY / APNS_BUNDLE_ID /
APNS_ENVIRONMENT` değerleri aynen kullanılır; yeni secret GEREKMEZ.

## Migration (ayrı onay — uygulanmadan da her şey çalışır)

- `supabase/migrations/20260902100000_cockpit_flight_fields.sql`: trips
  tablosuna nullable origin/destination IATA + havayolu + uçuş no ekler.
  Kod, sütunlar yokken güvenli eski moda düşer (42703 emniyeti);
  migration uygulanınca alanlar otomatik devreye girer.
- `supabase/migrations/20260902120000_live_activity_push_tokens.sql`:
  push-to-start token/event tabloları. Uygulanana kadar token kayıt ucu
  503 döner ve istemci sessiz geçer; cron da güvenle hata döndürür.

GÜVENLİ DAĞITIM SIRASI: (1) kod yayını (migration'suz da çalışır) →
(2) migration'lar → (3) cron zamanlaması. Ters sıra da kırmaz; bu sıra
en az gürültülü olandır.

## Fiziksel cihaz testi (zorunlu — bunlar yapılmadan "doğrulandı" DENMEZ)

1. iPhone 14 Pro+ (Dynamic Island) ve Ada'sız bir cihaz (kilit ekranı
   görünümü) ile test et.
2. Kokpitte kalkışı ≤3 saat sonra olan uçuş kaydet → aktivite başlamalı;
   compact/expanded/minimal görünümlerini kontrol et.
3. Aktiviteye dokun → uygulama İLGİLİ Kokpit kaydını açmalı
   (`letsgo2travel://cockpit?tripId=<id>`).
4. Kalkıştan 1 saat sonra aktivite kendiliğinden bitmeli.
5. Live Activity kapalı/desteksiz cihazda: kalkışa 3 saat kala normal
   yerel bildirim gelmeli; dokununca ilgili kayıt açılmalı.
6. Safari Web Inspector konsolunda
   `window.Capacitor.Plugins.FlightLiveActivity` tanımlı olmalı
   (değilse eklenti kaydı sorunlu demektir; JS fallback'te kalır).
