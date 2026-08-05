# Google Play Data Safety taslağı

Bu dosya Play Console'a körlemesine kopyalanacak bir hukuk beyanı değildir. Yayın öncesinde canlıdaki Supabase, e-posta, analiz ve hata izleme servisleriyle karşılaştırılarak son kez doğrulanmalıdır.

## Uygulamanın mevcut koduna göre veri türleri

| Veri grubu | Toplanma durumu | Amaç | Kullanıcı kontrolü |
|---|---|---|---|
| E-posta adresi | Hesap, fiyat alarmı veya hak talebi kullanılırsa | Hesap yönetimi, bildirim ve destek | Hesap/veri silme talebiyle silinebilir |
| Ad, kullanıcı adı | Hesap oluştururken | Profil ve topluluk kimliği | Profil ayarları veya silme talebi |
| Kullanıcı içeriği | Forum/ülke deneyimi kullanılırsa | Topluluk özelliği ve moderasyon | İçerik yönetimi; hesap silmede anonimleştirme |
| Uçuş alarmı tercihleri | Fiyat alarmı kurulursa | İstenen rotayı ve fiyat eşiğini izleme | Alarm kapatılabilir veya silinebilir |
| Seyahat kanıtı dosyası | Kullanıcı isteğe bağlı yüklerse | Gezgin doğrulaması | Karar verildiğinde veya en geç 30 günde silinir |
| Hak/silme talebi bilgileri | Talep formu gönderilirse | Yasal talebi inceleme ve sonuçlandırma | Talep sürecinin gerektirdiği süreyle sınırlı tutulur |

## Kodda istenmeyen veri türleri

- Kesin konum izni yoktur.
- Kişi listesi, SMS, arama geçmişi, fotoğraf galerisi veya mikrofon izni yoktur.
- Uygulama içinde ödeme/kredi kartı verisi işlenmez.
- Reklam kimliği izni veya yapılandırılmış reklam SDK'sı yoktur.
- Yapılandırılmamış push bildirim eklentisi yayın paketinden çıkarılmıştır.

## Güvenlik ve silme yanıtları

- Ağ trafiği HTTPS üzerinden yürür; cleartext trafik Android manifestinde kapalıdır.
- Kullanıcı, uygulama içindeki Hesabım alanından hesap silme talebi oluşturabilir.
- Web talep adresi: https://www.letsgo2travel.com.tr/veri-silme-ve-hak-talebi?request=account_deletion&source=google-play
- Yönetici, talebi önce “İnceleniyor” durumuna alır; ikinci açık onay olmadan hesap silinmez.
- Hesap silindiğinde kimliği gerekli olmayan topluluk zincirleri diğer kullanıcı cevaplarını korumak için anonimleştirilir.

## Play Console'da son kontrol

1. Canlı ortamda sonradan eklenmiş Analytics, Crashlytics, reklam veya oturum kaydı servisi varsa bu taslağı güncelle.
2. Play Console → Uygulama içeriği → Veri Güvenliği bölümündeki hesap silme sorularını tamamla.
3. Hesap silme URL'sini oturumsuz tarayıcıda açıp sayfanın herkese erişilebilir olduğunu doğrula.
4. Gizlilik politikasındaki gerçek veri sorumlusu adı, adresi ve iletişim e-postasını yayımdan önce doldur.

Resmî rehber: https://support.google.com/googleplay/android-developer/answer/10787469
Hesap silme şartı: https://support.google.com/googleplay/android-developer/answer/13327111
