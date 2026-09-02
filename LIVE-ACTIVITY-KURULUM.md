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

## Migration (ayrı onay — uygulanmadan da her şey çalışır)

`supabase/migrations/20260902100000_cockpit_flight_fields.sql` trips
tablosuna nullable origin/destination IATA + havayolu + uçuş no ekler.
Kod, sütunlar yokken güvenli eski moda düşer; migration uygulanınca
form alanları kaydedilmeye ve Ada/kilit ekranında IATA görünmeye başlar.

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
