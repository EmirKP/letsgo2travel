# LetsGo2Travel App Store gönderim hazırlığı

Hazırlık tarihi: **10 Eylül 2026**. Bu dosya konsola gönderilmiş bir başvuru değildir. Uygulama kodu için doğrulanan sürüm: `fcb49379f04d224ac728fc5af5f7a196c613cc7c`.

## Doğrulanan derleme

| Alan | Sonuç |
| --- | --- |
| Sürüm | 1.4.0 |
| Bundle ID | `tr.com.letsgo2travel.app` |
| Kaynak dal / commit | `main` / `fcb4937` |
| Codemagic | [Başarılı iOS derlemesi](https://codemagic.io/app/6a74ee8453cdaf155d4e575a/build/6aa31c346699407235116e40) |
| Tamamlanma | 10 Eylül 2026, 21:14:52 UTC |
| GitHub kontrolü | `LetsGo2Travel iOS App Store`, check run `103051744622`, `completed / success` |
| Aşamalar | Mobil yapılandırma kontrolü, tüm yayın testleri, otomatik build numarası, iOS eşitleme, imzalı IPA ve Publishing başarılı |
| Gerçek paket build numarası | GitHub kontrol özetinde yok; App Store Connect'teki paket kaydından okunacak |
| Apple işleme / TestFlight / App Review | Konsol erişimi olmadığından bu hazırlıkta doğrulanmadı |

Depodaki release manifestinin build sayısı yalnız başlangıç değeridir. Codemagic, App Store Connect'teki son sayıdan hareketle yeni sayıyı üretir; manifestteki 27 veya eski belgelerdeki 24, yeni paketin numarası diye kullanılmamalı. Publishing başarısı App Review'a gönderildiği anlamına gelmez. Mevcut `codemagic.yaml` yalnız App Store Connect yüklemesini yapılandırır. [Codemagic yükleme seçenekleri](https://docs.codemagic.io/yaml-publishing/app-store-connect/).

## Hazır mağaza alanları

Türkçe metinler [metadata/tr-TR.json](metadata/tr-TR.json), İngilizce metinler [metadata/en-US.json](metadata/en-US.json) dosyalarındadır. Bunlar alan bazında kopyalanacak kaynak dosyalardır; kendiliğinden konsola yüklenmez.

| App Store Connect alanı | Değer / kaynak |
| --- | --- |
| Name | LetsGo2Travel |
| Primary Language | Turkish önerilir; mevcut uygulama kaydının değeri ayrıca okunmalı |
| Primary Category | Travel |
| Subtitle | İlgili JSON dosyasındaki `subtitle` |
| Promotional Text | `promotionalText` |
| Description | `description` — satır sonları korunarak düz metin |
| Keywords | `keywords` — virgülle ayrılmış |
| What's New | `whatsNew` — yalnız konsol bir sürüm güncellemesi için alanı gösteriyorsa |
| Support URL | https://www.letsgo2travel.com.tr/destek |
| Privacy Policy URL | https://www.letsgo2travel.com.tr/gizlilik-politikasi |
| Privacy Choices URL | https://www.letsgo2travel.com.tr/veri-silme-ve-hak-talebi |
| Marketing URL | https://www.letsgo2travel.com.tr |
| App Review Notes | [APP-REVIEW-NOTES.md](APP-REVIEW-NOTES.md) içindeki İngilizce Notes bölümü |
| Copyright | Hak sahibi kişi/kurumun gerçek adı ve hakların edinildiği yıl; doğrulanmadan marka veya kişi adıyla doldurulmadı |

Ad ve alt başlık en çok 30 karakterdir. Tanıtım metni 170, açıklama 4.000 karakteri aşmaz. Apple anahtar kelimeler için 100 **bayt** sınırı belirtir; Türkçe karakterler UTF-8'de birden çok bayt olabilir. Bu iki dosya bu sınırlarla kontrol edilmelidir. [Uygulama alanları](https://developer.apple.com/help/app-store-connect/reference/app-information/app-information/), [sürüm alanları ve sınırları](https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information/).

10 Eylül kontrolünde destek, gizlilik ve veri hakları sayfaları HTTP 200 döndü; destek sayfasında `hello@letsgo2travel.com.tr` bulunuyor. Bu hazırlıkta `lib/legal/content.ts` metnine mevcut mobil veri kullanımları eklendi. Bu dosyanın bulunduğu değişiklik yayımlanmadan yeni politika canlıda tamamlanmış sayılmaz. Mobil yasal görünüm aynı içeriği `/api/legal/gizlilik-politikasi` üzerinden alır; bu metin değişikliği için yeni bir IPA gerekmez.

## App Privacy cevap taslağı

Kaynak: [PRIVACY-INVENTORY.md](PRIVACY-INVENTORY.md) ve `ios/App/App/PrivacyInfo.xcprivacy`. Mevcut kodda beyan edilen 12 tür aşağıdadır; tümü hesap veya cihaz üzerinden kullanıcıyla bağlantılıdır ve işlev sunmak için kullanılır. Arama geçmişi ayrıca rota kişiselleştirmesi için kullanılır. Reklam takibi beyanı yoktur.

| Konsoldaki veri türü | Uygulamadaki karşılığı |
| --- | --- |
| Name | Ad / kullanıcı profili |
| Email Address | Giriş, kurtarma ve hesap talebi iletişimi |
| User ID | Hesap ve içerik sahipliği |
| Photos or Videos | Profil fotoğrafı ve görsel seyahat kanıtı |
| Other User Content | Günlük, forum, plan, kontrol listesi ve belgeler |
| Search History | Kaydedilen rota aramaları ve öneri girdileri |
| Device ID | Bildirim/Live Activity adresleme ve kurulum kimliği |
| Customer Support | Hesap silme, destek ve şikâyet kayıtları |
| Coarse Location | Kullanıcının kaydettiği ülke ve yer geçmişi |
| Other Financial Info | Ortak bütçe, masraf ve borç payları |
| Product Interaction | Ortak plan ve yararlı oyları |
| Other Diagnostic Data | Bildirim teslim hata ve durum kayıtları |

Bu taslak “veri toplanmıyor” veya “kullanıcıyla bağlantısı yok” cevabıyla değiştirilmemeli. Yalnız cihazdaki misafir veri ile sunucuda tutulan hesap verisi aynı şey değildir. Canlı sağlayıcıların saklama ve log ayarları ile nihai IPA Privacy Report'u bu oturumda incelenmedi; son konsol cevapları bunlarla da eşleştirilmelidir. [Apple'ın veri türü ve kullanım açıklamaları](https://developer.apple.com/app-store/app-privacy-details/).

## Konsol ve cihaz kanıtı gereken kalanlar

| Konu | Mevcut durum / tamamlanma ölçütü |
| --- | --- |
| Paket seçimi | 1.4.0 altında son başarılı derlemenin gerçek build numarası ve Apple işleme sonucu görülecek; hazır paket sürüme bağlanacak |
| Mağaza metinleri | TR/EN metinler hazır; konsola girildiği henüz doğrulanmadı |
| Görseller | [Ekran görüntüsü planı](SCREENSHOT-PLAN.md) hazır; gerçek iPhone/iPad çıktıları henüz üretilmedi veya yüklenmedi |
| İnceleme hesabı | Mevcut standart inceleme hesabı ve canlı giriş başarısı doğrulanacak; parola Git'e eklenmeyecek |
| İrtibat ve hak sahibi | Gerçek inceleme irtibat bilgileri, copyright ve mevcut satıcı kaydı konsoldan tamamlanacak |
| Yaş derecelendirmesi | Toplulukta kullanıcı içeriği var. Haber ve tartışmaların içeriği/frekansı dahil anket cevaplanacak; peşinen 4+ seçilmeyecek |
| Gizlilik | Yeni kamuya açık metin yayımlanacak; envanter, sağlayıcı uygulamaları ve konsol cevapları karşılaştırılacak |
| Fiyat ve ülkeler | Mevcut fiyat/dağıtım seçimi okunacak; bu dosya fiyat veya dağıtım ülkelerini değiştirmez |
| Bölgesel bilgiler | Konsolun istediği satıcı/DSA ve sözleşme alanları gerçek hesap bilgileriyle tamamlanacak; hukuki statü tahmin edilmedi |
| Cihaz akışları | Son imzalı paketin gerçek iPhone/iPad'de Apple girişi, fotoğraf izni, klavye, hesap silme ve APNs/Live Activity davranışı henüz bu oturumda doğrulanmadı |
| Yayın kararı | Metin veya otomatik build başarısı tek başına incelemeye gönderim/onay değildir |

Yaş derecelendirmesi uygulamanın gerçek içerik ve yeteneklerine verilen anket cevaplarından hesaplanır. App Store Connect ekranı görülmeden sonuç yaşı veya anket cevapları kaydedildiği iddia edilmez. [Apple yaş derecelendirmesi akışı](https://developer.apple.com/help/app-store-connect/manage-app-information/set-an-app-age-rating/).

Bu kalanlar geliştirme testlerini kullanıcıya yeniden yaptırma listesi değildir. Otomatik testler Codemagic'te geçti. Erişilemeyen Apple konsolu ve fiziksel cihaz davranışları için ayrıca kanıt gerekir; doğrulanmayan durumlar tamamlandı diye işaretlenmez.
