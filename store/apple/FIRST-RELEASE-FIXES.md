# İlk yayın düzeltmeleri — 10 Eylül 2026

Bu paket App Store öncesi incelemenin ilk grubunu tamamlar. Önceki Türkçe Dışişleri/ülke uyarıları ve profil yerleşimi düzeltmelerine eklenir. Sonraki ürün iyileştirmeleri ve mağazaya gönderim bu paketin kapsamı değildir.

## Tamamlananlar

- iOS gizlilik manifesti: uygulamanın kendi UserDefaults kullanımı ve kodda gerçekten saklanan 12 veri türü. Anlamsal kontrol Codemagic hazırlık aşamasında çalışır.
- Topluluk: mobil/web şikâyet, engelleme ve engeli kaldırma; kalıcı hesaba bağlı engeller; yönetimde içerik gizleme ile şikâyeti birlikte sonuçlandırma. İngilizce masum sözcükleri yanlış yakalayan filtre düzeltildi.
- Hesap silme: uygulamada talep takibi, başvuru ve hedef bitiş tarihi, açık kalıcı silme onayı, 30 günlük işlem hedefi, sonuç e-postası. Aynı başvuruyu yeniden göndermek ikinci açık talep oluşturmaz.
- Apple hesapları: mevcut hesaplar da uygulamadan Apple bağlantısını doğrulayabilir; doğru Apple kimliğine ait sunucuda şifrelenen sağlayıcı tokenı hesap/veri silinmeden önce iptal edilir. Yetkilendirme callback'i ile hesap silme aynı anda yürütülemez.
- Yönetici işlemi: rol ve talep kontrolü, tek işlem kilidi, kesinti sonrası devam, özel dosya/içerik temizliği, hesap silindikten sonra sonuç bildirimi. E-posta bekliyorsa aynı talepteki yeniden gönderme düğmesi kullanılır. Silme işlemi ikinci kez çalıştırılmaz.
- Destek: iOS sistem e-posta yönlendirmesi, düzenlenebilir taslak, kopyalama/elle seçme alternatifi, web `/destek` sayfası.
- Ek hatalar: profil adı değişikliğinin eski fotoğraf yolunu geri yazması ve native giriş penceresi açılamadığında girişin takılması giderildi.

## Kurulum sırası

1. Veritabanı değişikliklerini **sunucu kodunu yayınlamadan önce** sırasıyla uygulayın: `20260910160000_community_safety.sql`, `20260910180000_account_deletion_lifecycle.sql`, `20260910233000_apple_account_deletion.sql`. Yanındaki `APPLY-FIRST-RELEASE-FIXES.sql`, aynı üç dosyanın sıralı birleşimidir. Mevcut temel forum/KVKK ve önceki hesap silme migration'ları beklenir.
2. `ACCOUNT-DELETION-SETUP.md` içindeki Apple Services ID/callback ve altı sunucu değişkenini yapılandırın. E-posta için mevcut Resend anahtarı/gönderici alan adı çalışmalı; destek posta kutusunun gerçekten izlendiğini doğrulayın. Gizli değerleri Git'e veya sohbete yapıştırmayın.
3. İnceleme dalından sunucu önizlemesini hazırlayın; ayrı test hesaplarıyla şikâyet → yönetim → gizlenme, uygulama yeniden açıldığında engeller ve hesap silme → e-posta zincirini doğrulayın.
4. Aynı kod için Codemagic/TestFlight derlemesi alın. `npm run test:release` bu grubun otomatik kontrollerini derlemeden önce çalıştırır. Gerçek cihazdaki Apple dönüşü, posta uygulaması olmayan cihaz, dar ekran/yatay kullanım, profil fotoğrafı, bildirim ve Live Activity testleri gereklidir.
5. `PRIVACY-INVENTORY.md` ile App Store Connect cevaplarını ve son imzalı arşivin Privacy Report'unu karşılaştırın. İnceleme hesabı, destek URL'si, ekran görüntüleri ve mağaza açıklaması ayrıca tamamlanır.

## Silme işleminin işletimi

Yönetici → Moderasyon → KVKK taleplerinde hedef tarihi izleyin; süresi geçen açık talepler kırmızı gösterilir. Talebi İnceleniyor yapıp açık kalıcı silme onayıyla işleyin. Apple doğrulaması eksikse kullanıcı uygulamadan tamamlar; sağlayıcı iptali başarısızken özel dosyalara dokunulmaz. Başlatılmış silme talebi sıradan durum seçimiyle kapatılamaz; aynı işlemi yeniden deneyin. Sunucu kesilirse en fazla beş dakikalık kilit süresi bitince devam edilebilir.

Bildirim için e-posta adresi yalnız hizmet rolünün erişebildiği geçici işlem kaydında, gönderim kabul edilene kadar tutulur. Kabulden sonra adres ve hedef kullanıcı kimliği temizlenir; kalıcı yeni e-posta teslim logu oluşturulmaz. Resend'in aynı idempotency anahtarı için tekrar engelleme süresi 24 saattir; belirsiz bir ağ yanıtından 24 saat sonra yapılan yeniden denemede ikinci bildirim olasılığı vardır. Gönderim kabulü, alıcının mesajı okuduğu veya teslim aldığı anlamına gelmez. [Resend idempotency açıklaması](https://resend.com/docs/dashboard/emails/idempotency-keys).

Otomatik testler izole veritabanı ve sahte sağlayıcı yanıtlarıyla çalışır. Canlı SQL, Apple konsolu, gerçek hesap silme/e-posta ve mağaza yayını otomatik olarak gerçekleştirilmiş sayılmaz. Linux derlemesi imzalı iOS arşivinin veya gerçek cihaz kontrolünün yerine geçmez.
