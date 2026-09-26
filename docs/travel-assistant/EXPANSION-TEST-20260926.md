# Genişletilmiş test sürümü — 26 Eylül 2026

Kullanıcı sonraya bırakılan çevrimdışı çeviri, ulaşım ve fotoğraftan rehberin aynı test sürümüne alınmasını istedi. Bu dosya ilk genişleme raporundan sonraki durumu anlatır. Kod yerel geliştirme dalındadır; yayın veya Apple gönderimi yapılmadı.

## Bu turda eklenenler

- **Çevrimdışı çeviri:** kaynak/hedef dil seçimi, destek ve indirilmiş paket durumu, kullanıcının başlattığı indirme, 2000 karakter sınırı, cihazda çeviri. iOS 18+ için Apple Translation köprüsü; diğer yerel paket için ML Kit köprüsü. Destek cihazdan sorulur; menüdeki 20 dilin her cihazda desteklendiği iddia edilmez. Türkçe dahil her çift gerçek cihazda kontrol edilmelidir. Tarayıcıda hazır ifadeler alternatifi sunulur. Dil değişince eski çeviri gösterilmez.
- **Ulaşım:** Londra metro durak araması; aktarma merkezleri gerçek metro duraklarına açılır. TfL üzerinden metro/otobüs/yürüyüş bağlantıları, üç rota, süreler, duraklar ve aksama uyarıları. Saatler Londra yerel saatidir; 5 dakikadan eski sonuç tekrar sorgu ister. Diğer şehirler dış harita hizmetine yönlendirilir. Dünya çapında GTFS aktarımı veya canlı araç takibi tamamlanmış değildir.
- **Fotoğraftan rehber:** JPEG/PNG/WebP seçimi, önizleme, açık Google Gemini gönderim onayı, oturum kontrolü, sunucuda görsel yeniden kodlama ve metaveri temizliği, sınırlı yapay zekâ yanıtı. Fotoğraf ve yanıt veritabanına yazılmaz. Hesap başına günde 5, tüm servis için günde 100 deneme üst sınırı veritabanında atomik uygulanır. Hesap silinince kişisel kota kayıtları da silinir. Canlı analiz henüz etkinleştirilmedi; ekranda bu durum açıkça yazıyor.
- **Çevrimdışı sokak haritası:** seçilen yaklaşık merkez çevresinde 1,5 km sokak ve seçili noktalar; cihazda en fazla 3 bölge / 3 MB. İndirme isteğe bağlıdır. Raster harita karoları toplu indirilmez. Paket, kaynak tarihi, kapsam sınırı, eski paket uyarısı ve silme eylemi vardır. Tam şehir haritası, navigasyon veya Mapbox paketi değildir.
- **İkon/haber düzenlemesi:** asistan araçlarına tutarlı simgeler; ülke haberlerine hava/afet filtresi ve başlık/kaynak araması. Yenile düğmesi uygulama önbelleğine ek olarak HTTP önbelleğini de yeniden doğrulatır. Önceki haber kaynakları ve logo çalışması korunur.
- İlk paketteki acil numara, temsilcilik, rehber, kaynak tarihi ve Apple profil metni düzeltmeleri bu çalışmaya dahildir. Ülke rehberinin gerçek başlık kapsamı `COVERAGE-20260926.md` dosyasındadır; bütün başlıklar bütün ülkelerde tamamlanmış değildir.

## Tamamlanan doğrulama

- Asistan testleri 24/24: önceki 16 test ve 8 yeni test. Yeni kontroller: durak/rota doğrulama, eksik aktarma reddi, eski rota reddi, aktarma merkezi çözümü, harita sınırları ve depolama hatası, parça parça gelen büyük istek, fotoğraf yanıt şeması, oturum/onay/kota sırası, görsel metaveri temizliği, gerçek PostgreSQL uyumlu PGlite üzerinde kota ve hesap silme.
- Genel `npm run test:release` geçti: mevcut hesap silme, topluluk, bildirim, gizlilik ve diğer yayın kontrolleri dahil.
- Kök/mobil lint, Next üretim derlemesi ve `npm run mobile:prepare:all` geçti. Mobil doktorun tek uyarısı bu kopyada bulunmayan FCM yapılandırmasıdır; imzalı dağıtım testi sayılmaz.
- Android Java derleme kontrolü `:app:compileDebugJavaWithJavac` geçti; ML Kit köprüsü derlendi. APK cihaz kurulumu/çeviri kalitesi testi yapılmadı.
- Gerçek yerel ekran → API → TfL → ekran: Waterloo ve Euston arandı, gerçek metro durakları seçildi, 9 dakikalık Northern line seçenekleri ve erişilebilirlik aksaması gösterildi.
- OSM sokak paketi Berlin için indirildi (ilk doğrulamada 499 yol, yaklaşık 111 KB JSON). Sağlayıcının geçici ret ve zaman aşımı davranışı görüldü; hata gizlenmedi. Sorgunun bellek sınırı 16 MB, alınan yanıt sınırı 4 MB, cihaz paket bütçesi 3 MB. Son sürüm ihtiyaç/gezi noktalarını ayrı kontenjanlarla alır.
- Sunucu kapatılıp arayüz yeniden açıldı: kayıtlı Berlin haritası ve noktaları görüntülendi. Yeni indirme başarısız olduğunda eski paket korundu. Bu, tarayıcıdaki yerel depolama doğrulamasıdır; fiziksel cihaz uçak modu testi ayrıca gerekir.
- Ülke haberlerinde başlık araması gerçek haber listesini daralttı; hava filtresi telefon ekranında seçildi. Türkçe sağanak/yağış başlıklarının hava kategorisine alınması düzeltildi ve 46 ülke-bilgisi kontrolü geçti. Son API yanıtında sağanak haberi weather kategorisiyle doğrulandı.
- 390×844 ve 820×1180 görünümlerinde yatay taşma görülmedi. Türkçe/İngilizce araç etiketleri, tarayıcıda desteklenmeyen çeviri durumu ve etkin olmayan fotoğraf servisi mesajı kontrol edildi.

## Sunucuya kurulmadan önce

1. `supabase/migrations/20260926170000_travel_photo_quota.sql` uygulanmalı. Eksik kota altyapısında fotoğraf servisi kapalı kalır; sınırsız sağlayıcı çağrısına düşmez.
2. Ana API sunucusunda `AI_CAMERA_ENABLED=true`, görsel destekleyen doğrulanmış `GEMINI_CAMERA_MODEL` ve mevcut gizli Gemini anahtarı gerekir. Anahtar istemciye konmaz. Gerçek bir test hesabı ve test fotoğrafıyla canlı yanıt/iptal/hata/kota kontrolü yapılmalı. Sağlayıcının veri işleme koşulları ayrıca gözden geçirilmeli; mevcut yasal metin bu özelliği açıklar.
3. Ayrı test servisi dışa aktarımı yeni ulaşım ve çevrimdışı harita dosyalarını kapsar. Fotoğraf API'si ve hesap anahtarları bu genel veri servisine taşınmaz; fotoğraf istekleri daima ana API adresini kullanır.
4. OSM/TfL genel veri servislerinin süreç başı sınırları tüm dağıtımı kapsayan ortak kota değildir. Ticari yoğunluk için uygun sağlayıcı sözleşmesi/kapasitesi ve ortak oran sınırı değerlendirilmelidir. Uygun Overpass sağlayıcısı sunucu değişkeniyle seçilebilir; otomatik olarak rastgele servislere geçilmez.

## TestFlight ve Apple durumu

Yeni IPA üretilmedi, App Store Connect'e gönderim yapılmadı. Önceki **1.4.0 (48)** bugünkü eklemeleri içermez. Yerel manifestte eski temel build 27 bulunuyor; yeni imzalı test paketinde App Store Connect'teki son numaradan büyük benzersiz build kullanılmalı, uygulama ve uzantı numaraları eşleşmelidir.

Mobil derleme testinde yalnız gerçek olmayan açık Supabase değerleri kullanıldı. Bu çıktılar teslim arşivine alınmadı; native klasörlerde test için üretilen dosyalar başlangıç durumuna döndürüldü. Yeni dağıtımda gerçek açık yapılandırmayla yeniden paket oluşturulmalıdır. Signing ayarları, üretim verileri ve mevcut App Store görselleri değiştirilmedi.

iOS Swift köprüsü Xcode/cihazda henüz derlenip çalıştırılmadı. Apple Translation fiziksel cihaz gerektirir; simülatör geçişi yeterli sayılmaz. `REAL-DEVICE-TEST-CHECKLIST.md` tamamlanmadan bu pakete Apple'a hazır denmemeli.

## Uygulama kaynakları

- [Apple Translation örneği ve cihaz gereksinimleri](https://developer.apple.com/documentation/translation/translating-text-within-your-app)
- [ML Kit cihazda çeviri ve paket yönetimi](https://developers.google.com/ml-kit/language/translation/android)
- [TfL resmî API sözleşmesi](https://api.tfl.gov.uk/swagger/docs/v1)
- [OpenStreetMap/Overpass servisleri ve kullanım sınırları](https://wiki.openstreetmap.org/wiki/Overpass_API#Public_Overpass_API_instances)
- [Google Gemini API koşulları](https://ai.google.dev/gemini-api/terms)

Çalışma dalı: `feature/travel-assistant-expansion-20260926`. Başlangıç: `b5fe1f45f8b18817b70f9ca7cea46b19e1bccb16`. Değişiklikler commit/push yapılmadan yerel dosyalardadır.
