# Dynamic Island / Live Activity Kurulumu (macOS + Xcode gerektirir)

> Depodaki her şey hazır: Widget Swift kaynakları
> (`ios/App/FlightActivityWidget/`), uygulama içi köprü eklentisi
> (`ios/App/App/FlightLiveActivityPlugin.swift`), JS katmanı
> (`mobile/src/lib/liveActivity.ts`) ve hazırlanan migration
> (`supabase/migrations/20260902100000_cockpit_flight_fields.sql`).
> Widget HEDEFİ pbxproj'a elle eklenmedi (çalışan Codemagic build'ini
> bozmamak için) — aşağıdaki Xcode adımları gerekir. Bu adımlar yapılmadan
> uygulama otomatik olarak YEREL BİLDİRİM fallback'iyle çalışır (kalkışa
> 3 saat kala hatırlatma; dokununca Kokpit açılır) — hiçbir şey kırılmaz.

## 1) Widget Extension hedefi ekle (Xcode)

1. Xcode'da `ios/App/App.xcodeproj` aç → File > New > Target →
   **Widget Extension**.
2. Ad: `FlightActivityWidget` · "Include Live Activity" İŞARETLİ ·
   "Include Configuration App Intent" işaretsiz. Embed: App.
3. Xcode'un ürettiği örnek Swift dosyalarını silip
   `ios/App/FlightActivityWidget/` içindeki iki dosyayı bu hedefe ekle
   (FlightActivityAttributes.swift'i HEM widget HEM App hedefine ekle —
   Target Membership'te iki kutuyu da işaretle).
4. Widget hedefinin Info.plist'ine `NSSupportsLiveActivities = YES`
   zaten şablonda gelir; App hedefinin `ios/App/App/Info.plist` dosyasına da
   `NSSupportsLiveActivities` = `YES` ekle.
5. Deployment target: widget hedefi iOS 16.2 (App hedefi mevcut değerinde
   kalır; plugin @available korumalıdır).

## 2) Köprü eklentisini App hedefine kaydet

1. `FlightLiveActivityPlugin.swift` App klasöründe hazır; Xcode'da App
   hedefine dahil olduğunu doğrula (Target Membership: App).
2. Capacitor 8'de uygulama içi ÖZEL eklenti otomatik keşfedilmez;
   resmî yöntem (https://capacitorjs.com/docs/ios/custom-code):
   App hedefine `MainViewController.swift` ekle:
   ```swift
   import Capacitor

   class MainViewController: CAPBridgeViewController {
       override func capacitorDidLoad() {
           bridge?.registerPluginInstance(FlightLiveActivityPlugin())
       }
   }
   ```
   ve `Main.storyboard`'daki Bridge View Controller'ın Custom Class
   alanını `MainViewController` yap.
3. Doğrulama: uygulama açıkken Safari Web Inspector konsolunda
   `window.Capacitor.Plugins.FlightLiveActivity` tanımlı olmalı.
   (Tanımlı değilse JS katmanı otomatik olarak yerel bildirim
   fallback'inde kalır — hata oluşmaz.)

## 3) İmzalama / dağıtım

- Widget hedefi kendi bundle id'sini alır:
  `tr.com.letsgo2travel.app.FlightActivityWidget` — App ID + profil
  Codemagic'te otomatik imzalamaya ekli olmalı.
- Live Activity için ek entitlement GEREKMEZ (push ile güncelleme
  yapılmıyor; yalnız uygulama içi başlatma).
- App Store: Live Activity görselleri gerçek veri gösterir; boarding/
  gate/gecikme gibi İDDİA edilen canlı veri yoktur (App Review notu).

## 4) Migration (ayrı onay)

`20260902100000_cockpit_flight_fields.sql` trips tablosuna nullable
origin/destination IATA + havayolu + uçuş no ekler. Uygulanmadan da her
şey çalışır; uygulanınca mobil form bu alanları doldurmaya başlayabilir
(kod hazır olduğunda) ve Ada/kilit ekranında IATA kodları görünür.

## 5) Fiziksel cihaz testi (zorunlu — bunlar yapılmadan "doğrulandı" DENMEZ)

1. iPhone 14 Pro+ (Dynamic Island) ve Ada'sız bir cihaz (kilit ekranı
   görünümü) ile test et.
2. Kokpitte kalkışı ≤3 saat sonra olan uçuş kaydet → aktivite başlamalı;
   compact/expanded/minimal görünümlerini kontrol et.
3. Aktiviteye dokun → uygulama Kokpit ekranını açmalı
   (letsgo2travel://cockpit).
4. Kalkıştan 1 saat sonra aktivite kendiliğinden bitmeli.
5. Live Activity kapalı/desteksiz cihazda: kalkışa 3 saat kala normal
   yerel bildirim gelmeli; dokununca Kokpit açılmalı.
