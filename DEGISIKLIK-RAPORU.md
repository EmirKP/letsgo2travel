# LetsGo2Travel Mobil — Build 6 Değişiklik Raporu

## Sonuç

Kaynak kod güncel olmasına rağmen iOS ve Android paketlerinin 7 Ağustos tarihli eski JS/CSS dosyalarını taşıdığı bulundu. Bu nedenle kaynakta düzeltilmiş olan Google/Apple/e-posta akışları yayınlanan uygulamaya ulaşmıyordu. Güncel kaynak yeniden derlendi; `mobile-dist`, iOS `public` ve Android `public` artık aynı üretim paketini kullanıyor.

## Bu pakette yapılanlar

- Native OAuth callback yalnız geçerli PKCE kodu ve eşleşen, süresi dolmamış işlem kaydıyla kabul ediliyor. Native token-only deep link oturum açamıyor.
- Tarayıcı kapanışı ile uygulamaya deep-link dönüşü arasındaki yarış giderildi; başarılı dönüş, yanlışlıkla “iptal edildi” sayılmıyor.
- E-posta doğrulama ve şifre yenileme native callback akışları güncel pakete taşındı. iOS giriş panelinde Apple ve Google kaynak koduyla aynı şekilde paketlendi.
- `Seyahatlerim` içindeki ciddi bulut filtresi düzeltildi: yalnız `route_plan` kayıtları rota olarak gösteriliyor.
- Sistem `window.confirm` pencereleri yerine odak tuzağı ve güvenli varsayılanı olan uygulama içi silme onayı eklendi.
- “Daha Fazla” menüsündeki çekirdek seyahat bağlantıları web sitesine gitmek yerine Pasaport, Rota, Bilet, Kokpit ve Kaşifler Ligi native ekranlarını açıyor. Yalnız hukuki/destek bağlantıları dışarıda kaldı.
- Keşfet kartları artık doğrudan uçuş aramasına atlamıyor. Dönem, bütçe, öne çıkanlar, yerel planlama notu, favori ve uçuş eylemi içeren native rota ayrıntısı açılıyor.
- Ana sayfaya kayıtlı rota, arama ve favorileri özetleyen kişisel “Seyahat Nabzı” eklendi. Aynı ekrana giden yinelenen hızlı kısayol kaldırıldı.
- Filtre, sekme, accordion, checklist, arama alanı ve ikon düğmelerine ekran okuyucu/klavye semantiği eklendi; ekran geçişinde ana içeriğe odak taşınıyor.
- Düşük kontrastlı yardımcı metinler güçlendirildi, kritik küçük dokunma alanları 44 px'e çıkarıldı ve dar ekranda Keşfet kartları tek sütuna geçirildi.
- Sürüm metinleri tek yapılandırmadan okunuyor. Xcode ve Android build numarası `6`; arayüzdeki eski Build 5 metinleri kaldırıldı.

## Üretilen paket

- JavaScript: `assets/index-C7VWnzC4.js`
- CSS: `assets/index-B7mFp1Qt.css`
- `mobile-dist`, `ios/App/App/public` ve `android/app/src/main/assets/public` için `index.html`, JS ve CSS SHA-256 değerleri birebir eşleşiyor.
- Sağlanan genel Supabase URL/anon yapılandırmasının üretim JS paketine enjekte edildiği değerleri yazdırmadan doğrulandı.
- Eski `index-C7_8J8gr.js` ve `index-ZYqhXQy4.css` giriş dosyaları temizlendi.

## Doğrulama

- Kök `npm ci` — geçti; özgün kurulu sürümler korundu
- `npm --prefix mobile ci` — geçti
- `npm --prefix mobile run lint` — geçti
- Mobil TypeScript derlemesi (`tsc -b`) — geçti
- Vite production build — geçti
- OAuth işlem anahtarı v2 mevcut; eski PKCE anahtarı yok — geçti
- Native callback şeması paket içinde mevcut — geçti
- Üç public pakette yalnız güncel giriş hash'leri var — geçti
- iOS ikon, splash, URL scheme, AppDelegate köprüsü, Apple entitlement, PrivacyInfo ve Build 6 kontrolleri — geçti
- Android paket/sürüm, URL scheme, güvenli yedekleme ve imzalama değişkenleri kontrolleri — geçti
- `mobile:doctor` iOS + Android tam denetimi — kritik hata veya uyarı yok
- Kök ve mobil production bağımlılık güvenlik denetimleri — bilinen açık yok

Gerçek Apple/Google sağlayıcı onayı ve e-posta deep-link dönüşü fiziksel cihaz/TestFlight üzerinde ayrıca kısa bir smoke test gerektirir.

## Kök yapılandırma ve temiz CI

- Gönderilen `package.json`, `capacitor.config.ts` ve iki özdeş YAML incelendi. YAML kopyalarından yalnız biri gerçek adıyla `codemagic.yaml` olarak kullanıldı.
- Kök `package-lock.json`, özgün ZIP içindeki kurulu paket ağacının kesin sürümleri korunarak tamamlandı. Capacitor `8.4.2`, Supabase `2.108.1` ve diğer doğrulanmış Build 6 bağımlılıkları yükseltilmedi.
- `react-simple-maps@4.0.0-beta.6` paketinin eski React peer bildirimi nedeniyle temiz `npm ci` işleminin durmaması için `.npmrc` içine `legacy-peer-deps=true` eklendi. Bu, çalışma zamanındaki React sürümünü değiştirmez.
- Temiz kurulumdan sonra mobil kaynak yeniden derlendi; `mobile-dist`, iOS ve Android paketleri tekrar `index-C7VWnzC4.js` / `index-B7mFp1Qt.css` üzerinde birebir eşitlendi.

Gönderilen kaynak anlık görüntüsünde web projesine ait kök `tsconfig.json` ve Next yapılandırma dosyaları bulunmadığı için tam `next build` bu eksik dosyalarla bağımsız olarak doğrulanamadı. Codemagic iOS iş akışı `next build` çalıştırmaz; Build 6 mobil derleme, sync ve denetimleri bu eksiklikten etkilenmez.

## Sonraki güvenlik/ürün adımları

- Oturum belirteçlerini WebView `localStorage` yerine iOS Keychain destekli güvenli depoya taşımak.
- PrivacyInfo ve App Store gizlilik yanıtlarını profil adı, PNR ve seyahat içeriğiyle tam hizalamak.
- Pasaport ülkesi, para birimi, dil ve ana havalimanını içeren kalıcı seyahat bağlamı eklemek.
- Kaşifler Ligi için soru ayrıntısı, yanıt okuma ve yanıt verme akışını tamamlamak.

## Uygulama notu

ZIP'i proje köküne açtıktan sonra `SILINECEK-DOSYALAR.txt` içindeki eski hash'li dosyaları sil. `.env`, sertifika veya provisioning profile dosyalarını ZIP'ten bekleme; mevcut güvenli ortam ayarlarını koru. Ardından `main` dalında `LetsGo2Travel iOS App Store` iş akışıyla TestFlight için `1.4.0 (6)` derlemesini başlat.
