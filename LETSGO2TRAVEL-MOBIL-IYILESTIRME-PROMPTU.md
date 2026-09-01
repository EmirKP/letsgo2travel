# LetsGo2Travel Mobil Uygulama — Derin İnceleme ve Üretim Hazırlığı

Elindeki güncel LetsGo2Travel projesini yüzeysel olarak düzenleme. Uygulamayı gerçek bir iOS/Android ürünü gibi uçtan uca incele, sorunları kök nedenleriyle düzelt ve yapılan her değişikliği doğrula.

## Ana hedef

LetsGo2Travel; web sitesini uygulama içinde gösteren bir kabuk değil, siteyle aynı hesap ve veri katmanını kullanan bağımsız bir seyahat keşif uygulaması olmalıdır. Kullanıcı temel özellikleri uygulama içinde tamamlayabilmeli; yalnızca ödeme/affiliate sonucu, resmî kurum kaynağı, hukuki metin veya güvenlik nedeniyle zorunlu akışlar dış tarayıcı açmalıdır.

## Öncelik sırası

1. Uygulamanın gerçekten paketlediği dosyalar ile `mobile/src` kaynak kodunun aynı sürüm olduğunu doğrula. Eski hash'li JS/CSS paketlerini tamamen temizle.
2. E-posta/şifre, Google ve Apple girişlerini test et. iOS'ta her üç yöntem de görünmeli ve başarılı işlemden sonra `tr.com.letsgo2travel.app://auth/callback` üzerinden uygulamaya dönmelidir.
3. Kayıt onayı ve şifre yenileme bağlantılarının siteye bırakmak yerine uygulamaya dönmesini sağla. OAuth/PKCE işlemlerinde geçerli yerel işlem kaydı ve code verifier olmadan oturum kabul etme.
4. Uygulamadaki her ekranı ve etkileşimi incele: ana sayfa, Keşfet, Pasaport Gücü, Beni Şaşırt, Rota Asistanı, Seyahatlerim, Akıllı Seyahat Kokpiti, Kaşifler Ligi, bildirimler, profil ve hesap yönetimi. (Not: Bilet Ara ekranı üründen kalıcı olarak kaldırılmıştır.)
5. Yerel kayıt ile Supabase hesabı arasındaki eşitlemeyi kontrol et. Başarısız ağ isteklerinde kullanıcı verisini kaybetme; açık, Türkçe ve uygulanabilir hata mesajı göster.
6. Tasarımı LetsGo2Travel vizyonuna göre geliştir: premium gece laciverti, LetsGo altını, sınırlı camgöbeği, kırık beyaz yüzeyler; ferah hiyerarşi, okunabilir yazılar ve modern seyahat keşfi hissi.
7. iPhone güvenli alanlarını, küçük ekranları, klavye açılmasını, geri hareketini, ekran okuyucuyu, odak yönetimini, en az 44×44 px dokunma alanlarını ve azaltılmış hareket tercihini doğrula.
8. Sürüm/build numaralarını tek bir gerçek kaynağa yaklaştır; arayüz, Xcode ve paketlenmiş Capacitor ayarlarında eski build metni bırakma.

## Giriş ve yönlendirme kabul kriterleri

- iOS'ta Apple ve Google düğmeleri aynı giriş panelinde görünür.
- E-posta girişi uygulamayı terk etmeden oturum açar.
- OAuth yalnız sistem/Capacitor tarayıcısında açılır ve başarıdan sonra uygulama kapanmadan geri döner.
- Native callback yalnız beklenen özel URL şemasını, geçerli PKCE işlemini ve authorization code'u kabul eder.
- Token içeren rastgele/işlemsiz deep link oturum oluşturamaz.
- Kullanıcının tarayıcıyı iptal etmesi sonsuz yükleme bırakmaz.
- Çıkış yapıldıktan sonra eski oturum veya kullanıcıya ait yerel görünüm sızmaz.

## Uygulama–site entegrasyonu kabul kriterleri

- Favoriler, ziyaret edilen ülkeler, rota planları, profil ve kokpit kayıtları aynı kullanıcı hesabıyla eşitlenir.
- Uygulama içi özelliğe dokunmak, o özelliğin native ekranı varsa web sitesine yönlendirmez.
- Dışarı açılması gereken bağlantı kullanıcıya önceden açıkça belirtilir.
- Hesap gerektiren özellik kullanıcıyı uygulama içindeki giriş paneline taşır.
- API yanıtları doğrulanır; hatalı veya eksik veri arayüzü çökertmez.

## Tasarım hedefi

Uygulama hızlı ve anlaşılır bir yapı ile modern seyahat editoryali hissini birleştirmeli; başka bir markayı kopyalamamalıdır. Ana sayfa kişiye özel bir “seyahat nabzı” sunmalı, Keşfet görsel ilham vermeli, Rota Asistanı karar vermeyi kolaylaştırmalı ve Seyahatlerim gerçekten devam edilebilir kayıtlar göstermelidir. Gösteriş uğruna ağır animasyon, okunamayacak küçük metin veya sahte özellik ekleme.

## Teknik sınırlar

- React 19 + TypeScript + Vite + Capacitor yapısını koru.
- İşe başlamadan önce kök `package.json`, lockfile, `capacitor.config.ts`, CI/Codemagic tanımı ve platform projelerinin birlikte mevcut olduğunu doğrula. Kritik dosya eksikse tahminî bir sürüm üretme; eksikliği açıkça raporla ve yalnız güvenle doğrulanabilen işleri tamamla.
- Mevcut Next.js/Supabase/API sözleşmelerini gereksiz yere bozma.
- Tailwind ekleme; mevcut özel CSS yapısını kullan.
- `.env`, özel anahtar, sertifika, `.p8`, `.p12`, provisioning profile veya servis rolü anahtarını koda/ZIP'e koyma.
- `server.url` ile uygulamayı uzak web sitesine bağlayan WebView kabuğuna geri dönme; yerel `mobile-dist` paketini kullan.
- Eski derleme klasörlerini, `node_modules`, Gradle/Xcode önbelleklerini ve alakasız dosyaları teslim etme.
- Üretim bundle'ını yalnız gerekli genel build değişkenleri mevcutsa oluştur. Değerleri loglama, rapora yazma veya kaynak dosyaya gömme; `.env` dosyalarını teslimata dahil etme.
- Kullanıcı verisini silen veya geri alınamaz işlem yapma.

## Zorunlu doğrulama

- `npm run lint`
- TypeScript derlemesi
- Vite production build
- Üretilen `mobile-dist`, iOS `public` ve varsa Android `public` paketlerinin aynı giriş hash'lerini taşıması
- İlgili public klasörlerinde yalnız `index.html` tarafından referans verilen güncel hash'li JS/CSS giriş dosyalarının kalması
- iOS URL scheme, AppDelegate callback köprüsü, Apple entitlement, PrivacyInfo ve sürüm/build kontrolü
- Eski giriş metinlerinin/minified bundle kalıntılarının paket içinde bulunmadığına yönelik arama

## Teslim biçimi

İş bitince yalnızca oluşturduğun veya gerçekten değiştirdiğin dosyaları, proje köküne göre aynı klasör yapısıyla tek ZIP'e koy. Tüm projeyi, daha önce gönderilmiş değişmemiş dosyaları, `node_modules`, build cache veya gizli dosyaları yeniden gönderme. ZIP'e ayrıca kısa bir değişiklik ve test raporu ekle.
