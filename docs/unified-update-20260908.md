# Birleşik güncelleme — 8 Eylül 2026

Yayın kimliği: `unified-20260908`.
Temel GitHub sürümü: `30bdb974e6682c4043d24bf6391fe7a533e206f3`.
Bu belge kod teslimini anlatır; Vercel veya TestFlight yayını yapıldığını söylemez.

## Uygulananlar

| Alan | Kodda bulunan değişiklik |
| --- | --- |
| Profil | Kapak, fotoğraf ve kullanıcı bilgisi aralıkları; fotoğraf seçme, kare önizleme, onay ve kaydetme. Kullanıcıya ait özel depolama yolu ve süreli görüntü bağlantısı. JPEG yeniden kodlaması konum/EXIF bilgisini kaldırır. |
| Pasaport | Referansın kompozisyonuna göre yeni üst görsel; solda başlık, sağda elde bordo pasaport, havalimanı ve uçak. Başlangıçta bayraksız harita, yakınlaştırmada çakışma süzme; haritanın altında kontroller. |
| Pasaport seçimi | 199 pasaport ülkesi için tarihli umuma mahsus pasaport matrisi; pasaport türü seçimi. Desteklenmeyen tür/ülkelerde bilinmiyor. ETA vizesiz olarak gösterilmez. |
| Ana sayfa | Tekrarlayan büyük bölümler kaldırıldı; kısa seyahat kartı, üstlerde topluluk, rota kartları ve kompakt kısayollar. Ortak seyahat ve çevrimdışı ifadeler korunur. |
| Formlar | Etkinlik ülke/şehir alanları, tarihler ve düğme aralıkları; Rota Asistanı tercihlerinde üstte etiket ve ayrı alan; telefon güvenli alanı ve 16 px form metni. |
| Maliyet | Beş eski gezgin ortalamasından ayrı, 50 Avrupa şehri için Mayıs 2026 tarihli fiyat kataloğu. Yerel para birimi, uygun aylık CPI oranı ve kur dönüşümü. Gerçek otel teklifleri ile ek ulaşımı karşılaştıran hesap. |
| Ülke uyarıları | Görünür ülkelerin tamamını sekizli gruplarla sorgulama; eksik veri için nötr doğrulanamadı durumu. Bölgesel/ülke geneli ayrımı korunur. |
| Haber/takvim | GDELT yanında Anadolu Ajansı ve BBC RSS seçenekleri. Haber yayın tarihi ile olay tarihi ayrılır. Resmî kaynaklı iki seçim kaydı ve 247 ülke/bölge için referans saat dilimi. 10 Kasım anma günüdür. |
| Web | `/butce-hesapla` mobil ile aynı maliyet ekranını kullanır. `/ulke-gundemi` eklendi; ülke bağlantısı seçili ülkeyi açar. |
| Sürüm teşhisi | Profilde gerçek native sürüm/build, kaynak commit ve güncelleme kimliği. Mobil çıktıda `release.json`. Mevcut Codemagic build artırma adımı korunur. |

## Sınırlar — tamamlanmış gibi sunulmayanlar

- **Fiyatlar canlı rezervasyon teklifi değildir.** Katalog 50 Avrupa şehrini kapsar, tüm dünya değildir. Post Office'in iki kişilik hafta sonu karşılaştırmasından gelir. Otel örneklemi merkezde üç yıldızlı otellerin düşük fiyatlı tekliflerinden derlenmiştir; ortalama tüm oteller anlamına gelmez. Kaynağın konaklama tarihleri 5–7 Haziran 2026, veri toplama dönemi Mayıs başıdır.
- Kaynak GBP verdiği için yerel fiyatı yeniden kurmada **5 Mayıs 2026 kuru yaklaşık tarih köprüsü** olarak kullanılır. Daha sonra yerel aylık fiyat endeksi oranı ve güncel kur uygulanır. Günlük kur, gerçek fiyat ölçüm tarihi ve otel sezon fiyatını kusursuz eşleştirdiği iddia edilmez. Veri eksikse dönüşüm/enflasyon uygulanmış gibi gösterilmez. CPI genel fiyat endeksidir; otel fiyat tahminiyle aynı değildir.
- Merkez dışındaki otel fiyatı uydurma indirim oranıyla belirlenmez. Kullanıcı iki gerçek oda teklifi, gece/gün sayısı, kişi sayısı ve ilave ulaşım tutarını girer. Hazır mahalle bazlı canlı fiyat veri tabanı yoktur. Eski beş gezgin ortalamasında referans ay bilinmediğinden enflasyon uygulanmaz.
- Pasaport matrisi **17 Şubat 2026** tarihlidir; güncel hukuki giriş garantisi değildir. Türk vatandaşları için üç kimlik kartı kaydı ve özel pasaport türlerinde 13 destinasyonluk MFA ek bilgisi 8 Eylül'de kontrol edilmiştir. Diğer özel pasaport kayıtları bilinmiyor. Transit, süre ve amaç için resmî doğrulama gerekir.
- Otomatik seyahat uyarısının kaynağı FCDO'dur ve Birleşik Krallık vatandaşlarına yöneliktir. Türkiye Dışişleri bağlantısı ayrı sunulur; otomatik MFA duyuru birleştirmesi veya vatandaşlığa tam kişiselleştirme yapılmış değildir.
- AA/BBC alternatifleri kodda bağlıdır; canlı sağlayıcıların uçtan uca kullanılabilirliği bu teslimde doğrulanamadı. Başlıklar kaynak dilinde kalır; tam otomatik çeviri yoktur. Seyahate etki notları konu ve belirli olay sözcüklerine göre koşullu önerilerdir, haberin tam metnini okuyup üretilmiş olay özeti değildir.
- Doğrulanmış seçim kapsamı **İsveç 13 Eylül ve Yeni Zelanda 7 Kasım 2026** ile sınırlıdır. Diğer ülkeler için seçim tarihi icat edilmez. Resmî sayfanın tarihi tekrar kontrol edilir; doğrulanamayan eski kayıtların kullanım süresi sınırlıdır. Çok saat dilimli ülkede seçilen referans dilim açıkça gösterilir, her şehir için yerel saat garantisi değildir.
- Profil fotoğrafı API'si özel Supabase Storage ve sunucudaki mevcut `SUPABASE_SERVICE_ROLE_KEY` yapılandırmasını gerektirir. Anahtar mobil uygulamaya konmaz. Gerçek hesapla depolama/oturum ve iPhone fotoğraf seçici testi yapılmadı. HEIC cihazda açılamazsa JPEG/PNG seçme mesajı gösterilir.

## Doğrulama

| Kontrol | Sonuç |
| --- | --- |
| Uygulama regresyonları | 139/139 geçti. Değişen kompakt kartların eski metin/işaretleme beklentileri yeni tasarıma uyarlandı. |
| Veri/işlem bütünlüğü | 24/24 geçti. |
| Ülke verisi ve hesap sözleşmeleri | 29/29 geçti; kur, CPI, gerçek teklif karşılaştırması, RSS, pasaport ve fotoğraf yol sınırları dahil. Sağlayıcı istekleri bu testlerde taklittir. |
| Mobil ESLint | Sıfır uyarıyla geçti. |
| TypeScript | Geçti. |
| Mobil üretim derlemesi | Geçti. |
| Web üretim derlemesi | Next.js webpack ile geçti; 132 sayfa. Varsayılan Turbopack üretim derlemesi ayrıca doğrulanmadı. |
| Yerel görsel ilk kontrol | 393 px genişlikte yedi mobil ekran ve web maliyet sayfası açıldı; yatay taşma/çalışma zamanı istisnası gözlenmedi. API'ler kontrollü çevrimdışı yanıtlarla denendi. |
| Kapsamlı 3 genişlik × 2 dil ve etkileşim betiği | Yazıldı, ancak ortamın erişim onayı engeli nedeniyle tamamlanmış sayılmıyor. |
| Canlı sağlayıcı / gerçek iPhone / TestFlight | Tamamlanmadı. |

React kontrolü hesap değişimi sırasında geç gelen yanıtları, etki temizliğini, tembel ekran yüklemesini ve istemci/sunucu ayrımını gözden geçirmede kullanıldı. Referans görseli esas alınarak yeni pasaport üst görseli üretildi; kaynak ekranın birebir piksel kopyası değildir.

## Yayından sonra yapılacak kabul kontrolü

1. Vercel'deki yayın commit'i ile yeni iOS paketinin kaynak kimliğini karşılaştır. Profilde `unified-20260908` ve gerçek iOS build görülmeli.
2. Vercel'de `/butce-hesapla` 50 şehir kataloğunu ve `/ulke-gundemi?country=SE` doğru ülkeyi açmalı. Kaynak kesintisi başarı gibi gösterilmemeli.
3. Gerçek hesapla fotoğraf seç, kaydet, uygulamayı kapat/aç; başka hesapta önceki fotoğraf görünmemeli. Hesap/veri silme akışında özel fotoğraf da temizlenmeli.
4. 320–430 px ve gerçek iPhone güvenli alanında profil, etkinlik tarihleri, rota tercihleri, tam ekran/iki parmak harita ve büyük yazı boyutlarını dene.
5. Apple/Google/e-posta girişi; davet, ortak masraf; çevrimdışı günlük eşitleme; push ve Live Activity akışlarını gerçek cihazda doğrula. Bunlar kodun varlığı nedeniyle başarılı kabul edilmez.

## Kaynak ve lisanslar

- Post Office, [City Costs Barometer 2026 tabloları](https://www.postoffice.co.uk/dam6/jcr:46481006-9cfe-4c07-90c6-394dc52f749d/city_costs_barometer_2026_tables.2026-05-22-13-12-40.pdf).
- [Passport Index veri kümesi](https://github.com/imorte/passport-index-data), MIT lisansı `mobile/src/data/passport-index-LICENSE.txt` içinde.
- [Türkiye Dışişleri vize uygulamaları](https://www.mfa.gov.tr/turk-vatandaslarinin-tabi-oldugu-vize-uygulamalari.tr.mfa).
- [İsveç seçim kurumu](https://www.val.se/english/future-elections/2026-elections---the-riksdag-and-regional-and-municipal-councils), [Yeni Zelanda seçim kurumu](https://elections.nz/media-and-news/2026/key-dates-for-2026-general-election).
- Bayrakların MIT lisansı hem `mobile/public/flags/LICENSE.txt` hem `public/flags/LICENSE.txt` içinde korunur.

Bu değişiklikler kaynak kodu teslimidir. GitHub'a gönderim, Vercel dağıtımı ve Apple'a yükleme ayrı işlemlerdir.
