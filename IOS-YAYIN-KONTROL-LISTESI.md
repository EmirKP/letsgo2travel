# LetsGo2Travel iOS 1.4.0 yayın kontrol listesi

Güncellendi: **10 Eylül 2026**. Güncel mağaza metinleri, doğrulama durumu ve kalan konsol alanları [App Store gönderim dosyasında](store/apple/APP-STORE-SUBMISSION.md).

`main` dalındaki `fcb4937` için [Codemagic iOS derlemesi](https://codemagic.io/app/6a74ee8453cdaf155d4e575a/build/6aa31c346699407235116e40) 10 Eylül 2026 21:14:52 UTC'de başarılı tamamlandı. Yayın testleri, imzalı IPA ve Publishing aşamaları geçti. Yeni paketin gerçek build numarası ve Apple tarafındaki işleme durumu bu oturumda okunmadı; eski Build 23/24 veya depodaki başlangıç değeri yeni TestFlight numarası olarak kullanılmamalı.

## Kodda tamamlanan hazırlıklar

- Ayrı ve cihaz içine gömülen mobil istemci; yayın ayarında uzak `server.url` yok.
- Bundle ID: `tr.com.letsgo2travel.app`.
- iOS 15 ve üzeri iPhone/iPad hedefi.
- OAuth özel URL dönüşü ve Capacitor App yönlendirme köprüsü.
- OAuth dönüşünde şema, host ve yolun tam eşleşme kontrolü; tek seferde tek PKCE işlemi.
- E-posta kayıt/doğrulama ve şifre kurtarma için uygulamaya dönen PKCE akışı.
- Sign in with Apple entitlement ve Xcode capability kaydı.
- iOS güvenli alan, durum çubuğu, mobil içerik modu ve üretimde kapalı WebView debug ayarı.
- `PrivacyInfo.xcprivacy` Xcode Resources hedefine bağlı.
- 1024×1024 App Store ikonu ve 2732×2732 açılış görseli.
- Uygulama içinden hesap ve veri silme talebi.
- Gizlilik Politikası, Kullanım Şartları ve destek bağlantıları.
- Oturumun uygulama ön plana geldiğinde yenilenmesi ve aynı anda çift token yenilemenin önlenmesi.
- iOS'ta 16px form alanları, güvenli alanlar, klavye odak yönetimi ve azaltılmış hareket desteği.

## Apple Developer kurulum başvurusu

Mevcut App ID ve uygulama kaydı yeniden oluşturulmaz. Aşağıdaki bölüm mevcut kurulumun kontrolü veya yeniden kurulması gerektiğinde başvuru içindir. Apple hesap silme dönüşü ve sunucu ayarları [ACCOUNT-DELETION-SETUP.md](store/apple/ACCOUNT-DELETION-SETUP.md) dosyasındadır.

1. Apple Developer > Certificates, Identifiers & Profiles içinde `tr.com.letsgo2travel.app` App ID'sini oluşturun ve **Sign in with Apple** capability'sini etkinleştirin.
2. Web OAuth dönüşü için mevcut `tr.com.letsgo2travel.web` Services ID kaydını kullanın; birincil App ID `tr.com.letsgo2travel.app` olmalıdır.
3. Services ID > Sign in with Apple yapılandırmasında domain olarak `<SUPABASE_PROJECT_REF>.supabase.co`, return URL olarak `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback` ekleyin.
4. Sign in with Apple için bir anahtar oluşturun. Team ID, Key ID, Services ID ve private key ile üretilen client secret değerini yalnız Supabase Apple provider ekranına girin. Private key/client secret mobil pakete veya Git'e eklenmez.
5. Apple client secret'ın son kullanma tarihini takip edin ve süresi dolmadan yenileyin.
6. Kullanıcının **E-postamı Gizle** seçeneğiyle verdiği `privaterelay.appleid.com` adreslerine uygulama e-postalarının ulaşması için Apple Developer'daki Sign in with Apple for Email Communication bölümünde gönderici e-posta kaynaklarını/domainini kaydedin.
7. Xcode > Signing & Capabilities bölümünde doğru Team'i seçin, Automatically manage signing açık kalsın ve **Sign in with Apple** capability'sinin göründüğünü doğrulayın. Capability açıldıktan sonra provisioning profile'ı yenileyin.
8. Push bildirimi yayınlanacaksa App ID için Push Notifications capability ve APNs anahtarını oluşturun. Bu özellik bağlanana kadar uygulama normal çalışır ancak push göndermez.
9. App Store Connect'te aynı Bundle ID ile yeni iOS uygulaması oluşturun.

## Google Cloud ve Supabase Auth kurulumu

1. Google Cloud Console'da **Web application** türünde OAuth 2.0 istemcisi oluşturun.
2. Authorized redirect URI olarak `https://<SUPABASE_PROJECT_REF>.supabase.co/auth/v1/callback` ekleyin.
3. Google Client ID ve Client Secret değerlerini Supabase > Authentication > Providers > Google alanına girip sağlayıcıyı etkinleştirin.
4. Supabase > Authentication > Providers > Apple alanında Services ID/client ID ve Apple client secret değerlerini girip sağlayıcıyı etkinleştirin.
5. Supabase > Authentication > URL Configuration bölümünde Site URL'yi `https://www.letsgo2travel.com.tr` yapın ve şu Redirect URLs değerlerini ayrı ayrı ekleyin:

   - `tr.com.letsgo2travel.app://auth/callback`
   - `https://www.letsgo2travel.com.tr/auth/callback`
   - `https://www.letsgo2travel.com.tr/sifre-yenile`

6. iPhone'da Google ve Apple girişlerini, e-posta doğrulamasını ve şifre sıfırlamayı hem uygulama açıkken hem tamamen kapalıyken test edin.

Apple girişi iOS pakette varsayılan olarak açıktır. `VITE_APPLE_AUTH_ENABLED=false` yalnız sağlayıcının bilinçli olarak kapatıldığı geliştirme/test paketlerinde kullanılmalıdır. Google girişi iOS'ta yayınlanıyorsa App Review öncesi Apple girişi de çalışır durumda olmalıdır.

Not: Bu sürüm Supabase'in tarayıcı tabanlı Apple OAuth akışını kullanır. Apple, tam adı identity token'a koymaz ve OAuth akışında ad bilgisini uygulamaya vermez; bu nedenle uygulama ilk girişten sonra ad ve kullanıcı adı için yerel bir profil tamamlama formu gösterir. Tam adı Apple'ın yalnız ilk yetkilendirmede verdiği anda otomatik kaydetmek istenirse ayrı bir yerel AuthenticationServices köprüsüyle credential alınmalı, nonce doğrulamalı `signInWithIdToken` çağrısından hemen sonra kullanıcı metadata'sı güncellenmelidir.

## App Store Connect alanları

- Ad: `LetsGo2Travel`
- Birincil kategori: `Travel`
- Sürüm: `1.4.0`; paket build numarası App Store Connect'teki son başarılı yüklemeden okunur.
- Bundle ID: `tr.com.letsgo2travel.app`
- Gizlilik Politikası: `https://www.letsgo2travel.com.tr/gizlilik-politikasi`
- Destek: `https://www.letsgo2travel.com.tr/destek` — `hello@letsgo2travel.com.tr`
- Hesap silme: uygulamada `Hesabım > Hesap silme > Hesabımı silme talebi oluştur`

App Privacy bölümündeki yanıtlar gerçek üretim davranışıyla aynı olmalıdır. Mevcut manifestte profil fotoğrafı, günlük, ortak masraf ve bildirim kayıtları dahil **12 veri türü** vardır; ayrıntılı eşleme [PRIVACY-INVENTORY.md](store/apple/PRIVACY-INVENTORY.md) içindedir. Üç veri türüyle sınırlı eski beyan kullanılmamalıdır. Mağaza açıklamaları [Türkçe](store/apple/metadata/tr-TR.json) ve [İngilizce](store/apple/metadata/en-US.json) olarak hazırdır.

## İnceleme hesabı

App Review Information alanına çalışan, e-postası doğrulanmış standart kullanıcı hesabı ekleyin. Kimlik bilgileri yalnız konsolun özel alanına girilir. [Hazır inceleme notları](store/apple/APP-REVIEW-NOTES.md) şu akışları açıklar:

- Uygulamanın temel keşif, pasaport ve rota özellikleri giriş yapmadan kullanılabilir.
- Hesap eşitleme, Kokpit, ortak planlar ve topluluk etkileşimleri için inceleme hesabı kullanılır.
- Şikâyet/engelleme yazar adına dokununca açılır; engeli kaldırma Profil ayarlarındadır.
- Hesap silme talebi `Hesabım > Hesap silme` ekranındadır.
- Uygulamada ücretli dijital içerik veya uygulama içi satın alma yoktur.

## Mac ve cihaz doğrulaması için başvuru

İmzalı build ve yükleme Codemagic'te tamamlandı. Aşağıdaki yerel komutlar bu başarıyı yeniden elde etmek için zorunlu değildir; cihaz veya Xcode incelemesi gerektiğinde kullanılır. Son paket üzerinde fiziksel iPhone/iPad, gerçek Apple yetkilendirme iptali ve APNs/Live Activity teslimi bu oturumda doğrulanmadı.

```bash
npm ci
npm --prefix mobile ci
npm run mobile:check:ios
npm run mobile:ios
```

Xcode'da sırasıyla:

1. Simülatör build.
2. Fiziksel iPhone build.
3. Product > Archive.
4. Organizer > Validate App.
5. Privacy Report üretip `PrivacyInfo.xcprivacy` ve App Store Connect beyanlarını karşılaştırın.
6. Distribute App > App Store Connect > Upload.

## Gönderimden önce durdurucu kontroller

- Hiçbir buton veya yasal bağlantı bozuk olmamalı.
- Backend ve Supabase üretim ortamı çalışır durumda olmalı.
- Demo hesap ile giriş yapılabilmeli.
- App Store ekran görüntüleri gerçek uygulamadan alınmalı; kontrollü örnek içerik kullanılabilir, kişisel e-posta veya gizli anahtar görünmemeli. [Çekim planı](store/apple/SCREENSHOT-PLAN.md).
- `.env.local`, service-role anahtarı ve Apple özel anahtarları Git'e veya teslim paketine eklenmemeli.
