# Mobil Öncelikli Denetim ve Düzeltme Raporu (02.09.2026)

> Branch: `denetim-mobil-oncelik` · Baz (başlangıç): `a7e5e61` (origin/main
> HEAD, beklenenle birebir) · Bitiş: bu raporun commit'i (aşağıdaki listede).
> Main'e merge ve deploy YAPILMADI. Branch, teslim edilen
> `denetim-mobil-oncelik.bundle` dosyasından alınır:
> `git fetch <bundle-yolu> denetim-mobil-oncelik:denetim-mobil-oncelik`

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
10. (bu rapor)

## TAM ÇALIŞAN maddeler

**1. Fiyat alarmı — havalimanı autocomplete ve tarihler**
Ortak kaynak: `lib/airports-dataset.json` (3.220 tarifeli havalimanı;
OurAirports/kamu malı; `scripts/generate-airports.mjs` ile üretilir,
`airports-json` ISC devDependency). `lib/airport-search.ts` saf arama:
şehir/ülke/havalimanı adı/IATA + Türkçe şehir alias'ları (Roma→FCO,
Münih→MUC…); kullanıcı IATA bilmek zorunda değil; sonuçta ad, şehir, ülke,
IATA. `/api/airports` bu kaynağı sunar — arama SUNUCUDA, istemciye en iyi
12 sonuç (cache'li); büyük liste hiçbir tuşta inmiyor. Web
`AirportAutocomplete` + mobil `AirportField` aynı ucu kullanır (Kokpit ve
Rota Asistanı da — veri çoğaltma yok). Geçmiş gidiş tarihi UI'da
(min=bugün, yerel gün) ve API'de (Europe/Istanbul gününe göre; UTC
`toISOString` kayması giderildi) reddedilir. Dar ekranda tarih/hedef fiyat
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
chunk (54 KB gzip) — ana paket büyümedi. Eksik vize verisi UYDURULMAZ:
eşlenmeyen ülkeler "Bilinmiyor".

**4. Forum/Topluluk — kök neden**
KÖK NEDEN: `/api/country-community/feed`, projedeki TEK anon-istemcili
sunucu GET'iydi; kardeş uç `/api/kasifler-ligi` service-role ile
çalışıyordu. Feed, tablo grant/RLS durumuna bağımlıydı → mobildeki
"Topluluk akışı yüklenemedi" hatası bu asimetriden geliyordu. Feed artık
diğer okuma uçlarıyla AYNI mimaride (service-role + yalnız `visible` +
güvenli alan seçimi; user_id/e-posta yanıtta yok); hata yalnız KOD olarak
loglanır, kullanıcıya teknik ayrıntı gösterilmez. Hata/boş/yükleme
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
Uçuşlu/Uçuşsuz sekmeli form: uçuşluda varış havalimanı ortak autocomplete
ile seçilir; şehir + ülke + ISO kodu OTOMATİK dolar (kullanıcı kod
yazmaz). Ülke alanı bayraklı, ada göre sıralı native select (iOS uyumlu);
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
kaynak URL'leri, mailto), (c) hukuki sayfalar (Kullanım Şartları,
Gizlilik, KVKK veri silme talebi — "Tarayıcıda açılır" etiketiyle;
hesap silme yasal akışı bilinçli web'de). Web SEO/açık içerik/admin
olarak kalıyor; girişli kullanıcı hiçbir akışta ikinci web login görmüyor.

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

**7. Dynamic Island / Live Activity — KISMEN (kod hazır, Xcode adımı şart)**
- HAZIR: Widget Swift kaynakları (kilit ekranı + Ada compact/expanded/
  minimal; kalkış/varış IATA alanları, kalkış saati, canlı geri sayım;
  dokununca `letsgo2travel://cockpit`); uygulama içi köprü eklentisi
  (iOS 16.2+ kontrol, tek aktivite/seyahat, uçuş sonrası bitirme);
  JS eşitleme katmanı + saf durum makinesi (testli); desteklenmeyen
  cihaz/eksik kurulumda OTOMATİK yerel bildirim fallback'i (kalkışa 3
  saat kala; izin BURADA istenmez; dokununca Kokpit) — bu fallback ŞU AN
  çalışan kısımdır.
- DIŞ ADIM: Widget Extension HEDEFİ Xcode ile eklenmeli (çalışan
  Codemagic build'ini bozmamak için pbxproj'a elle target yazılmadı) +
  köprü eklentisinin storyboard üzerinden kaydı + imzalama —
  `LIVE-ACTIVITY-KURULUM.md` adım adım anlatır.
- DIŞ ADIM: `20260902100000_cockpit_flight_fields.sql` (nullable IATA/
  havayolu/uçuş no kolonları) production'a AYRI ONAYLA uygulanmalı; kod
  uygulanana kadar bu kolonlara yazmıyor (geriye dönük uyumlu).
- Fiziksel cihazda DENENMEDİ → Live Activity için "doğrulandı" DENMİYOR.

**Belge yükleme ilerlemesi:** yüzde bazlı değil, animasyonlu belirsiz
gösterge (CapacitorHttp fetch köprüsünde güvenilir progress olayı yok);
cihaz testinde FormData yükleme akışı özellikle denenmeli.

**Canlı production doğrulaması:** bu oturumdan üretim URL'lerine erişim
onayı gece verilemediği için canlı probe yapılmadı; aynı kontroller yerel
smoke'ta PASS. Deploy sonrası `/api/country-community/feed` yanıtını
kontrol etmek kök neden düzeltmesinin canlı teyididir.

## Test matrisi

| Test | Sonuç |
|---|---|
| Web ESLint / production build | PASS (0/0) |
| Mobil ESLint (--max-warnings=0) / Vite build | PASS |
| `test:alerts` | **37/37 PASS** (mevcut davranış korunuyor) |
| `test:app` (YENİ) | **25/25 PASS**: airport arama 10 senaryo (IATA/şehir/ülke/ad/Türkçe alias/limit), tarih 5 (TZ kayması, geçmiş/ters/bozuk format), kokpit form 8 (havalimanı zorunluluğu, uçuşsuz mod, geçmiş/ters tarih, ülke, PNR normalize), Live Activity 2 (evre + plan) |
| `mobile:prepare:all` (cap sync iOS+Android 9/9 eklenti + doctor) | PASS (yalnız placeholder-env uyarıları; Package.swift ters bölü 0; çapraz rename yok) |
| Smoke (gerçek next start) | PASS: 410'lar, alarm uçları, cron auth 4 durum, admin |
| Migration zinciri (izole PostgreSQL, sıfırdan; YENİ dosya dahil) | PASS (CHAIN_FAIL=0) |
| `git diff --check` | PASS |
| Secret/staging taraması (.env/.p8/google-services/supabase/.temp) | PASS (branch diff temiz) |
| Bundle kopyaları (mobile-dist ↔ iOS ↔ Android; lazy chunk dahil) | PASS (hash birebir) |
| Responsive: küçük iPhone/standart/iPad | Kod düzeyinde: tek sütun kırılımları (≤430px), 44px hedefler, ellipsis taşma korumaları, safe-area — GERÇEK CİHAZDA GÖRSEL DOĞRULAMA GEREKLİ → NOT VERIFIED (canlı) |
| Live Activity / gerçek cihaz push+bildirim akışları | NOT VERIFIED (macOS/cihaz yok) |

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
7. Live Activity: LIVE-ACTIVITY-KURULUM.md sonrası ayrı test listesi.

## Geri alma

- Tümü: branch'i silmek yeterli (main'e dokunulmadı).
- Merge sonrası: commitler küçük ve bağımsız — `git revert <sha>`.
  Not: 5a47867 geri alınırsa ona dayanan d6ed200/55b475d de geri
  alınmalı (AirportField ortak bileşeni).
