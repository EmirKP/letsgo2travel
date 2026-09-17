# LetsGo2Travel — sonraki sürüm geliştirme teslimi

Tarih: 16 Eylül 2026. Geliştirme dalı: `feature/travel-assistant-v1_1-20260916`.
Başlangıç: `origin/main` / `fad8ee2`. Çalışma: `C:\Projects\letsgo2travel-next-20260916`.
“v1.1” bu talepteki geliştirme fazının adıdır. Mevcut 1.4.0 sürümü 1.1.0'a düşürülmedi.
İlk inceleme raporu: `MEVCUT-DURUM.md`.

## Yapılanlar

- Mevcut Yol Arkadaşın ve Güvenli Seyahat ekranları ortak Seyahat Asistanı'na bağlandı.
  Ana sayfadan doğrudan giriş eklendi; ifadeler, TTS, eski Şimdi ekranı ve diğer araçlar korundu.
- Acil numaralar ortak ve kaynaklı bir pakette toplandı. Cockpit de aynı numaraları kullanır.
  Bilinmeyen ülkeye başka ülkenin numarası veya varsayılan 112/911 atanmaz.
  Arama bağlantıları tek telefon numarası taşır. Paylaşım mevcut native paylaşım aracını kullanır.
- İhtiyaç ve gezi haritaları ayrı kategorilerle açılır. Leaflet mevcut dünya haritasının yerine geçmez.
  Yakın noktalar gruplanır; kategori, ücretsiz, 24 saat, erişilebilirlik ve vatandaşlık filtreleri vardır.
  Mesafeler kuş uçuşu ve aranan merkeze göredir. Nokta kartında saat, kaynak, mevcutsa açıklama/web sitesi
  ve dış haritada yol tarifi bulunur. Eksik saatlerden “şimdi açık” sonucu çıkarılmaz.
- Konum yalnız düğmeye basılınca istenir. Cihaz koordinatı yaklaşık 1 km hassasiyetine yuvarlanır.
  Konum olmadan Berlin, İstanbul, Paris, Tokyo, Roma veya Londra merkezi seçilebilir.
- Temsilcilik kartları pasaport tercihinden başlayan vatandaşlık ve gidilen ülkeye göre filtrelenir.
  Acil Mod aynı temsilcilik bileşenini açar; telefon, adres, kaynak, randevu/saat ve yol tarifi gösterilir.
- Para Merkezi mevcut Frankfurter sağlayıcısını kullanır: çift seçimi, miktar, önceki yayımlanan değer,
  değişim yüzdesi ve yön. Günlük referans kur olduğu açıkça belirtilir. Son 32 çift cihazda tutulur;
  bağlantı hatasında kayıtlı değer kullanılabilir. Yedi günden eski kurla güncel hesap yapılmaz.
- Su, Tax Free, saat, kanun ve kültür kartları cihaz paketindedir. Eski yerel ipuçlarındaki doğrulanmış
  kanuni içerikler aynı ortak rehberden beslenir; kanun ve kültürel/pratik tavsiye ayrı etiketlenir.
- Yeni API'ler sınırlı girdi kabul eder. POI sorguları 3 km, en çok 250 ham kayıt, 4 MB yanıt ve
  süre sınırıyla çalışır. Aynı yaklaşık konumun eşzamanlı istekleri birleştirilir; sağlayıcı hatasında
  60 saniye bekleme uygulanır. Tamamlanmamış Overpass yanıtı başarılı sonuç sayılmaz.
- Yeni testler yayın kontrol zincirine eklendi. Üç eski kaynak-kod sözleşmesi yeni ekran bağlantılarına
  uyarlandı. İki eski test dosyasındaki lint sorunları yalnız test koşucusu düzeyinde düzeltildi.

## Değişen ve yeni dosyalar

Eksiksiz liste ve SHA-256 özetleri `DOSYALAR.json` içindedir. ZIP proje köküne göre dosya yollarını korur.
Başlıca gruplar:

- `lib/travel-assistant/`: ortak tipler, acil/rehber verisi, POI normalleştirme, kur hesapları, sunucu.
- `app/api/travel-assistant/`: harita ve kur uç noktaları.
- `mobile/src/components/Travel*.tsx`, `travel-assistant.css`: asistan, para, güvenlik, harita ve liste.
- Mevcut Home, App, TravelCompanion, JourneyTools, travelEssentials ve Cockpit bağlantıları.
- Mobil bağımlılık dosyaları, geliştirme proxy ayarı, testler ve raporlar.

ZIP'e `.env`, anahtar, node_modules, derleme çıktısı, native kopyalanmış varlık, log veya önbellek konmadı.
Üretilmiş native dosyalar yeniden derleme/eşitlemeyle hazırlanmalıdır.

## Migration

Yok. Supabase şeması, RLS ve production verisi değiştirilmedi. Mevcut tablolar bu statik rehber ve
önbellek ihtiyacı için yeni PostGIS tablosu gerektirmiyordu. İndirilebilir paket veya topluluk noktası
için ileride eklemeli migration, yetki ve veri kaynağı tasarımı gerekir.

## Gerekli ENV isimleri

Yeni zorunlu gizli anahtar yok. Mevcut build için `NEXT_PUBLIC_SUPABASE_URL` ve
`NEXT_PUBLIC_SUPABASE_ANON_KEY` (veya mobil `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) gerekir.
`VITE_API_BASE_URL` native uygulamanın hedef sunucusunu belirler. Yerel geliştirmede API çağrıları
Vite proxy'sinden geçer; bu değeri yerel Next sunucusuna yönlendirin. Release build HTTPS ister.

İsteğe bağlı sunucu değişkeni: `TRAVEL_OVERPASS_URL` — HTTPS kullanan yönetilen/kendi Overpass servisi.
Boşsa public Overpass kullanılır. Bu değer istemciye aktarılmaz. Service-role veya özel anahtarları
VITE değişkenlerine koymayın. Bu teslim ENV değerleri içermez.

## Test sonuçları

- Yeni çekirdek testleri: 9/9. Numara güvenliği, ülke yokluğu, koordinat/query doğrulama,
  POI kategorileri ve belirsiz alanlar, temsilcilik filtresi, kur tarih/çift/değişim hesabı,
  tutar girişi, eşzamanlı istek birleştirme, servis bekleme ve eşzamanlılık sınırı.
- Uygulama testleri: 139/139. Yayın zinciri ayrıca Live Activity, bildirim, hesap silme,
  topluluk moderasyonu/veritabanı, destek, veri bütünlüğü ve iOS gizlilik testlerini kapsar.
- Kök ve mobil lint çalıştırıldı. TypeScript kontrolleri ve Next/Vite production derlemeleri yapıldı.
- `mobile:prepare:all`: mobil build, iOS/Android Capacitor sync ve mobile doctor çalıştırıldı.
  Android FCM yapılandırma dosyası bulunmadığından doktor bir uyarı verir; kritik hata yoktur.
- Tarayıcıda 390×844 telefon görünümü: ülke seçimi, tel bağlantısı, temsilcilik kartı,
  gerçek OSM ihtiyaç/gezi listeleri ve kümelenmiş harita, eczane/müze filtresi, detay penceresi,
  gerçek EUR/TRY ve 350 AED dönüşümü, geçersiz tutar ve konum alınamaması kontrol edildi.
- 1024×1366 tablet görünümünde İngilizce içerik ve kanun/kültür etiketleri kontrol edildi.
  Hazır ifadelere geçişte Japonya seçiminin korunduğu doğrulandı. Son tarayıcı kontrolünde
  kaydedilmiş JavaScript konsol hatası yoktu.
- Gezi sağlayıcısında gerçek bir geçici hata gözlendi; görünür hata ve başarılı tekrar deneme doğrulandı.
- Yerel API: gerçek kur ve Berlin POI yanıtı 200; hatalı çift/koordinat 400, büyük gövde 413.

Yerel `.env` dosyalarındaki Supabase değerleri geçersizdi. Derlemeler sahte, yalnız doğrulamaya yönelik
public yapılandırmayla yapıldı. Bunlar yayın varlığı değildir. Gerçek Supabase giriş/oturum işlemleri,
Apple/Google OAuth, cihaz push/Live Activity teslimi, iPhone telefon/paylaşım penceresi ve signed
iOS/Android binary testi yapılmış sayılmaz. Windows'ta Xcode derlemesi yapılamaz.

## Eksikler ve kapsam

| İçerik | Bu pakette doğrulanmış kapsam |
|---|---|
| Acil numaralar | TR, DE, FR, IT, ES, XK, AL, AE, JP, TH, GE, BA, NL, US, CA, GB |
| Çevrimdışı temsilcilik | Türkiye'nin Berlin, Tokyo ve Londra büyükelçilikleri |
| Musluk suyu | Japonya ve Almanya |
| Tax Free | Japonya, Birleşik Krallık, BAE, Fransa, Hollanda |
| Genel çalışma saati | Japonya; tekil işletme saatlerinden ayrı |
| Kaynaklı kanun kartı | Japonya, Tayland, BAE, İspanya, İtalya |
| Kaynaklı kültür kartı | Japonya bahşiş; mevcut kültürel/pratik ipuçları ayrıca korunur |

**Dünya çapında içerik tamamlandı veya mağazaya hazır yeni build oluştu iddiası yoktur.**
Kapsanmayan alanlar açıkça “doğrulanmış kayıt yok” gösterir. Tüm vatandaşlıkların temsilcilikleri,
bankalar/kamu/AVM/restoranlar için ülke bazında ayrıntılı saatler ve bütün ülkelere ait Tax Free/su
kayıtları hâlâ genişletilmelidir. Temsilcilik koordinatları doğrulanmadığında `null` kalır;
adres üzerinden dış harita açılır. Haritadaki OSM temsilciliği resmî doğrulanmış kart olarak sunulmaz.

OSM noktalarında açıklama, ücret, vatandaşlık ve saat etiketleri eksik olabilir. Eksik değerler ücretsiz,
erişilebilir veya açık sayılmaz. Kapalı/şimdi açık hesabı ve resmî tatil motoru eklenmedi.
250 ham kayıt sınırı tüm yakın hizmetleri gösterme garantisi vermez; arayüz bunu belirtir.
OSM raster zemin en iyi çaba hizmetidir; çevrimdışı indirme/prefetch yapılmaz, attribution korunur.

Next Data Cache 1 saatlik POI hücreleri saklar. Dağıtık cache davranışı hosting'e bağlıdır;
12 istek/dakika ve 2 eşzamanlı sağlayıcı isteği sınırı süreç başınadır, küresel kota değildir.
Yüksek trafikten önce yönetilen Overpass ve dağıtık rate-limit/hosting cache doğrulaması gerekir.
Kur sağlayıcısı kesintisi ve desteklemediği para çiftleri görünür veri yokluğu ile sonuçlanır.
Japonya Tax Free kartı 31 Ekim 2026'ya kadarki rejimi etiketler; sonraki tarihte yeniden kontrol ister.

## Geriye uyumluluk

Bu rapor 16 Eylül'deki yerel ZIP teslimini açıklar. 17 Eylül'de kullanıcının kurulum
talebi üzerine eklenen ayrı test servisi ve TestFlight iş akışı için `KURULUM.md` dosyasına bakın.

App Store'daki 1.4.0 (47) gönderimine dokunulmadı. Deploy, push, merge, yeni mağaza gönderimi veya
production migration yapılmadı. Bundle ID, signing, entitlements, URL scheme, privacy manifest,
native izinler ve release sürüm bilgisi korunur. Eski API uç noktaları değiştirilmedi.
Kaynak manifestteki native 27 ile CI'ın gönderdiği 47 farklı seviyelerdir; bu çalışma sayı atamaz.
Mevcut kullanıcı oturumu, veri tabloları ve eski istemci sözleşmeleri bu paketin dışında kalır.

## Kurulum ve yeniden kontrol

1. Temiz `fad8ee2` tabanlı ayrı geliştirme dalında ZIP dosyalarını proje köküne yerleştirin.
   Daha yeni kod varsa dosyaları körlemesine ezmek yerine değişiklikleri karşılaştırın.
2. Proje kökünde `npm ci`, ardından `npm --prefix mobile ci` çalıştırın.
3. Kendi ortamınıza ait mevcut public ENV yapılandırmasını sağlayın; ZIP ENV içermez.
4. `npm run lint`, `npm --prefix mobile run lint`, `npm run test:release` çalıştırın.
5. `npm run build` ve `npm run mobile:prepare:all` çalıştırın.
6. Staging API ile gerçek cihazda izin reddi/izin verme, telefon, paylaşım, çevrimdışı yeniden açılış,
   giriş/çıkış, deep link, bildirim ve küçük ekran testlerini tamamlayın.
7. Sonraki gerçek sürüm/build numarasını yayın aşamasında ayrı belirleyin. Bu paket production'a
   otomatik yayımlanmaz ve incelemedeki binary'nin yerine geçmez.

## v1.2'ye bırakılanlar

İndirilebilir ülke/şehir paketleri, offline çeviri, lisanslı offline harita, GTFS, AI kamera rehberi,
gelişmiş TTS, kapsamlı temsilcilik veri hattı ve PostGIS/topluluk doğrulaması. Kamera izni veya AI'a
görsel gönderme bu sürüme eklenmedi. Native paketteki rehberler ağsızdır; web için ayrı çevrimdışı
ilk ziyaret/PWA garantisi verilmez.

## Kaynak bakımı

Her kritik yeni kaydın kendi `sourceUrl` ve `verifiedAt` alanı vardır. Numaralar GOV.UK resmî seyahat
rehberlerinden, temsilcilikler ilgili `mfa.gov.tr/Mission/Contact` sayfalarından kontrol edildi.
Su/rehber kartlarında JNTO, Alman Umweltbundesamt, ilgili gümrük/vergi idaresi ve GOV.UK bağlantıları
saklanır. Kur kaynağı: https://frankfurter.dev/ . Harita politikası:
https://operations.osmfoundation.org/policies/tiles/ . Kaynak tarihi güncelleme garantisi değildir;
yeni yayın öncesinde özellikle acil telefonlar ve değişen vergi/kanun bilgileri yeniden kontrol edilmelidir.
