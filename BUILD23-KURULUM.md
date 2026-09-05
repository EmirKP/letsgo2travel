# LetsGo2Travel Build 23 kurulumu

Bu paket temiz ve güncel **Build 22** `main` dalının üzerine uygulanır. Build 23 için yeni Supabase migration'ı veya yeni ortam değişkeni gerekmez.

## Bu build'de tamamlananlar

- Ortak seyahat özelliği Kokpit'in içinden çıkarılıp **Seyahatlerim** ekranının en üstüne taşındı.
- Ana sayfaya ortak planlama için tek dokunuşluk belirgin giriş eklendi.
- Paylaşılan davet artık çalışan bir HTTPS davet sayfası açıyor; buradan iOS/Android uygulamasına geçiliyor.
- Giriş yapmamış kullanıcıda davet kodu kaybolmuyor; oturum açınca katılma akışı otomatik devam ediyor.
- Seyahat günlüğü ve hesapla eşitlenen anı kayıtları eklendi.
- Gezilen ülkeleri gösteren etkileşimli dünya haritası eklendi.
- Havalimanı/aktarma süresi değerlendirmesi ve adım adım aktarma yardımcısı eklendi.
- Seyahate göre acil numaralar, hazırlık listesi ve yerel uyarılar içeren güvenli seyahat merkezi eklendi.
- Seyahat, ülke, gün, uçuş ve anı sayılarını birleştiren paylaşılabilir yıllık seyahat özeti eklendi.
- Seyahat araçları ayrı pakete bölündü; ağır dünya haritası yalnız açıldığında yüklenerek Seyahatlerim ekranının ilk açılışı hafifletildi.
- Seyahatlerim ekranındaki yinelenen hesap isteği kaldırıldı; günlükler mevcut hesap verisinden besleniyor.
- Çevrimdışı eklenen günlük kayıtları bağlantı geri geldiğinde otomatik olarak hesaba eşitleniyor.
- Cihaz depolaması dolu veya kapalıysa günlük akışı çökmeden kullanıcıya açık hata gösteriyor.
- Davet sayfasındaki uzun kod kopyalama adımları kaldırıldı; bağlantı daveti uygulamaya otomatik taşıyor.

## TestFlight numarası

Apple'da `23`, yanlışlıkla kaldırılan önceki paketin yeniden yüklenmesi için kullanıldığı için Codemagic bu sürümü otomatik olarak **TestFlight Build 24** şeklinde yükler. Uygulama içindeki özellik sürümü **Build 23** olarak görünür.

## Gerçek cihaz kontrolü

1. Ana sayfadaki **Birlikte planla** kartından Seyahatlerim'e geçin.
2. İkinci bir hesaba davet bağlantısı gönderin; bağlantıda **Uygulamada aç** düğmesine dokunun. Kod kopyalama adımı çıkmamalı.
3. Giriş yapılmamışsa oturum açın ve davetin otomatik olarak hazır kaldığını doğrulayın.
4. Seyahatlerim'deki beş aracın her birini açın; günlük kaydı ekleyin ve dünya haritasına dokunun.
5. Aktarma havalimanı/süresi seçin, güvenlik merkezini ve yıllık özeti kontrol edin.
6. İnterneti kapatıp bir günlük kaydı ekleyin; bağlantıyı açınca kaydın hesaba otomatik eşitlendiğini doğrulayın.

## Geri dönüş

Kod için geri dönüş commit'i oluşturabilirsiniz:

```powershell
git revert HEAD
git push origin main
```

Build 22'deki ortak seyahat Supabase tabloları korunur; Build 23 bunlara yeni tablo eklemez.
