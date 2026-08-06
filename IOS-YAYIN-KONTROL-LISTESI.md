# LetsGo2Travel iOS 1.3.0 yayın kontrol listesi

## Kodda tamamlanan hazırlıklar

- Ayrı ve cihaz içine gömülen mobil istemci; yayın ayarında uzak `server.url` yok.
- Bundle ID: `tr.com.letsgo2travel.app`.
- iOS 15 ve üzeri iPhone/iPad hedefi.
- OAuth özel URL dönüşü ve Capacitor App yönlendirme köprüsü.
- iOS güvenli alan, durum çubuğu, mobil içerik modu ve üretimde kapalı WebView debug ayarı.
- `PrivacyInfo.xcprivacy` Xcode Resources hedefine bağlı.
- 1024×1024 App Store ikonu ve 2732×2732 açılış görseli.
- Uygulama içinden hesap ve veri silme talebi.
- Gizlilik Politikası, Kullanım Şartları ve destek bağlantıları.
- Oturumun uygulama ön plana geldiğinde yenilenmesi ve aynı anda çift token yenilemenin önlenmesi.
- iOS'ta 16px form alanları, güvenli alanlar, klavye odak yönetimi ve azaltılmış hareket desteği.

## Apple Developer hesabında yapılacaklar

1. Apple Developer > Certificates, Identifiers & Profiles içinde `tr.com.letsgo2travel.app` App ID'sini oluşturun.
2. Xcode > Signing & Capabilities bölümünde doğru Team'i seçin ve Automatically manage signing açık kalsın.
3. Push bildirimi yayınlanacaksa App ID için Push Notifications capability ve APNs anahtarını oluşturun. Bu özellik bağlanana kadar uygulama normal çalışır ancak push göndermez.
4. Apple ile giriş açılacaksa App ID ve Supabase Apple provider ayarlarını tamamlayın; sonra `VITE_APPLE_AUTH_ENABLED=true` ile yeniden build alın.
5. App Store Connect'te aynı Bundle ID ile yeni iOS uygulaması oluşturun.

## App Store Connect alanları

- Ad: `LetsGo2Travel`
- Birincil kategori: `Travel`
- Sürüm: `1.3.0`
- Bundle ID: `tr.com.letsgo2travel.app`
- Gizlilik Politikası: `https://www.letsgo2travel.com.tr/gizlilik-politikasi`
- Destek: `https://www.letsgo2travel.com.tr` veya çalışan destek sayfası
- Hesap silme: uygulamada `Hesabım > Hesabı ve verileri sil`

App Privacy bölümündeki yanıtlar gerçek üretim davranışıyla aynı olmalıdır. Mevcut uygulama e-posta adresi, kullanıcı kimliği ve arama/rota tercihlerini uygulama işlevi ve kişiselleştirme için işleyebilir; izleme amacı beyan edilmemiştir.

## İnceleme hesabı

App Review Information alanına çalışan, e-postası doğrulanmış standart kullanıcı hesabı ekleyin. İnceleme notunda aşağıdakileri yazın:

- Uygulamanın temel keşif, pasaport ve rota özellikleri giriş yapmadan kullanılabilir.
- Fiyat alarmlarını uygulama içinde yönetmek için inceleme hesabı kullanılabilir.
- Hesap silme talebi `Hesabım` ekranındadır.
- Uygulamada ücretli dijital içerik veya uygulama içi satın alma yoktur.

## Mac üzerinde son doğrulama

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
- App Store ekran görüntülerinde test verisi, kişisel e-posta veya gizli anahtar görünmemeli.
- `.env.local`, service-role anahtarı ve Apple özel anahtarları Git'e veya teslim paketine eklenmemeli.
