# Topluluk referans tasarımı — 28 Eylül 2026

Kullanıcının `ChatGPT Görseli 28 Eyl 2026 19_05_09.png` referansı temel alınmıştır. Orijinal gezgin figürlü LetsGo2Travel logosu korunmuştur.

## Görünüm

- Tam genişlikte gün batımı ve sırt çantalı gezgin kapağı; beyaz başlık ve el yazısı vurgusu.
- Beyaz, yuvarlatılmış içerik alanı; mavi sekmeler ve sarı sabit paylaşım düğmesi.
- Keşfet, Takip Ettiklerim, Ülke Grupları, Soru & Cevap ve Etkinlikler sekmeleri.
- Sekiz fotoğraflı bölge filtresi, Kaşifler Ligi şeridi, üç seyahat fikri kartı ve gerçek soru akışı.
- Dar telefonlarda sekmeler, bölgeler ve keşif kartları yatay kaydırılır; yazılar küçültülerek sıkıştırılmaz.
- Gerçek bildirim sayacı, profil, menü ve doğrudan TR/EN dil değişimi.

## Çalışan davranışlar ve veri sınırları

- Akış mevcut yayımlanmış soru-cevap hizmetinden en fazla 40 içerik getirir. Kapaktaki gezgin/paylaşım sayıları yalnız bu akışı tanımlar; toplam topluluk büyüklüğü değildir.
- Mevcut ülke/bölge kataloğunun tamamına erişim vardır. Bölge, ülke, metin ve cevap durumuna göre filtreleme; yeni/en çok cevap/cevap bekleyen sıralaması çalışır.
- Takip, bu cihazdaki ülke grubu tercihidir. Kişi takibi veya sunucu aboneliği değildir. Misafir ve her hesap ayrı saklanır; yazma hatası başarılı gibi gösterilmez. Hesap silme onay akışı ilgili tercihi de temizler.
- Kaşifler Ligi yalnız açılınca yüklenir ve gerçek katılımcıları gösterir. Puanlardan doğrulama rozeti türetilmez.
- Keşfetmeye Değer kartları uygulamanın seyahat fikirleridir; kullanıcı gönderisi veya kullanıcı fotoğrafı gibi gösterilmez. Gerçek destinasyon aramasına açılır.
- Gönderi Paylaş mevcut ülke/soru formunu açar; giriş, moderasyon, cevap erişimi, engelleme ve bildirim işlemleri korunur. Fotoğraflı sosyal gönderi yükleme, kişi takibi, gönderi beğenisi ve kayıtlı gönderi servisi bu değişiklikte eklenmemiştir.
- Etkinlikler mevcut gerçek etkinlik ekranına bağlanır.
- Arama kapatıldığında gizli filtre kalmaz. Dil/token yenilemesi açık soru ve lig isteklerini geçersiz kılıp yüklemede bırakmaz; hesap değişikliği bütün özel ekran durumunu sıfırlar.
- Sayfa geçişi tamamlandığında transform bırakılır; sabit paylaşım düğmesi ekranın altına bağlı kalır. Azaltılmış hareket tercihi korunur.

## Görseller

`mobile/src/assets/community-reference/` altında `community-hero.webp`, `league-banner.webp`, Amerika/Afrika/Okyanusya küçük bölge görselleri yerleşik imagegen ile üretildi. Fotoğraflar dekoratif destinasyon illüstrasyonlarıdır. Avrupa küçük görseli mevcut `public/destinations/paris-eiffel.jpg` dosyasından 240×240 WebP olarak kodlandı (yaklaşık 7 KB). Logo yeniden üretilmedi.

Tam istem ve üretim kayıtları çalışma alanında:

- `outputs/community-reference-20260928/assets.md`
- `community-reference-20260928/region-assets.md`

## Doğrulama

- Topluluk davranışları 11/11; ülke eşleştirme 6/6; takip tercihleri 9/9.
- Gezinme/planlama 31/31; hesap silme 13/13; uygulama kontrolleri 139/139.
- Mobil TypeScript, ESLint ve üretim derlemesi başarılı.
- Tarayıcıda 360, 390 ve 850 piksel genişlikler; Türkçe/İngilizce, gerçek soru/kilitli cevaplar, lig, arama, ülke takibi, misafir paylaşım kapısı ve etkinlik geçişi kontrol edildi. Yatay sayfa taşması, kırık görsel ve konsol hatası görülmedi.
- Test sırasında misafir hesabına eklenen Almanya takibi kaldırıldı. Gerçek gönderi/cevap veya hesap silme isteği gönderilmedi.

Bu değişiklik yerel önizleme içindir. Vercel veya TestFlight yayını yapılmadı.
