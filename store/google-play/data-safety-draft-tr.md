# Google Play Data Safety taslağı

Bu dosya Play Console'a körlemesine kopyalanacak bir hukuk beyanı değildir. Yayın öncesinde canlıdaki Supabase, e-posta, analiz ve hata izleme servisleriyle karşılaştırılarak son kez doğrulanmalıdır.

## Uygulamanın mevcut koduna göre veri türleri

| Veri grubu | Toplanma durumu | Amaç | Kullanıcı kontrolü |
|---|---|---|---|
| E-posta adresi | Hesap, fiyat alarmı veya hak talebi kullanılırsa | Hesap yönetimi, bildirim ve destek | Hesap/veri silme talebiyle silinebilir |
| Ad, kullanıcı adı | Hesap oluştururken | Profil ve topluluk kimliği | Profil ayarları veya silme talebi |
| Hesap kimliği ve oturum | Hesapla giriş yapılırsa | Web/iOS/Android arasında aynı kişisel kayıtları yetkilendirme | Çıkış, hesap silme |
| Kullanıcı içeriği | Forum/ülke deneyimi kullanılırsa | Topluluk özelliği ve moderasyon | İçerik yönetimi; hesap silmede anonimleştirme |
| Kullanıcının seçtiği fotoğraflar | Topluluk fotoğrafı veya doğrulama yüklenirse; fotoğraftan rehberde ayrıca onay alınır | Paylaşım, doğrulama veya seçilen görseli açıklama | Yüklemeyi iptal etme; ilgili içerik ve hesap silme yolu |
| Seyahat, PNR, tarihler, hazırlık listesi | Kokpit kaydı oluşturulursa | Yolculuk yönetimi ve hesaba bağlı eşitleme | Seyahat düzenleme/silme |
| Kaydedilen rota, yer/etkinlik ve notlar | Kullanıcı kaydederse | Kişisel planların eşitlenmesi | Kayıt silme; cihazda bekleyen değişikliklerin eşitlenmesi |
| Bütçe tahminleri ve ortak gider kayıtları | Kullanıcı eklerse | Seyahat bütçesi ve paylaşılmış plan yönetimi; ödeme işlemi değildir | Kayıt veya bağlı seyahat silme |
| Cihaz/push kimlikleri | Bildirim kaydı etkinleştirilirse | FCM ile doğru hesap/cihaza bildirim gönderme | İzin iptali, çıkışta cihaz kaydını kapatma |
| Uçuş alarmı tercihleri | Fiyat alarmı kurulursa | İstenen rotayı ve fiyat eşiğini izleme | Alarm kapatılabilir veya silinebilir |
| Konum | Kullanıcı konumla arama başlatırsa; uygulama koordinatı iki ondalığa yuvarlar | Hava, yakın yerler ve harita araması | İzin reddedilebilir; kaydedilmiş yer koordinatı ayrıca kişisel kayıt olabilir |
| Seyahat kanıtı dosyası | Kullanıcı isteğe bağlı yüklerse | Gezgin doğrulaması | Karar verildiğinde veya en geç 30 günde silinir |
| Hak/silme talebi bilgileri | Talep formu gönderilirse | Yasal talebi inceleme ve sonuçlandırma | Talep sürecinin gerektirdiği süreyle sınırlı tutulur |

## Kodda istenmeyen veri türleri

- Konum yuvarlaması tek başına Play'in “yaklaşık konum” sınıfını kanıtlamaz: Google'ın sınırı 3 km²'dir; iki ondalık koordinat bunun altında kalabilir. Son izinler, SDK'lar, sağlayıcı saklama davranışı ve kayıtlı yerler dikkate alınarak beyan hazırlanmalı.
- Kişi listesi, SMS, arama geçmişi veya mikrofon erişimi istenmez. Fotoğraf/PDF seçimi sistem seçicisinden kullanıcı eylemiyle yapılır; tüm galeriye erişim gerekmez.
- Biletten doldurma OCR işlemi Android'de cihazda yapılır; seçilen PDF/görsel buluta gönderilmez. Kullanıcının doğrulayıp kaydettiği uçuş alanları Kokpit hesabına gönderilir.
- Uygulama içinde ödeme/kredi kartı verisi işlenmez.
- Reklam kimliği izni veya yapılandırılmış reklam SDK'sı yoktur.
- Push bildirim tokenı yalnız kullanıcının açık izniyle, ilgili cihaz ve hesap sahipliğiyle eşleştirilir; çıkışta cihaz kaydı etkisizleştirilir.

## Güvenlik ve silme yanıtları

- Ağ trafiği HTTPS üzerinden yürür; cleartext trafik Android manifestinde kapalıdır.
- Kullanıcı, uygulama içindeki Hesabım alanından hesap silme talebi oluşturabilir.
- Web talep adresi: https://www.letsgo2travel.com.tr/veri-silme-ve-hak-talebi?request=account_deletion&source=google-play
- Hesap silme sürecinin kullanıcı onayı, Apple bağlantısının gerektiğinde iptali ve sunucudaki ilişkili kayıt temizliği mevcut hesap silme akışıyla doğrulanmalıdır; yalnız hesabı devre dışı bırakmak silme sayılmaz.
- Hesap silindiğinde kimliği gerekli olmayan topluluk zincirleri diğer kullanıcı cevaplarını korumak için anonimleştirilir.

## Play Console'da son kontrol

1. Canlı ortamda sonradan eklenmiş Analytics, Crashlytics, reklam veya oturum kaydı servisi varsa bu taslağı güncelle.
2. Play Console → Uygulama içeriği → Veri Güvenliği bölümündeki hesap silme sorularını tamamla.
3. Hesap silme URL'sini oturumsuz tarayıcıda açıp sayfanın herkese erişilebilir olduğunu doğrula.
4. Gizlilik politikasındaki gerçek veri sorumlusu adı, adresi ve iletişim e-postasını yayımdan önce doldur.

Resmî rehber: https://support.google.com/googleplay/android-developer/answer/10787469
Hesap silme şartı: https://support.google.com/googleplay/android-developer/answer/13327111
