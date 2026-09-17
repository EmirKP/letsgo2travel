# TestFlight kurulumu — 17 Eylül 2026

Kullanıcının kurulum talebiyle `feature/travel-assistant-v1_1-20260916` dalı test
dağıtımı için hazırlanmıştır. Ana dal ve incelemedeki 1.4.0 (47) paketi değiştirilmez.

## Bağlantılar

- Yeni, ayrı Vercel projesi: `letsgo2travel-testflight` (`prj_heSYCDgFyma40mm9z8eIFSBCNOZj`).
- Test servisi: `https://testflight.letsgo2travel.com.tr`.
- Sadece `/api/travel-assistant/places` ve `/api/travel-assistant/rates` bu servise gider.
- Mevcut giriş, hesap, seyahat ve bildirim uçları mevcut sunucularını kullanır. Test uygulaması
  ayrı bir kullanıcı veritabanı oluşturmaz; mevcut hesaplarda yapılan işlemler gerçek hesaba yansır.
- Test servisine Supabase/yönetici/Apple anahtarı, kullanıcı oturumu veya mevcut API yolları kopyalanmaz.
- Yerel Vercel ENV indirmeleri `sensitive` değerleri vermez; bu dosyalar kullanılabilir ayar sayılmaz.
  Mobil derleme Codemagic'teki mevcut `letsgo2travel_public` grubunu kullanır.

## Sunucu

`node scripts/prepare-travel-assistant-staging.mjs` yeni geçici klasöre açıkça listelenen
yedi API/kütüphane dosyasını aktarır. Yeni paket yalnız Next/React ve TypeScript bağımlılıklarını
kullanır; cron, veritabanı, üretim API'leri, `.env` veya özel anahtar içermez. Kaynak commit kimliği
kök JSON yanıtında ve `staging-source.json` dosyasında bulunur. Önce kaynak commit oluşturulmalıdır.

Üretilen klasörde kilit dosyasını oluşturup (`npm install --package-lock-only --ignore-scripts`)
`vercel link --yes --project letsgo2travel-testflight --scope emirkaanpolat34-9211s-projects`
ile yalnız test projesine bağlanın. `.vercel/project.json` içindeki proje kimliğini yukarıdakiyle
karşılaştırmadan dağıtım yapmayın. Bu ayrı projenin kanonik test adresine dağıtım için `vercel --prod`
kullanılır; buradaki Vercel ortam adı mevcut `letsgo2travel` üretim projesi anlamına gelmez.
Standart dağıtım koruması korunur. Asıl proje klasöründe `--prod` çalıştırılmamalıdır.

## iPhone paketi

Codemagic uygulaması `6a74ee8453cdaf155d4e575a`, yeni manuel iş akışı
`letsgo2travel-ios-testflight` ve bu geliştirme dalı seçilir. Yeni iş akışı yalnız
`VITE_TRAVEL_ASSISTANT_API_BASE_URL` değerini test adresine ayarlar. Eski App Store iş akışı
YAML çözümlendikten sonra önceki davranışıyla aynıdır.

İş akışı bağımlılık denetimlerini ve tam sürüm testlerini çalıştırır, Apple'daki son build numarasından
yüksek bir sayı atar, aynı bundle ID ile IPA imzalar ve Apple'a yükler. App Store'a/beta incelemesine
gönderme, önceki gönderimi iptal etme ve önceki build'i geçersizleştirme kapalıdır. Test grubu otomatik
eklenmez. Apple işlemesi ve doğrulanmış dahili test kullanıcısına erişim tamamlanmadan telefona
kurulabilir olduğu iddia edilmemelidir.

## Doğrulama

Ek API ayarı için 19/19 test, mobil TypeScript, değişen dosyaların lint kontrolü; yeni YAML için
resmî Codemagic şeması, eski iş akışının eşdeğerliği ve 139/139 uygulama testi geçti.
Barındırılan servis yanıtları ve imzalı IPA sonucu dağıtım sırasında ayrıca kontrol edilir.
