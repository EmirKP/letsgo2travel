# LetsGo2Travel Build 24

Bu paket güncel **Build 23** `main` dalının üzerine uygulanır. Uygulama sürümü **1.4.0 / Build 24**, Apple ve Android yükleme numarası **25** olur. Önceki TestFlight paketinin 24 numarasını kullanması nedeniyle bu iki sayı farklıdır; artık tek yayın manifestinden kontrol edilir.

## Kurulum

1. ZIP'i İndirilenler klasörüne indirin ve verilen PowerShell bloğunu çalıştırın.
2. Komut, ZIP'teki `BUILD24-SUPABASE.sql` içeriğini panoya kopyalar. LetsGo2Travel projesinin **Supabase → SQL Editor → New query** ekranına yapıştırıp çalıştırın. Başarılı olduktan sonra PowerShell'e dönüp `EVET` yazın.
3. Komut temiz `main` dalını günceller, `backup/build23-before-build24-...` adında yerel yedek dal oluşturur, patch'i uygular ve GitHub'a gönderir. Kayıtlı olmayan değişiklik veya yarım kalmış patch varsa işlemi durdurur.
4. Web yayınının tamamlanmasını bekleyin. Codemagic'te güncel `main` ile iOS akışını çalıştırın ve çıkan **1.4.0 (25)** paketini TestFlight'ta yükleyin. Eski telefondaki paket, GitHub'a gönderimle kendiliğinden güncellenmez.

SQL, repodaki `supabase/migrations/20260905000200_build24_integrity.sql` ile aynıdır. Build 22 ortak seyahat tablolarının ve mevcut doğrulama tablolarının kurulu olmasını bekler. Yeni işlem fonksiyonlarını ekler; mevcut kayıtları silmez veya dönüştürmez. Tekrar çalıştırılabilir. Yeni API sürümünden önce uygulanmalıdır. Yeni ortam değişkeni gerekmiyor.

## Düzeltilenler

- **Admin doğrulaması:** Onay, ülke yetkisi, puan, rozet ve işlem kaydı tek veritabanı işlemi içinde tamamlanır. Hata olursa tamamı geri alınır ve belge korunur. Belge yalnız başarılı karar sonrasında temizlenir; temizleme hatası tekrar denenebilir. Eksik belgesi olan başvuru gerekçeyle reddedilebilir, belgesiz onaylanamaz.
- **Ortak masraflar:** Masraf ve kişi payları birlikte kaydedilir. Tekrarlanan aynı gönderim ikinci masraf oluşturmaz. Bölüşüm kuruş bazında tam tutarı korur. Masraf bulunan seyahatte farklı para birimine geçiş engellenir; eski farklı birimli bakiyeler ayrı gösterilir. Masraf geçmişi olan kişinin çıkarılması engellenir.
- **Arkadaş daveti:** Davet alanı hem kodu hem tam bağlantıyı kabul eder. Bekleyen davet oturum açma ve uygulamayı yeniden başlatma sırasında korunur. HTTPS davet sayfasında hesabıyla giriş yapan kişi web üzerinden de katılabilir.
- **Seyahat günlüğü:** Eşitleme ekran kapalıyken de uygulama düzeyinde sürer. Çevrimdışı kayıtlar ve silmeler kuyrukta tutulur; başarısız işlemler tekrar denenir. 25/150 kayıt sınırları kaldırıldı, sunucu kayıtları sayfalanır. Boş, geçersiz veya gelecek günlük tarihleri kabul edilmez; cihazda kayıt başarısızsa taslak korunur.
- **Harita:** Portre/yatay görünümde sürükleme hesabı düzeltildi. Harita 20 kata kadar yakınlaşır; sayfa ölçeklenmez. Bayraklar ekran üzerinde okunabilir boyutta kalır ve çakışan bayraklar yakınlaşma düzeyine göre düzenlenir.
- **Güvenli seyahat merkezi:** Daha önce alınmış seyahat özetleri çevrimdışı açılır; önbelleğe PNR gibi rezervasyon bilgileri eklenmez. Seyahat kaydı olmadan da ülke seçilir. Polis ve ambulans numaraları ayrı eylemlerle gösterilir.
- **Aktarma ve yıllık özet:** Aktarma değerlendirmesine ayrı bilet, bagaj ve terminal değişimi eklendi; havalimanına özel minimum süre hesabı gibi sunulmaz. Yıllık özette gelecekteki/iptal edilmiş seyahatler çıkarılır, çakışan seyahat günleri bir kez sayılır.
- **Ana sayfa:** Topluluk girişi karşılama alanının hemen altına taşındı. Mevcut mavi, beyaz, siyah ve sarı renkler korundu.

## Doğrulama sonucu

- 22 veri bütünlüğü testi geçti; gerçek PostgreSQL uyumlu PGlite üzerinde işlem geri alma ve SQL tekrar kurulum senaryoları dahil.
- 137 uygulama testi ve 39 fiyat alarmı testi geçti.
- Web üretim derlemesi, web/mobil lint, mobil TypeScript/Vite derlemesi ve iOS/Android varlık eşitleme kontrolleri geçti.
- Paket, temiz Build 23 kopyasına `git am --3way` ile uygulanıp kaynak ağacı karşılaştırılarak doğrulanır.
- Bu ortamda iPhone, imzalı IPA ve canlı Supabase testi yapılmadı. Tarayıcı önizlemesi ortam kısıtı nedeniyle açılamadı.

Yerel derlemede Supabase genel URL/anon anahtarı ve Android FCM dosyası bulunmadığı için üç yapılandırma uyarısı var. Codemagic mevcut `letsgo2travel_public` grubundaki genel anahtarlarla mobil dosyaları yeniden derler; bu değerler eksikse iş akışı derlemeden önce durur. Buradaki önceden derlenmiş dosyaları doğrudan IPA olarak kullanmayın. Android yayını ayrıca kendi Firebase dosyasını gerektirir.

## Telefondaki son kontrol

1. Ana sayfadaki Topluluk kartını açın.
2. İkinci hesapla davet bağlantısından webde ve uygulamada seyahate katılın; giriş yapmadan açılan daveti de deneyin.
3. Bir masraf ekleyin, payların toplamını kontrol edin; para birimi değişimini ve çift dokunmayı deneyin.
4. Çevrimdışı günlük ekleyip başka ekrana geçin; bağlantı geldiğinde hesaba eşitlendiğini kontrol edin. Bir kaydı çevrimdışı silip tekrar bağlanın.
5. Haritada iki parmakla yakınlaşın, farklı yönlere sürükleyin ve ülkeye dokunun.
6. Admin panelinde yeni bir test başvurusunun belgesini açıp karar verin. **Daha önce silinmiş belgeler bu kodla geri getirilemez**; ilgili başvurunun yeniden belge göndermesi gerekir.

## Gönderim kesilirse

PowerShell bloğu tekrar çalıştırılabilir. Build 24 zaten uygulanmışsa ters patch kontrolü yapar ve aynı patch'i ikinci kez uygulamadan gönderimi yeniden dener. Yarım kalmış `git am` veya başka yerel değişiklik görürse otomatik silme/geri alma yapmaz; hata çıktısını paylaşın. `Everything up-to-date` tek başına başarı sayılmaz; komut uzak `main` ile yerel commit'i karşılaştırır.

## Geri dönüş

Build 23 kaynakları yerel yedek dalda ve Git geçmişinde korunur. Paylaşılan `main` için geçmişi silmek yerine Build 24 commit'ini `git revert` ile geri alan ayrı commit hazırlayın. SQL fonksiyonlarının eklenmesi mevcut verileri değiştirmediğinden kod geri dönüşü için tablo silmek gerekmez. Yeni TestFlight yüklemesinde daha önce kullanılmamış daha büyük bir yükleme numarası gerekir.
