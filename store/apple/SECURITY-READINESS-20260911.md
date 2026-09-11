# Yayın güvenliği — 11 Eylül 2026

Kapsam: mevcut web bağımlılıkları ve mobil ayarlardan üretilen istemci paketine kadar veri sınırı. Başlangıç commit'i `c13d86c`. Bu kontrol Apple incelemesi, cihaz testi veya olay müdahalesi değildir.

## Bulgular ve düzeltmeler

| Bulgu | Kanıt | Düzeltme |
| --- | --- | --- |
| Web bağımlılıklarında bilinen açıklar | `npm audit`: Next.js 16.3.0 kritik, sharp 0.35.3 yüksek; toplam iki etkilenen paket | Next.js ve eslint-config-next 16.3.5; sharp 0.35.4 ve güncel platform bağımlılıkları kilitlendi. Yüklenen libheif 1.23.2 |
| Genel anahtar alanına gizli anahtar yazılması engellenmiyor | Gerçek Vite production yapılandırması, işlevsiz `sb_secret_` deneme değerini `__L2T_CONFIG__` içine aldı | Ortak doğrulayıcı yalnız legacy `anon` JWT veya `sb_publishable_` biçimini kabul ediyor. Yönetici/oturum anahtarı, bozuk JWT ve yanlış biçim derlemeyi durduruyor |
| Gereksiz VITE değişkenleri istemciye açık | Çalışan eski Vite çözümlemesinde test amaçlı ek bir `VITE_` değişkeni `import.meta.env` içinde görüldü | `envPrefix: []`; uygulamanın ihtiyaç duyduğu beş genel ayar yalnız açık seçimle `__L2T_CONFIG__` içine giriyor. Vite'ın kendi MODE/DEV/PROD alanları korunuyor |
| Eksik/yanlış yayın adresiyle paket oluşturulabiliyor | Eski kontrol yalnız Codemagic'teki iki değişkenin dolu olmasına bakıyordu | Yayın build'inde genel Supabase çifti zorunlu; sunucu adresleri HTTPS, kullanıcı/parola/yol/sorgu/fragment içermeyen origin olmalı. HTTP yalnız dev sunucusunda loopback için açık |

Yeni JWT kontrolü bir imza doğrulayıcısı değildir; yalnız anahtar türünü sınıflandırır. Gerçek anahtarın geçerliliği ve kullanıcı yetkileri Supabase tarafından doğrulanmaya devam eder. RLS veya sunucu yetkilendirmesi kaldırılmadı. Gerçek anahtar değerleri loga veya bu belgeye yazılmadı; hiçbir anahtar döndürülmedi veya iptal edilmedi.

Next.js için [Windows sunucusu duyurusu](https://github.com/vercel/next.js/security/advisories/GHSA-p293-qw3h-jr36) ve [AVIF görsel işleme duyurusu](https://github.com/vercel/next.js/security/advisories/GHSA-2xp9-vwfh-vxw4), sharp için [üreticinin düzeltme duyurusu](https://github.com/lovell/sharp/security/advisories/GHSA-rgj7-g3m4-5g8c) kontrol edildi. Windows koşulu Vercel ortamına doğrudan mal edilmedi; paketin etkilenmiş sürümde olması sistemin sömürüldüğü anlamına gelmez. Bu bir 16.3.x yama güncellemesidir; ana sürüm geçişi veya uygulama API'lerini değiştiren codemod gerekmedi.

[Supabase anahtar türleri](https://supabase.com/docs/guides/getting-started/api-keys) ve [Vite ortam değişkeni sınırı](https://vite.dev/config/shared-options#envprefix) kontrol edilerek ayar doğrulaması ve otomatik dışa açmanın kapatılması seçildi.

## Doğrulama

- Güncelleme sonrası web `npm audit`: **0**; mobil bağımlılık taraması: **0** bildirilen açık. Sonuç tarama tarihindeki npm güvenlik veritabanıyla sınırlıdır.
- **16 yeni test**: anahtar türleri, VITE önceliği, eksik ayarlar, HTTPS/loopback, URL içinde parola/sorgu, destek e-postası, yanlış özellik bayrağı, gerçek Vite yapılandırması, gerçek üretilmiş JS ve CI çıktılarında gizli değerlerin yazılmaması.
- `npm run test:release`: tüm mevcut hesap, topluluk, gizlilik, bildirim ve seyahat kontrolleri ile yeni 16 kontrol geçti.
- Web build ve değişen dosyaların lint kontrolü geçti. Mobil lint ve TypeScript/Vite build geçti.
- Tam mobil build, işlevsiz genel Supabase test değerleriyle ayrı geçici klasöre üretildi. Bu derleme gerçek giriş testi değildir; dağıtım paketine veya native projeye kopyalanmadı.
- Yerel `mobile-dist` içindeki 34, iOS web kaynaklarındaki 36 ve test derlemesindeki 41 metin dosyasında bilinen özel anahtar, `sb_secret_` ve `service_role` JWT kalıpları tarandı: eşleşme yok. Test derlemesinde sahte gizli ortam değerleri de yok. Bu sınırlı tarama tüm olası sır biçimlerini kapsamaz; Codemagic'teki imzalı IPA ayrıca indirilip taranmış sayılmaz.
- sharp ile zararsız bir görselin AVIF kodlama/çözme kontrolü geçti; görüntü işleme desteği korunuyor.
- Yeni web build'i aynı test sürecinde yerel production sunucusunda açıldı: ana sayfa, destek, mobil gizlilik API'si ve IST havalimanı isteği HTTP 200 döndü. `/_next/image` üzerinden 64 × 64 AVIF üretimi HTTP 200 ve `image/avif` ile doğrulandı. Görsel arayüz/ekran görüntüsü testi yapılmış sayılmaz.

## Yayın davranışı

`codemagic.yaml` artık build öncesinde `scripts/check-mobile-public-config.mjs` ile Vite'ın kullandığı aynı genel ayarları doğrular. Yüksek/kritik bağımlılık uyarısında `npm audit --audit-level=high` aşaması durur. Güvenlik davranış testleri `test:release` içine eklendi. Geliştirme sunucusu genel anahtarlar olmadan önizlemeye izin verir; yayın build'i bunu kabul etmez.

Web güvenlik yamaları web yayınıyla devreye girer. Ayar korumaları sonraki mobil derlemelerde uygulanır; mevcut TestFlight paketinin değiştiği veya yeni imzalı IPA üretildiği iddia edilmez. Mağaza metinleri, son Apple paket seçimi ve gerçek cihaz davranışları [gönderim dosyasındaki](APP-STORE-SUBMISSION.md) ayrı kapsamdır.
