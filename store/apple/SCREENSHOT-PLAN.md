# App Store ekran görüntüsü planı

Hedef: 1.4.0 uygulamasının gerçek ekranlarını Türkçe ve İngilizce olarak göstermek. Bu dosya çekim planıdır; henüz ekran görüntüsü çıktısı üretilmedi veya Apple'a yüklenmedi.

## Çıktılar

Her dil için iPhone ve iPad'de aynı sırayla altı ekran hazırlanacak. iPhone seti için 6.9 inç grubundaki **1320 × 2868**, iPad seti için 13 inç grubundaki **2064 × 2752** dikey boyutları seçildi. Uygulama iPad'i de hedeflediğinden iPad görünümü ayrıca alınmalı. PNG/JPEG kullanılabilir; alfa kanalı veya saydamlık olmamalı. Apple bir cihaz grubu ve yerelleştirme için 1–10 görüntü kabul eder. [Apple ekran görüntüsü ölçüleri](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications/).

Dosya düzeni: `screenshots/tr-TR/iphone/01-explore.png`, `screenshots/tr-TR/ipad/01-explore.png` ve aynı yapıda `en-US`. Bu adlar üretilecek çıktıları tarif eder; dosyalar henüz yoktur.

| Sıra / dosya | Gerçek ekran | Türkçe başlık | İngilizce başlık | Gösterilecek durum |
| --- | --- | --- | --- | --- |
| 01-explore | Keşfet | Bir sonraki rotanı keşfet | Find your next destination | Ülke kartları; tek bir pasaport seçimiyle tutarlı giriş etiketleri |
| 02-plan | Planla: rota sonucu | Sana uygun bir plan | A plan that fits your trip | Açılmış, okunabilir günlük rota ve bütçe özeti |
| 03-saved | Kaydedilenler: rota detayı | Planın her zaman elinin altında | Keep your plan close | Cihaza kaydedilmiş gerçek rota; kayıt durumu doğru |
| 04-trips | Seyahatlerim: ortak plan | Birlikte planla, masrafları paylaş | Plan together, share expenses | Örnek seyahatin planı, oyları veya bütçe/masraf özeti |
| 05-events | Etkinlik Radarı / etkinlik detayı | Seyahatine bir etkinlik ekle | Add an event to your journey | Gerçek kaynaklı, tarihi gösterilen etkinlik; saat yoksa uydurulmuş saat veya hatırlatıcı yok |
| 06-profile | Profil: ziyaret edilen ülkeler | Gezdiğin yerleri hatırla | Remember where you have been | Örnek profil ve kaydedilmiş ülkeler; kişisel e-posta veya gerçek seyahat belgesi görünmüyor |

Kullanılan demo planlar ve profil, uygulamanın kendi işlevleriyle oluşturulmalı. Görsellere çalışmayan özellik, sahte sistem uyarısı, uydurma başarı sayısı veya henüz alınmamış kullanıcı yorumu eklenmez. Çevrimdışı vize takip servisi ve doğrulanmamış canlı uçuş verisi pazarlama görseli olarak kullanılmaz.

iPhone görüntüsünü iPad boyutuna esnetmek yerine iPad görünümü ayrı çekilir. Sistem çubuğu, güvenli alanlar, klavye ve içerik taşmaları kontrol edilir. Hesaplar için uygulamaya özgü örnek içerik kullanılabilir; gerçek kişilerin e-posta, PNR, belge, ödeme veya oturum bilgileri görünmez.

Görüntüler elde edilince boyut, renk modu/saydamlık, dil, okunurluk ve uygulamada karşılığı olan içerik açısından kontrol edilir. Görsel çıktıları olmadan bu aşama tamamlandı olarak kaydedilmez.
