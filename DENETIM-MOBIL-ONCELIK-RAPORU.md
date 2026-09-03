# Mobil Öncelikli Denetim ve Düzeltme Raporu (03.09.2026 — 9. tur/v9 ile güncellendi)

> Branch: `denetim-mobil-oncelik-v9` · Baz (başlangıç): `a7e5e61` (origin/main
> HEAD, beklenenle birebir) · Bitiş: bu raporun commit'i (aşağıdaki listede).
> Main'e merge ve deploy YAPILMADI. Branch, teslim edilen
> `denetim-mobil-oncelik-v9.bundle` dosyasından alınır:
> `git fetch <bundle-yolu> denetim-mobil-oncelik-v9:denetim-mobil-oncelik-v9`

## Commit listesi (baz → uç)

1. `5a47867` Dünya çapında havalimanı autocomplete + TZ güvenli tarih doğrulama
2. `d6ed200` Kokpit formu: seçimden otomatik ülke/havalimanı, tarih kuralları, PNR
3. `fc70a06` Mobil ana sayfa ve header sadeleştirme; BottomNav tek aktif sekme
4. `b16196c` Topluluk: akış kök nedeni + soru detayı/cevaplar native
5. `141dd26` Pasaport Gücü: etkileşimli dünya haritası
6. `55b475d` Rota Asistanı: 3 adımlı yönlendirmeli akış
7. `a65bd4e` Belgeli Gezgin: uygulama içi belge gönderimi
8. `83aaa76` Live Activity altyapısı + yerel bildirim fallback'i
9. `068d4cc` Build 9 + eklenti sync + doctor düzeltmesi
10. `e288781` Denetim raporu (1. tur)

**2. tur (denetim bulgu düzeltmeleri, e288781 → uç):**

11. `f57a9ea` TEK ISO 3166 kaynağı (250 kayıt) + dünya çapında IATA seti (7.072)
12. `e36697b` Mobil ülke kapsamı 93 → 250; Pasaport'ta "Bilinmiyor" sınıfı
13. `9de3832` Belgeli Gezgin ülke doğrulaması tam ISO kaynağına
14. `fdb5f86` Alarm API'sinde istemci saat dilimi (sabit Europe/Istanbul kalktı)
15. `82d13ed` Ülke ≥240 / çoklu TZ / küçük havalimanı testleri + lint 0 uyarı
16. `9384ef8` Widget Extension hedefi project.pbxproj'a işlendi (Xcode adımı kalmadı)
17. `406d39b` Kokpit uçuş alanları veri katmanı (42703 emniyetli)
18. `334b012` Uçuş formu (kalkış+varış+havayolu+uçuş no) + tripId derin bağlantısı
19. `3674478` Live Activity push-to-start mimarisi (uygulama kapalıyken başlat/bitir)
20. `d9f8e1e` Forum: anon fallback → 503 + beyaz-listeli serileştiriciler (testli)
21. `654fd50` Yasal metinler uygulama İÇİNDE; veri silme uygulama içi akışa
22. `c08d1ef` Üç mobil paket kopyası yeni build ile eşitlendi
23. `5033604` Denetim raporu (2. tur)

**3. tur (v2 bağımsız denetim blokajları, 5033604 → uç):**

24. `11bf5e1` Cron v3: token bazlı teslim, atomik claim/lease/fencing, soft deadline
25. `a5951d5` Token gözlemi AppDelegate'e + UserDefaults tamponu + ack
26. `0c605b7` Cron güvenilirlik testleri (9 senaryo; 46/46)
27. `cc2f38d` Saat dilimi UTC/400 + Codemagic imza resmî yönteme
28. `002c416` Üç mobil paket kopyası v3 build ile eşitlendi
29. `192e3f9` Denetim raporu (3. tur)

**4. tur (v3 bağımsız denetim blokajları, 192e3f9 → uç):**

30. `5f073d0` claim_token UUID (kesin üretim hatası) + widget ters aralık + dürüst garanti
31. `85de144` Push-to-start token rotasyonu (kurulum kimliği + atomik RPC)
32. `890c5f9` Üç mobil paket kopyası v4 build ile eşitlendi
33. `55b8743` Denetim raporu (4. tur)

**5. tur (v4 bağımsız denetim — hesaplar arası sızıntı blokajı, 55b8743 → uç):**

34. `65ac07b` Hesaplar arası Live Activity sızıntısı kapatıldı (çıkış temizliği + tek-hesap token garantisi)
35. `abc48b9` Üç mobil paket kopyası v5 build ile eşitlendi
36. `930668e` Denetim raporu (5. tur)

**6. tur (v5 bağımsız denetim blokajları, 930668e → uç):**

37. `5fe12bf` Hesap değişiminde token yeniden kaydı + DB serileştirme + güvenli 503
38. `f7c38ed` Üç mobil paket kopyası v6 build ile eşitlendi
39. `80ab56f` Denetim raporu (6. tur)

**7. tur (v6 bağımsız denetim blokajları, 80ab56f → uç):**

40. `a955ee5` Retained token event'leri + installation serileştirme + retry akışı
41. `1ce81cf` Üç mobil paket kopyası v7 build ile eşitlendi
42. `555a62a` Denetim raporu (7. tur)

**8. tur (v7 bağımsız denetim blokajları, 555a62a → uç):**

43. `ef6c946` Oturum kuşağı (epoch) fencing'i + global registry kilidi + retry yaşam döngüsü
44. `ac52df5` Üç mobil paket kopyası v8 build ile eşitlendi
45. `b28c54a` Denetim raporu (8. tur)

**9. tur (v8 bağımsız denetim blokajları, b28c54a → uç):**

46. `a08341e` Atomik activity-update kaydı + kalıcı monoton session generation fencing
47. `94d5701` Üç mobil paket kopyası v9 build ile eşitlendi
48. (bu rapor)

## TAM ÇALIŞAN maddeler

**1. Fiyat alarmı — havalimanı autocomplete ve tarihler**
Ortak kaynak: `lib/airports-dataset.json` — 2. turda dünya çapına
genişletildi: **7.072 IATA kodlu yolcu havalimanı** (OurAirports kamu
malı medium/large + JSON-Airports MIT aktif-IATA tamamlayıcısı; heliport/
kapalı/özel pistler hariç; `scripts/generate-airports.mjs`). Küçük ada
havalimanları da bulunur (test: AIT/Aitutaki, FUN/Tuvalu). Öncelik alanı
sıralamada kullanılır; arama SUNUCUDA kalır, istemciye tam liste inmez. `lib/airport-search.ts` saf arama:
şehir/ülke/havalimanı adı/IATA + Türkçe şehir alias'ları (Roma→FCO,
Münih→MUC…); kullanıcı IATA bilmek zorunda değil; sonuçta ad, şehir, ülke,
IATA. `/api/airports` bu kaynağı sunar — arama SUNUCUDA, istemciye en iyi
12 sonuç (cache'li); büyük liste hiçbir tuşta inmiyor. Web
`AirportAutocomplete` + mobil `AirportField` aynı ucu kullanır (Kokpit ve
Rota Asistanı da — veri çoğaltma yok). Geçmiş gidiş tarihi UI'da
(min=bugün, yerel gün) ve API'de reddedilir; 2.–3. turda API sabit
Europe/Istanbul KULLANMAZ — web+mobil istemci geçerli IANA saat dilimini
gönderir; GEÇERSİZ bir değer gönderen istek 400 ile reddedilir, alan hiç
gönderilmemişse (eski istemciler) TARAFSIZ UTC kullanılır. Geçmiş gün +
730 günlük üst sınır KULLANICININ yerel takvim gününe göre denetlenir
(Kiritimati/Midway testleri). Dar ekranda tarih/hedef fiyat
tek sütun; iOS input zoom 16px font + `touch-action: manipulation` ile
erişilebilir biçimde engellendi. Hedef fiyat boşsa %5 düşüş davranışı
DEĞİŞMEDİ (test:alerts 37/37).

**2. Mobil ana sayfa + 8. madde header/nav**
Tekrarlanan "Keşfet" hızlı kartı kaldırıldı (hero'da tek CTA), yerine
Fiyat Alarmı hızlı erişimi; "Günün Keşfi" kartına taşma/üst üste binme
güvenliği. Header 66→56px, sade: geri/logo + bildirim + menü; profil
kısayolu kaldırıldı (BottomNav'da var); işlevi belirsiz yeşil nokta
(online göstergesi) ve hesap noktası kaldırıldı — çevrimdışılık zaten
banner'da. Bildirim rozeti yalnız gerçekten okunmamış içerikte (kalıcı
okundu-kimlikleri; mantık doğrulandı). Ortadaki Rota sekmesinin kalıcı
altın dolgusu kaldırıldı → aynı anda iki "aktif" görünüm bitti; aktif
sekme tek ve belirgin. Deep link/back davranışına dokunulmadı.
"Uçuş fırsatı" hayalet yazısı: kaynak kodda YOK (tarama temiz) — eski
build kalıntısıydı; yeni bundle'da bulunmuyor.

**3. Pasaport Gücü haritası**
Etkileşimli dünya haritası listeye eklendi: vize durumuna göre renk
(Kimlikle/Vizesiz/e-Vize/Kapıda/Vize gerekli/Bilinmiyor + lejant),
tek parmak pan, iki parmak pinch + +/−/sıfırla, ülkeye dokununca ad ve
durumun olduğu MEVCUT detay sayfası (bayrak: detayda ülke adıyla, listede
statü; resmî kaynak doğrulama uyarısı ve MFA bağlantısı KORUNDU).
Arama/filtre harita ile senkron (eşleşmeyenler soluk); seçili ülke kalın
konturla belirgin. Geometri build'de üretilir (`world-atlas@2` /
Natural Earth — KAMU MALI; d3-geo/topojson-client ISC, yalnız
devDependency): çalışma anında ağ da kütüphane de yok; harita ayrı lazy
chunk (54 KB gzip) — ana paket büyümedi. 2. turda ülke kapsamı TEK ortak
ISO 3166-1 kaynağına bağlandı (`scripts/generate-countries.mjs` →
`iso3166.json`, web+mobil BAYT-EŞİT kopya; i18n-iso-countries MIT +
Intl 'tr' adları + bayrak): liste artık 93 değil **250 ülke/bölge**;
Kokpit, Forum, Belgeli Gezgin ve Pasaport aynı kaynağı kullanır. VISA_DATA
(195 doğrulanmış sınıf) aynen; doğrulanmamış ülkelerde durum artık "Vize
gerekli" diye UYDURULMAZ — "Bilinmiyor" rozeti + filtresi + dürüst detay
metni. Harita şekli olmayan küçük ada devletleri listeden seçilebilir.
Kosova anahtarı ISO kaynağıyla hizalandı (XKX→XKK; eski profil kayıtları
için geri uyumlu takma adlar).

**4. Forum/Topluluk — kök neden**
KÖK NEDEN: `/api/country-community/feed`, projedeki TEK anon-istemcili
sunucu GET'iydi; kardeş uç `/api/kasifler-ligi` service-role ile
çalışıyordu. Feed, tablo grant/RLS durumuna bağımlıydı → mobildeki
"Topluluk akışı yüklenemedi" hatası bu asimetriden geliyordu. Feed artık
diğer okuma uçlarıyla AYNI mimaride; 2. turda `admin || anon` fallback'i
tamamen KALKTI: service-role yapılandırılmamışsa dürüst 503 döner (anon'a
düşülmez). Yanıtlar beyaz-listeli serileştiriciden geçer
(`lib/community/serializers.ts`): user_id/e-posta/status satırda olsa bile
KOPYALANMAZ — kirli satırla derin anahtar taraması testli. Hata yalnız KOD
olarak loglanır, kullanıcıya teknik ayrıntı gösterilmez. Hata/boş/yükleme
durumları zaten ayrıydı; "Tekrar dene"nin gerçekten yeni istek attığı
doğrulandı. Yeni `GET /api/country-community/questions/[id]` ile soru
detayı+cevaplar mobilde native Sheet'te; cevap yazma mevcut Bearer
oturumuyla (`doğrulama gerekli` 403'ü anlaşılır aktarılır). Soru
formunda ülke KODU yazımı kalktı (bayraklı seçim). Görünür giriş: ana
sayfa kartı + menü "Topluluk". Web'e yönlendirme ve ikinci web girişi YOK.

**5. Rota Asistanı**
3 adımlı yönlendirmeli akış (ilerleme göstergesi, geri/devam): Nereden &
ne zaman (dünya çapında şehir/havalimanı autocomplete) → bütçe/konaklama/
kişi/tempo/giriş tercihi → ilgi etiketleri (44px dokunma). Hero kompakt;
"canlı asistan / cihazdaki rota motoru" teknik metinleri kullanıcı
dilinden çıktı (öneri MOTORU DEĞİŞMEDİ). Sonuçlar: rota, tahmini bütçe,
günlük plan, önerilme nedeni (mevcuttu, korunur). CTA doğal akışta,
BottomNav altında kalmıyor.

**6. Seyahat Kokpiti**
Uçuşlu/Uçuşsuz sekmeli form; 2. turda uçuşlu form denetim şartına göre
tamamlandı: KALKIŞ havalimanı + VARIŞ havalimanı (ikisi de ortak
autocomplete; aynı havalimanı reddedilir), havayolu (opsiyonel), uçuş
numarası (opsiyonel, TK1979 biçimine normalize), kalkış tarihi VE saati
(zorunlu — geri sayım için), PNR (zorunlu, normalize). Seçim şehir + ülke +
ISO kodu OTOMATİK doldurur (kullanıcı kod yazmaz). Yeni alanlar
`origin_iata/destination_iata/airline/flight_number` olarak mobil tiplere,
SELECT/INSERT/UPDATE'e bağlandı — migration üretimde YOKKEN kırılmaz:
ilk 42703 yanıtında oturumluk bayrak kapanır, eski sütun listesine dönülür
ve yeni alanlar yazılmaz; migration uygulanınca kendiliğinden devreye
girer (güvenli dağıtım sırası: kod → migration). Detay kartı rota
(IST → FCO) ve uçuş bilgisini gösterir. Ülke alanı bayraklı, ada göre sıralı native select (iOS uyumlu);
uçuş dışı seyahatte yalnız ülke/şehir yeter. Başlangıç geçmiş olamaz,
bitiş başlangıçtan önce olamaz (yerel gün); native date/time kontrolleri.
PNR büyük harf + boşluk temizleme. Kapat/yenile düğmeleri küçüldü
(yenile ikon-boyut); form/kayıt listesi/boş durum ayrımı korunur;
form `scroll-margin` ile BottomNav/klavye altında kalmıyor. Sabit örnek
chip'ler ana veri kaynağı değil (chip'ler yalnız kayıtlı seyahatlerden).

**7/9. Native-first**
Profil, forum, fiyat alarmı, Kokpit, Rota Asistanı, Pasaport Gücü ve
Belgeli Gezgin uçtan uca uygulama içinde. `openExternal` taraması: kendi
alan adımıza giden İŞLEV kalmadı; kalanlar (a) OAuth authorize (Google/
Apple — tarayıcı zorunlu), (b) gerçek dış kaynaklar (mfa.gov.tr, vize
kaynak URL'leri, mailto), (c) 2. turda hukuki metinler de UYGULAMA İÇİNE alındı: Kullanım
Şartları + Gizlilik Politikası tek kaynaktan (`lib/legal/content.ts` →
web sayfaları ve `/api/legal/[slug]`) mobil `LegalSheet` içinde okunur;
"Hesap ve veri silme" menü satırı tarayıcı yerine uygulamadaki Hesap
bölümünü açar (silme talebi zaten native ve MEVCUT oturumla:
AccountSheet → `requestAccountDeletion`; web'e yeniden login YOK). Kendi
alan adımıza tarayıcı yönlendirmesi kalmadı; OAuth authorize akışına
dokunulmadı. Web SEO/açık içerik/admin olarak kalıyor.

**10. Belgeli Gezgin**
"Güvenli belge gönderimine git" web yönlendirmesi KALKTI. Native akış:
ülke seçimi (yeni ortak `/api/travel-verifications/countries` — web
listesiyle tek kaynak), Kamera/Fotoğraflar/Dosyalar'dan belge (iOS native
seçim sayfası; ek eklenti yok), tür+5MB istemci ön kontrolü (sunucuda
magic-byte imza doğrulaması ZATEN var), not, açık inceleme onayı, animasyonlu
yükleme göstergesi, İnceleniyor/Onaylandı/Reddedildi durumları ve RET
NEDENİ (admin notu) mobilde. Gönderim mevcut Supabase oturumunun
Bearer'ıyla MEVCUT `/api/travel-verifications` ucuna: private
`travel-evidence` bucket, public URL yok, erişim yalnız admin signed-url
uçları (ownership: user_id + Bearer; başka kullanıcının belgesine yol yok).

**11. Güvenlik regresyonu**
test:alerts 37/37 (APNs köprüsü, idempotency, paralel cron, fencing,
kanal bağımsızlığı, cihaz-izolasyonlu logout aynen); smoke PASS (410'lar,
cron Bearer-only 4 durum, admin koruması); yeni uçların auth/validation'ı:
detay ucu uuid doğrulamalı ve yalnız visible içerik, countries ucu statik
güvenli alanlar, VerificationForm Bearer'lı. Yeni bağımlılıklar: hepsi
ISC/MIT + resmî/istikrarlı; veri kamu malı; harita lazy chunk ile bundle
korunuyor; local-notifications resmî Capacitor eklentisi. `npm audit fix`
ÇALIŞTIRILMADI (bilinen 2 zafiyet raporu önceki geceden geçerli: nanoid
high / sanitize-html moderate — onay bekliyor).

## KISMEN ÇALIŞAN / DIŞ ADIM GEREKTİREN maddeler

**7. Dynamic Island / Live Activity — kod TAMAM, cihaz doğrulaması YOK**
- 2. turda Widget Extension hedefi **doğrudan `project.pbxproj`'a
  işlendi** (app-extension hedefi, Embed Foundation Extensions/PlugIns,
  bundle `tr.com.letsgo2travel.app.FlightActivityWidget`, iOS 16.2,
  build 9/1.4.0). `FlightActivityAttributes` HER İKİ hedefte derlenir;
  `MainViewController` (CAPBridgeViewController) storyboard'a bağlandı ve
  `FlightLiveActivityPlugin`'i kaydeder; App Info.plist
  `NSSupportsLiveActivities=YES`; Codemagic imza deseni widget'ı kapsar.
  ELLE XCODE ADIMI KALMADI — `mobile:doctor` bunların hepsini denetler.
- Ada/kilit ekranı GERÇEK kayıttan `IST → FCO`, kalkış saati ve canlı
  geri sayım gösterir; boarding/gate/gecikme gibi doğrulanmamış canlı
  veri YOK. Dokununca `letsgo2travel://cockpit?tripId=<id>` → uygulama
  tripId'yi ayrıştırıp İLGİLİ Kokpit kaydını otomatik seçer; yerel
  bildirim de aynı kayda gider (extra.tripId). Kalkış+1 saat sonrası
  uygulama içi bitirme + staleDate; push kanalı da end gönderir (aşağıda).
- PUSH-TO-START (uygulama KAPALIYKEN otomatik başlatma) — v3 GÜVENİLİR
  TESLİM: teslim durumu trip DEĞİL, **trip + token(cihaz) + event**
  bazında tutulur (`live_activity_deliveries`: pending/sent/
  transient_failed/permanent_failed, attempt_count, claim_token/fencing,
  claimed_until/lease, next_retry_at). check→send→upsert yarışı KALKTI:
  claim tek atomik UPDATE'tir; paralel cron'lar aynı teslimi AYNI ANDA
  gönderemez ve eski worker'ın gecikmiş sonucu yeni claim'i EZEMEZ
  (fencing) — bu sözleşme hem in-memory testlerle hem gerçek
  PostgreSQL'de SQL düzeyinde kanıtlandı. **DÜRÜST GARANTİ SINIRI (v4):**
  teslim "en az bir kez"dir — APNs başarısından SONRA süreç settle
  yazamadan çökerse, lease bitince aynı teslim yeniden gönderilebilir;
  "asla iki kez göndermez" İDDİA EDİLMEZ. Bu pencerenin cihazdaki etkisini
  azaltmak için tüm liveactivity push'larına trip+event tabanlı
  `apns-collapse-id` eklendi (yinelenen push cihazda tekilleşir).
  **v4 kesin hata düzeltmesi:** v3'te claim token'ı `claim-<ts>-<rnd>`
  biçimindeydi; DB kolonu uuid olduğundan gerçek Supabase'de HER claim
  22P02 ile reddedilir ve HİÇBİR APNs teslimi yapılamazdı. v4:
  `crypto.randomUUID()`; in-memory store artık DB gibi UUID tipini ZORLAR;
  gerçek PostgreSQL'de uygulamanın ürettiği tokenla claim 1 satır etkiledi,
  v3 biçimi aynı DB'de 22P02 ile reddedildi (kanıt). claim/settle DB
  hataları artık gizlenmez: token içermeyen kod güvenli loga yazılır.
  **v5 KRİTİK sızıntı düzeltmesi (hesaplar arası):** v4'te signOut yalnız
  disablePush çağırıyordu; live_activity_tokens açık kalıyor ve aynı
  fiziksel token iki hesapta birden etkin kalabiliyordu (A çıkıp B girse
  bile A'nın uçuşu aynı telefonda başlayabilirdi). v5: (1) çıkışta,
  oturum silinmeden ÖNCE `DELETE /api/live-activity/tokens` (Bearer +
  installationId) → `deactivate_live_activity_installation` RPC'si BU
  kurulumun push_to_start VE activity_update tokenlarını tek
  transaksiyonda kapatır — kullanıcının DİĞER cihazları (iPad) etkilenmez;
  (2) cihazda çalışan TÜM uçuş aktiviteleri çıkışta sonlandırılır;
  (3) `register_live_activity_push_to_start` aynı FİZİKSEL tokenı diğer
  hesap(lar) altında AYNI transaksiyonda kapatır — token atomik olarak
  yalnız güncel hesapta etkin (A hiç çıkış yapmasa bile B'nin kaydı A'yı
  keser); (4) geçersiz installationId artık 400 (sessiz rotasyonsuz yol
  YOK); (5) createId son fallback'i de RFC 4122 UUID v4; (6) RPC yokluğu
  GERÇEK PostgREST koduyla (PGRST202; direkt PG 42883) testli fallback.
  ZORUNLU SENARYO gerçek PostgreSQL'de kanıtlandı: A iPhone+iPad → iPhone
  logout: iPhone'un 2 tokenı kapandı, iPad açık; B aynı iPhone'da login:
  fiziksel token yalnız B'de etkin; A'nın uçuşu için etkin iPhone
  push_to_start/activity_update YOK (iPad'e gider), B'ninki gider; A hiç
  çıkmadan bile B kaydı A'nın satırını kapattı.
  **v9 düzeltmeleri (v8 bağımsız denetim):** (1) `activity_update`
  kaydındaki bar SELECT → ayrı upsert TOCTOU yarışı kaldırıldı. Trip
  sahipliği, güncel oturum denetimi, logout barı, kota, token rotasyonu ve
  upsert artık `register_live_activity_update` RPC'sinde TEK global kilit
  ve TEK SQL transaksiyonunda çalışır. İstemci doğrudan token/bar tablosuna
  yazmaz; RPC/migration yoksa güvenli 503 döner. (2) v8'in sunucu fencing'i
  başarılı logout DELETE'ine bağlıydı; istek 4 saniyelik çıkış penceresinde
  kaybolursa eski hesabın gecikmiş POST'u yeni hesabın token sahipliğini
  geri alabilirdi. v9 her login'de cihazda kalıcı ve monoton bir
  `generation` artırır; token replay'den önce
  `begin_live_activity_session` çağrılır. Sunucu kurulum başına yalnız en
  yüksek generation + doğru user + doğru epoch üçlüsünü kabul eder ve daha
  yüksek generation eski kurulum tokenlarını atomik kapatır. Böylece logout
  hiç ulaşmasa ve JS yeniden başlasa dahi eski istek 409 alır. Gecikmiş
  eski logout da yalnız kendi `session_epoch + session_generation`
  satırlarını kapatır; aynı kullanıcının yeni login tokenına dokunamaz.
  (3) `push_to_start` ve `activity_update` iki ayrı atomik RPC kullanır;
  her ikisinde kurulum oturumu zorunludur. Özel `LA001` 409, trip sahipliği
  `LA003` 403, migration/RPC yokluğu 503 olarak eşlenir; tokenlar loglanmaz.
  Birim/sahte-sunucu sözleşmeleri 79/79 geçti. Bu ortamda PostgreSQL,
  Xcode/Codemagic ve fiziksel iPhone olmadığı için v9 migration'ının gerçek
  PG yürütümü ile cihaz üstü APNs akışı **NOT VERIFIED**; production'a
  uygulanmadan önce aşağıdaki dış adımlar zorunludur.
  **v8 düzeltmeleri (v7 bağımsız denetim):** (1) ESKİ HESABIN GECİKMİŞ
  KAYIT İSTEĞİ (KRİTİK yarış) kapatıldı — v7'de A'nın logout'tan önce
  yola çıkan token POST'u, B login olduktan SONRA sunucuya ulaşırsa
  register RPC'si sahipliği A'ya geri verebilir, dönen "başarı" B'nin
  pending kaydını silip native tamponu ack'leyebilirdi. v8 İKİ katmanlı
  fencing getirir. İstemci: her login'de motor yerel epoch sayacını
  ilerletir ve `createId()` ile yeni `sessionEpoch` (uuid) üretir; her
  gönderim başladığı andaki kuşağa bağlanır ve kuşak uyuşmayan GEÇ sonuç
  TAMAMEN atılır (yeni pending silinmez, native ACK yok, retry
  engellenmez); ayrıca in-flight dedup aynı anahtar için ikinci paralel
  POST'u açmaz (retained event + getBufferedTokens çakışması). Sunucu
  (geliş SIRASINDAN bağımsız gerçek fencing — istemci durumu uygulama
  yeniden başlayınca sıfırlanabildiği için zorunlu): logout DELETE'i
  mevcut kuşağı `live_activity_epoch_bars(installation_id, epoch)`
  tablosuna BARLAR (deactivate RPC'si; 30 günden eski barlar budanır);
  register RPC'si barlı kuşakta özel SQLSTATE `LA001` (stale_epoch)
  fırlatır → API 409; activity_update yolu bar tablosunu doğrudan
  kontrol eder → 409. push_to_start VE activity_update için
  installationId + sessionEpoch artık ZORUNLU geçerli UUID'dir (400).
  İstemci 409'u kuyruktan düşürür ama ACK ETMEZ: token native tamponda
  kalır ve bir SONRAKİ login'in taze kuşağıyla yeniden kaydedilir.
  Kanıtlar — gerçek sync motoru: bekletilen A POST + logout + B login +
  geç tamamlama (sahiplik yalnız B, B pending'i silinmedi, sıfır ACK,
  cron A'nın uçuşunu telefona gönderemedi/B'ninkini gönderdi) hem tek
  JS bağlamında hem UYGULAMA YENİDEN BAŞLADI senaryosunda (in-flight ve
  epoch durumu sıfır — yalnız sunucu barı korur); gerçek PostgreSQL: bar
  önce/kayıt geç VE kayıt önce/bar+B sonra iki sırada da LA001 + sahip B.
  (2) "DEADLOCK İMKÂNSIZ" İDDİASI DÜZELTİLDİ — v7'nin kurulum→token
  advisory sırası satır kilitlerini kapsamıyordu (denetimin swap
  karşı-örneği doğru). v8: register ve deactivate artık TEK global
  `pg_advisory_xact_lock(hashtextextended('live_activity_registry',0))`
  kilidini alır — tüm sahiplik kaynakları (token satırları + kurulum
  satırları + bar tablosu) tek kuyruğa serileşir; kayıt olayı nadir
  olduğundan (login/token rotasyonu) global serileştirme ölçek sorunu
  değildir. Kanıt: swap senaryosu gerçek PG'de paralel çalıştırıldı —
  hata/40P01 YOK, ikinci işlem ~1.4 sn kilitte bekledi (serileşme),
  son durum tam takas ve token başına + kurulum başına TAM BİR enabled
  satır. "Deadlock imkânsız" genel iddiası yerine bu raporda yalnız
  ŞU söylenir: registry işlemleri (register/deactivate) tek global
  kilitle serileştirilmiştir ve swap karşı-testi dahil paralel testleri
  geçer. (3) RETRY ZAMANLAYICI SIZINTISI kapatıldı — v7'de flush sonrası
  kurulan 2 sn'lik kontrol `setTimeout`'u saklanmıyordu; tam o pencerede
  cleanup gelirse geç callback YENİ timer kurabiliyordu. v8: zamanlayıcı
  `createRetryScheduler`'a alındı (saf; setTimeout/clearTimeout enjekte
  edilir) — ana ve post-flush timer AYNI slotta saklanır, `stop()`
  lifecycle generation'ı ilerletir (sıraya çoktan girmiş geç callback
  hiçbir şey yapamaz), kuyruk boşalınca timer + deneme sayacı sıfırlanır.
  Fake-timer testleri (gerçek bekleme yok): tekrarlı poke/post-flush
  penceresi dahil tek timer; stop sonrası sıfır timer ve geç
  main/post-flush callback'lerin yeniden kuramaması; boş kuyrukta
  temizlik + taze 30 sn; geri çekilme 30→60 sn büyümesi. Ağ
  dönüşü/foreground olaylarının paralel aynı-token POST açmadığı motorun
  in-flight dedup testiyle ayrıca kanıtlıdır. Cihazda uçtan uca epoch
  akışı (gerçek logout/login + APNs) Xcode/fiziksel cihaz olmadan
  DOĞRULANMADI → **NOT VERIFIED**.
  **v7 düzeltmeleri (v6 bağımsız denetim):** (1) NATIVE activity_update
  TOKEN KAYBI kapatıldı — v6'da notifyListeners varsayılan davranışla
  çağrılıyordu; JS listener henüz kurulmadıysa event kayboluyor ve
  activity_update için pull/replay yolu olmadığından uzaktan update/end
  çalışmayabilirdi. v7: tüm token event'leri `retainUntilConsumed:true`
  ile gönderilir (dinleyicisiz kaybolmaz) VE yeni `getBufferedTokens`
  ucu ile JS, listener kurulduktan sonra native tamponu çekip TÜM
  girişleri sync motoruna sıralar; UserDefaults kaydı YALNIZ sunucu
  başarısında ack ile silinir; tekrarlar tokenType+tripId+token
  anahtarıyla idempotenttir. Testler: listener'dan önce biriken PTS + 2
  activity_update'in tamamı kayıt+ACK; 503/ağ hatasında tampon korunur
  ve sonraki denemede gönderilir. mobile:doctor bu mekanizmaları statik
  denetler. Retained event/replay davranışı Xcode/fiziksel cihazda
  DOĞRULANMADI → **NOT VERIFIED**. (2) AYNI INSTALLATION İÇİN EŞZAMANLI
  ROTASYON — v7 sabit sıralı kurulum→token advisory kilit çifti kullandı
  ve bu raporun önceki sürümü "deadlock imkânsız" dedi; bu ifade YANLIŞTI:
  advisory kilit sırası SATIR kilitlerini kapsamaz ve v8 denetiminin swap
  karşı-örneği (I1'de T1, I2'de T2 varken paralel T2→I1 ve T1→I2) satır
  kilidi üzerinden deadlock üretebilirdi. v8'de kilitleme TEK global
  registry kilidiyle değiştirildi ve tam bu swap senaryosu gerçek
  PostgreSQL'de paralel test edildi (aşağıdaki v8 bölümü). v7'nin kalan
  garantileri geçerli: eski token, yenisi ETKİNLEŞTİRİLMEDEN ÖNCE kapatılır;
  `live_activity_pts_single_installation_idx` kurulum başına en fazla
  bir etkin push-to-start satırını VERİ düzeyinde garanti eder. Gerçek
  PG paralel testleri: aynı kullanıcı+kurulum T1/T2 farklı token → T2
  1.45 sn kilitte bekledi, sonuç TEK enabled; önceki aynı-token/
  farklı-hesap testi geçmeye devam etti (tek sahip); fonksiyonu atlayan
  doğrudan INSERT kurulum index'ince reddedildi; v5 logout/login
  senaryosu regresyonsuz. (3) BEKLEYEN TOKEN RETRY AKIŞI — pending
  kayıtlar uygulama yeniden başlatılmadan denenir: ağ dönüşü
  (networkStatusChange connected) ve foreground (appStateChange
  isActive) flush tetikler; SINIRLI geri çekilme 30sn→…→10 dk tavanlı
  TEK zamanlayıcıyla çalışır, kuyruk boşalınca durur (saf
  retryBackoffDelayMs monotonluk/tavan testli) — sonsuz döngü/agresif
  istek yok.
  **v6 düzeltmeleri (v5 bağımsız denetim):** (1) HESAP DEĞİŞİMİNDE TOKEN
  YENİDEN KAYDI — v5'te ack tamponu temizleyip logout kuyruğu sildiğinden
  B login olduğunda cihaz tokenını yeniden kaydedecek kaynak yoktu. v6:
  native tarafta EN SON push-to-start token AYRI anahtarda KALICI tutulur
  (ack/logout silmez), plugin `getLatestPushToStartToken` ile replay eder
  ve HER accessToken boş→dolu geçişinde (giriş, hesap değişimi, geri
  yüklenen oturum) token GÜNCEL kullanıcı adına yeniden kaydedilir. Akış
  mantığı saf `liveActivityTokenSync` motoruna alındı ve test GERÇEK sync
  akışıyla yapılır — B'nin tokenı hiçbir yerde elle map'e eklenmez.
  (2) EŞZAMANLI TEK-HESAP GARANTİSİ DB DÜZEYİNDE — register RPC'si artık
  `pg_advisory_xact_lock` ile token bazında serileştirir (önce diğer
  hesaplar kapanır, sonra upsert) ve `(token) where push_to_start and
  enabled` partial unique index garantiyi VERİ düzeyinde mutlak kılar.
  Gerçek PG paralel testi: A'nın transaksiyonu açıkken B aynı token için
  ~1.46 sn lock'ta bekledi; sonuç TEK enabled sahip; fonksiyonu atlayan
  doğrudan INSERT bile index tarafından reddedildi. (3) GÜVENLİKSİZ
  FALLBACK KALKTI — RPC yokken (PGRST202/42883/42703) hesaplar-arası
  tekillik sağlamayan per-user upsert'e düşülmez: 503 döner, mobil token'ı
  ACK ETMEDEN bekletir ve migration gelince retry başarılıdır (motor
  testiyle kanıtlı); push_to_start için installationId artık ZORUNLU.
  Çıkışın güvenli user_id+installation_id UPDATE fallback'i korunur.
  **v4 token rotasyonu:** Apple push-to-start tokenı zamanla
  değiştirebilir; mobil istemci kalıcı KURULUM KİMLİĞİ (uuid, kişisel veri
  içermez) gönderir ve `register_live_activity_push_to_start` RPC'si
  (service-role-only, tek transaksiyon) aynı kullanıcı+kurulumun eski
  tokenını ATOMİK kapatır — farklı fiziksel cihazlar ve kimliksiz eski
  kayıtlar etkilenmez (gerçek PG testi: iPhone eski kapandı/yenisi açık,
  iPad ve NULL kimlikli kayıt dokunulmadı, yeniden kayıt idempotent). Bir token'ın başarısı diğerinin
  bağımsız retry'ını engellemez; transient hatada EN FAZLA 3 deneme
  (5 dk geri çekilme), kalıcı APNs hatasında YALNIZ ilgili token
  kapatılır. Soft deadline (~45 sn, maxDuration=60): sonrasında yeni
  claim açılmaz, kalan iş sonraki cron'a kalır (deferred); gönderimler
  kontrollü paralel (4'lü gruplar). END: activity_update tokenı yoksa
  teslim satırı hiç açılmaz → end TAMAMLANMIŞ SAYILMAZ; token sonradan
  kaydolursa satır açılıp gönderilir; başarısız end asla 'sent' yazmaz.
- TOKEN YAKALAMA (Apple'ın belgelenen davranışına göre): Apple, push-to-
  start alındığında sistemin uygulamayı arka planda UYANDIRIP update
  tokenını verdiğini belgeler. Capacitor'da o anda WebView çalışmayabilir;
  bu yüzden gözlem WebView'dan bağımsız olarak AppDelegate'te başlar
  (`LiveActivityTokenObserver`) ve token'lar UserDefaults tamponuna
  yazılır; JS hazır olunca sunucuya kaydedilir ve BAŞARILI kayıt ack ile
  tampondan silinir. Arka plan uyanışında fiilen yakalama fiziksel
  cihazda DOĞRULANMADI → **NOT VERIFIED**; yakalanamazsa sahte 'sent'
  üretilmez: end satırı token kaydolana kadar açılmaz, token bir sonraki
  uygulama açılışında gönderilir (en kötü durumda aktivite staleDate ile
  soluklaşır ve uygulama açılınca biter).
- Kayıt ucu `/api/live-activity/tokens`: Bearer oturum + sahiplik
  (activity_update tokenı yalnız kullanıcının KENDİ trip kaydına);
  token loglanmaz. Cron yalnız Bearer CRON_SECRET ile çalışır.
  iOS 16.2–17.1 ve token kayıtsız cihazlarda mevcut uygulama içi
  başlatma + yerel bildirim fallback'i AYNEN çalışır.
- DIŞ ADIM (yalnız hesap/operasyon; kod adımı DEĞİL):
  (a) Apple tarafında widget App ID/profil. codemagic.yaml RESMÎ
  belgelenen biçimdedir (temel `bundle_identifier` nokta ekli uzantı
  profillerini de eşler — docs.codemagic.io); gerçek Codemagic build'inde
  iki profilin fiilen eşlendiği DOĞRULANMADI → **NOT VERIFIED** (ilk
  build'de kontrol edilecek); (b) iki migration'ın production'a AYRI
  ONAYLA uygulanması (`20260902100000` uçuş kolonları,
  `20260902120000` live activity token/event tabloları — ikisi de
  uygulanmadan hiçbir şey kırılmaz); (c) harici zamanlayıcıya
  `/api/cron/live-activity` işinin eklenmesi (10–15 dk); (d) TestFlight
  build'i.
- Fiziksel cihazda DENENMEDİ → Live Activity ve push-to-start için
  "doğrulandı" DENMİYOR (cihaz listesi aşağıda).

**"Çift preventDefault" bulgusu (v2 denetimi):** mevcut ağaçta yinelenen
satır YOK — `CockpitScreen`'deki iki `event.preventDefault()` çağrısı iki
AYRI form handler'ındadır (seyahat ekleme formu `createTrip` ve kontrol
listesi formu `addChecklistItem`) ve ikisi de kendi formunun sayfa
yenilemesini engellemek için gereklidir; silinmedi.

**Belge yükleme ilerlemesi:** yüzde bazlı değil, animasyonlu belirsiz
gösterge (CapacitorHttp fetch köprüsünde güvenilir progress olayı yok);
cihaz testinde FormData yükleme akışı özellikle denenmeli.

**Canlı production doğrulaması:** bu oturumdan üretim URL'lerine erişim
onayı gece verilemediği için canlı probe yapılmadı; aynı kontroller yerel
smoke'ta PASS. Deploy sonrası `/api/country-community/feed` yanıtını
kontrol etmek kök neden düzeltmesinin canlı teyididir.

## Test matrisi

V8 ve daha eski ayrıntılı satırlar tarihsel kanıttır. V9 için geçerli son
durum ilk üç satırdadır; bu ortamda PostgreSQL çalıştırıcısı bulunmadığından
v9 SQL'i için geçmiş sürümlerin gerçek-PG sonucu devralınmamıştır.

| Test | Sonuç |
|---|---|
| **V9 son koşum — `test:app`** | **79/79 PASS**: logout isteği tamamen kayıp + aynı süreç, logout kayıp + uygulama restart, gecikmiş aynı-hesap logout, activity-update iki işlem sırası, atomik RPC/statik SQL sözleşmesi, generation doğrulaması ve önceki tüm regresyonlar |
| **V9 migration zinciri / gerçek PostgreSQL yarışları** | **NOT VERIFIED** — bu çalışma ortamında PostgreSQL/psql/docker yok. Migration üretime uygulanmadı. SQL statik sözleşme ve sahte sunucu yarış testleri PASS; temiz PostgreSQL yürütümü ve eşzamanlı yarış testi production onayından önce zorunlu |
| **V9 Xcode/Codemagic/fiziksel cihaz APNs** | **NOT VERIFIED** — macOS/Xcode/iPhone yok; TestFlight kontrol listesinde doğrulanacak |
| Web ESLint (`--max-warnings=0`) / production build | PASS — kök lint'teki 4 uyarı giderildi, artık 0 uyarı |
| Mobil ESLint (--max-warnings=0) / Vite build | PASS |
| `test:alerts` | **37/37 PASS** (mevcut davranış korunuyor) |
| `test:app` | **72/72 PASS** (v8 — 11 yeni test: KRİTİK yarış — bekletilen A POST'u + logout + B login + geç tamamlama → sahiplik yalnız B, B pending'i silinmez, sıfır native ACK; aynı yarış UYGULAMA YENİDEN BAŞLADI varyantında [istemci durumu sıfır, yalnız sunucu barı korur] + cron yalnız B'nin uçuşunu telefona gönderir; 409 pending düşürür ama ACK etmez → sonraki login taze kuşakla kurtarır; in-flight dedup — retained tekrar + online/foreground flush'ları ikinci paralel POST açmaz; RPC LA001→409; sessionEpoch eksik/geçersiz→400 [iki token türünde]; activity_update bar kontrolü — barlıyken 409 + tokens tablosuna dokunulmaz, bar tablosu yokken 503; deactivate p_epoch taşır [null dahil] + geçersiz kuşak 400; fake-timer scheduler 3 test — tek timer/poke tekrarı/post-flush penceresi, stop sonrası sıfır timer + geç main/post-flush callback yeniden kuramaz, boş kuyrukta timer+attempt sıfırlanır + taze 30 sn + geri çekilme büyür) (v7: listener öncesi tampon replay — PTS+2 activity_update tamamı kayıt+ACK + idempotens; 503/ağ hatasında tampon korunur ve sonraki denemede gönderilir; geri çekilme monoton/tavanlı/negatif-güvenli) (v6: gerçek token-sync akışıyla hesap değişimi — A login kayıt+ack, logout yalnız iPhone, B login'de native latest OTOMATİK yeniden kaydolur [elle ekleme yok], cron A'nınkini iPhone'a gönderemez/iPad'e gönderir, B'ninkini gönderir; RPC yokken 503 + ack edilmez + migration sonrası retry başarılı; PGRST202 register artık 503 [fallback yok]; kimliksiz push_to_start 400) (+8 v5 testi: rotasyon RPC çağrısı; PGRST202/42883 gerçek-PostgREST fallback'i; tablo yokken 503; geçersiz installationId 400 — kayıt VE çıkışta; çıkış filtreleri yalnız user+installation; hesap değişimi cron senaryosu — A'nın uçuşu iPhone'a gidemez/iPad'e gider, B'ninki gider; createId son fallback RFC4122 v4) (+UUID claim sözleşmesi 2 test: üretilen her token geçerli/benzersiz UUID + v3 hatalı biçiminin TÜM teslimi durdurduğunun kanıtı; +widget ayna testi: kalkış sonrası ters geri sayım aralığı oluşturulmaz) (+9 cron güvenilirlik senaryosu: paralel iki cron→cihaz başına tek start; kısmi başarı retry; transient ≤3; kalıcı hata yalnız ilgili token; end tokensız tamamlanmaz; end transient retry; başarılı end tekrar gönderilmez; fencing; soft deadline deferred): airport 11 (dünya kapsamı ≥7000 + küçük ada havalimanları dahil), ülke 2 (ISO kaynağı ≥240 + alan bütünlüğü + web/mobil bayt eşitliği), saat dilimi 3 (IANA doğrulama, Kiritimati/Midway geçmiş gün, 730 gün kayması), tarih 5, kokpit form 11 (kalkış/varış zorunluluğu, aynı havalimanı reddi, saat+PNR zorunluluğu, uçuş no normalize), Live Activity + deep link 4, forum serileştirici 1 (gizli alan sızıntı taraması) |
| `mobile:prepare:all` (cap sync iOS+Android 9/9 eklenti + doctor) | PASS (yalnız placeholder-env uyarıları; Package.swift ters bölü 0; çapraz rename yok) |
| Smoke (gerçek next start, 1. tur) | PASS: 410'lar, alarm uçları, cron auth 4 durum, admin |
| `npm ci` + `npm --prefix mobile ci` (2. tur, temiz kurulum sonrası tüm testler) | PASS |
| Migration zinciri (izole PostgreSQL, sıfırdan; 20260902100000 + v8 20260902120000 dahil) | PASS (CHAIN_FAIL=0; live_activity_tokens + live_activity_deliveries + live_activity_epoch_bars RLS=t, policy=0, anon/authenticated grant=0; register 4 parametreli `(p_user_id,p_installation_id,p_token,p_epoch)` ve deactivate `(p_user_id,p_installation_id,p_epoch)`; iki partial unique index mevcut; fonksiyonlarda anon/authenticated/PUBLIC EXECUTE=0) |
| Gerçek PG SWAP deadlock karşı-testi (v8, ZORUNLU) | PASS: I1'de T1, I2'de T2 kayıtlıyken paralel `register(T2→I1)` (açık transaksiyon, 2 sn) + 0.6 sn sonra `register(T1→I2)` → HİÇ hata yok (40P01 dahil), ikinci işlem 1438 ms global registry kilidinde BEKLEDİ (serileşme kanıtı); son durum tam takas (T2@I1, T1@I2) ve token başına + kurulum başına TAM BİR enabled satır |
| Gerçek PG stale-epoch fencing — İKİ istek sırası (v8, ZORUNLU) | PASS — Sıra 1 (bar önce, kayıt geç): A kayıt → deactivate(e1) bar → A'nın e1 replay'i LA001, enabled=0; B taze e2 ile kayıt → sahip B; A tekrar geç dener → yine LA001, sahip B. Sıra 2 (kayıt önce işlenir): A'nın register'ı açık transaksiyonda, logout+B kaydı global kilitte 1443 ms bekledi → sıralama: A sahip → bar(e1)+devre dışı → B sahip; A'nın e1 ile geç replay'i LA001, sahip HÂLÂ B, enabled=1 |
| Gerçek PG deactivate bar sözleşmesi (v8) | PASS: deactivate(epoch) bar satırı ekler; 40 günlük eski bar BUDANIR, 5 günlük kalır; epochsuz (NULL) çıkış bar EKLEMEZ (eski istemci uyumu) ve bar sayısını değiştirmez |
| Atomik claim/fencing SQL sözleşmesi (gerçek PostgreSQL) | PASS: A claim → lease doluyken B alamaz → lease bitince B devralır → B 'sent' yazar → A'nın gecikmiş yazımı 0 satır etkiler |
| Gerçek PG claim — UYGULAMANIN ÜRETTİĞİ tokenla (v4) | PASS: ts-node ile `defaultClaimToken()` çağrıldı, dönen UUID gerçek DB'de 1 satır claim etti; v3'ün `claim-<ts>-<rnd>` biçimi AYNI DB'de 22P02 ile reddedildi |
| Gerçek PG token rotasyonu (v4) | PASS: iPhone(kurulum A) yeni token → eski kapandı; iPad(kurulum B) ve NULL kimlikli eski kayıt DOKUNULMADI; yeniden kayıt idempotent; fonksiyonda PUBLIC/anon/authenticated EXECUTE yok |
| Gerçek PG PARALEL aynı-kurulum T1/T2 (v7, ZORUNLU; v8'de 4 parametreli imza + global kilitle YENİDEN koşuldu) | PASS: aynı kullanıcı + aynı installation + iki farklı token eşzamanlı → ikinci token registry kilidinde 1435 ms bekledi; sonuç kurulumda tam olarak BİR enabled token (sonraki kazandı); kurulum index'i (live_activity_pts_single_installation_idx) veri düzeyinde garantiyi korur |
| Gerçek PG PARALEL kayıt serileştirme (v6, ZORUNLU; v8'de 4 parametreli imza + global kilitle YENİDEN koşuldu) | PASS: A'nın açık transaksiyonu kilidi tutarken B aynı token için 1440 ms BEKLEDİ; commit sonrası B kazandı → TEK enabled sahip (user B), hata yok; fonksiyonu atlayan doğrudan INSERT partial unique index (live_activity_push_to_start_single_owner_idx) tarafından reddedilir (v6'da kanıtlandı) |
| Gerçek PG hesaplar-arası senaryo (v5, ZORUNLU) | PASS: A logout(iPhone)→2 token kapandı+iPad açık; B login(aynı iPhone)→fiziksel token yalnız B'de etkin; A'nın etkin iPhone tokenı YOK (start/update/end gidemez), iPad'i alır; B gönderebilir; A çıkış yapmasa bile B kaydı A'yı atomik kapatır |
| `git diff --check` | PASS |
| Secret/staging taraması (.env/.p8/google-services/supabase/.temp) | PASS (branch diff temiz) |
| Bundle kopyaları (mobile-dist ↔ iOS ↔ Android; lazy chunk dahil) | PASS (hash birebir) |
| Responsive: küçük iPhone/standart/iPad | Kod düzeyinde: tek sütun kırılımları (≤430px), 44px hedefler, ellipsis taşma korumaları, safe-area — GERÇEK CİHAZDA GÖRSEL DOĞRULAMA GEREKLİ → NOT VERIFIED (canlı) |
| Live Activity / gerçek cihaz push+bildirim akışları | NOT VERIFIED (macOS/cihaz yok) |
| Widget DepartureCountdown Swift derleme/görünümü | NOT VERIFIED (Xcode yok) — mantık TS aynasıyla testli (`countdownMode`), Swift görünümü cihaz listesi madde 9'da doğrulanacak |
| Codemagic build (App + Widget profil eşleme) | NOT VERIFIED — bu ortamda Codemagic/Xcode build çalıştırılamadı; ilk gerçek build'de kontrol edilecek |

## Fiziksel cihazda doğrulanacaklar (build 9 TestFlight)

1. Alarm formu: "izmir" yaz → ADB önerisi; seçimle alarm kur; geçmiş tarih
   seçilemesin; klavye açılınca zoom OLMASIN.
2. Kokpit: Uçuşlu sekme → havalimanı seç → ülke/şehir otomatik; uçuşsuz
   sekmede yalnız ülke; kalkışa 3+ saatli kayıt sonrası bildirim izni
   açıksa hatırlatmanın planlandığını (Ayarlar > Bildirimler beklemede)
   gör; dokununca Kokpit açılmalı.
3. Topluluk: akış yüklenmeli (kök neden teyidi), soru detayına gir, cevap
   yaz; uçak modunda hata + "Tekrar dene" gerçek yeniden deneme.
4. Pasaport haritası: pan/zoom akıcılığı, ülkeye dokunma, filtre senkronu;
   küçük iPhone'da taşma yok.
5. Belgeli Gezgin: kameradan çekip yükle (FormData akışı!), 6MB dosya
   reddi, ret nedeni görüntüleme.
6. Push regresyonu: test bildirimi, foreground banner, bildirimden Fiyat
   Alarmlarım; iPhone logout'ta iPad kaydının açık kalması.
7. Kokpit uçuş formu: kalkış+varış havalimanı seç (aynıysa hata), saat
   ve PNR olmadan kaydetme engellensin; migration UYGULANMADAN kayıt yine
   başarılı olmalı (uçuş detayları hariç), migration sonrası rota kartı
   `IST → FCO` göstermeli.
8. Derin bağlantı: bildirime dokun → İLGİLİ kokpit kaydı seçili açılmalı;
   `letsgo2travel://cockpit?tripId=<id>` Safari'den de aynı kaydı açmalı.
9. Live Activity (iPhone 14 Pro+ ve Ada'sız cihaz): başlatma, compact/
   expanded/minimal, geri sayım, dokunuşla ilgili kayıt, kalkış+1 saat
   sonrası bitiş. ÖZELLİKLE: kalkış saati GEÇTİKTEN sonra (aktivite hâlâ
   açıkken) üç görünümde de 'Kalkış gerçekleşti'/'Uçtu' görünmeli — ters
   geri sayım veya çökme OLMAMALI.
10. Push-to-start (iOS 17.2+, migration + cron kurulu): uygulamayı
    tamamen kapat → kalkışa 3 saat kala aktivite KENDİLİĞİNDEN başlamalı;
    kalkış+1 saat sonra kendiliğinden bitmeli. Ek doğrulama: push-to-start
    ile başlayan aktivitenin update tokenının ARKA PLAN uyanışında
    yakalanıp sunucuya ulaştığını (uygulama hiç açılmadan) kontrol et —
    ulaşmıyorsa end push'u ancak bir sonraki uygulama açılışından sonra
    mümkündür. (Bu doğrulamalar yapılmadan push-to-start için "çalışıyor"
    DENMEZ.)
11. Yasal metinler: Menü → Gizlilik/Kullanım Şartları uygulama İÇİNDE
    açılmalı; çevrimdışıyken hata + "Tekrar dene" görünmeli; "Hesap ve
    veri silme" Hesap sayfasını açmalı (tarayıcı YOK).
12. Hesap değişimi yarışı (v9, migration uygulanmış olmalı): zayıf/uçak
    modu sınırında A'nın çıkış isteğini yarıda bırak → hemen B ile gir;
    B'nin Live Activity push'ları çalışmalı ve A'nın hiçbir uçuşu bu
    telefona düşmemeli. Uygulamayı tamamen kapatıp yeniden açarak tekrarla;
    kalıcı generation artmalı. Aynı A hesabıyla yeniden girişte gecikmiş
    eski logout yeni tokenı kapatmamalı. Eski build generation göndermediği
    için 400 alır; v9 build ile kayıt yeniden kurulmalıdır.

## Kalan GERÇEK dış adımlar (2. tur sonrası; hiçbiri kod adımı değil)

1. **Apple imzalama**: widget App ID
   (`tr.com.letsgo2travel.app.FlightActivityWidget`) — Codemagic otomatik
   imzalama ilk build'de genelde kendisi oluşturur; oluşturmazsa Developer
   portalda bir kez elle açılır. Live Activity için ek entitlement gerekmez.
2. **Migration onayı**: `20260902100000_cockpit_flight_fields.sql` ve
   `20260902120000_live_activity_push_tokens.sql` production Supabase'e
   uygulanmalı. İkinci migration gelene kadar temel uygulama çalışır fakat
   Live Activity token kaydı güvenli 503 verir, tokenı ACK etmez ve retry
   için tamponda tutar; güvensiz eski tablo yazımına düşmez.
3. **Cron zamanlaması**: harici zamanlayıcıya (fiyat alarmı cron'uyla aynı
   mekanizma) `GET /api/cron/live-activity`, `Authorization: Bearer
   <CRON_SECRET>`, 10–15 dakikada bir.
4. **TestFlight/Codemagic build** + yukarıdaki fiziksel cihaz listesi.
5. **Canlı teyit**: deploy sonrası `GET /api/country-community/feed`
   (200 + güvenli alanlar) ve `GET /api/legal/kullanim-sartlari`.

## Geri alma

- Tümü: branch'i silmek yeterli (main'e dokunulmadı).
- Merge sonrası: commitler küçük ve bağımsız — `git revert <sha>`.
  Not: 5a47867 geri alınırsa ona dayanan d6ed200/55b475d de geri
  alınmalı (AirportField ortak bileşeni).
