# Seyahat akışları — doğrulama kaydı, 10 Eylül 2026

Başlangıç sürümü: `main` / `d624c057832fc28c388e867f2178a5a8e22119df`.

## Değişen davranışlar

- Uçuşlar kalkış ve varış havalimanlarının IANA saat diliminden UTC'ye çevrilir. Telefonun saat dilimi uçuş süresini değiştirmez. Saat değişiminde hiç oluşmayan saat reddedilir; iki kez oluşan saat için gerçek UTC seçeneklerinden biri seçilir. Bilinmeyen havalimanının saat dilimi kullanıcıdan alınır. Tarih çizgisini geçen uçuşlarda varışın yerel tarihi önceki gün olabilir.
- Rota kaydetme/silme önce hesaba özel kalıcı kuyruğa yazılır. Ağ kesintisi, ekranın kapatılması ve uygulamanın yeniden başlaması kayıtları kaybettirmez. Misafir aktarımı aynı yazma sırasını kullanır. Bekleyen işlemler tekrar denenir; silme kayıtları geç gelen yüklemelerin rotayı geri getirmesini önler. Durum ve yeniden deneme düğmesi Kaydedilenler'de görünür.
- Pasaport ülkesi ve türü ortak tercihte saklanır. Keşfet etiketleri, Vizesiz filtresi ve buradan oluşturulan rota seçili pasaportu kullanır. Bilinmeyen durum vizesiz kabul edilmez.
- Etkinliğin yerel günü ve kesin saat bilgisi ayrı taşınır. Saati açıklanmayan etkinliğe öğlen/gece yarısı saati uydurulmaz ve hatırlatıcı kurulmaz. Kaydedilmiş eski etkinlikler yeni saat bilgisiyle güncellenir.
- Hatırlatıcılar hesap ve etkinlik kimliği taşır. Bildirimden ve Kaydedilenler'den doğru etkinlik ayrıntısı açılır. Başarısız iptal kalıcı olarak saklanır ve yeniden denenir; hesap değişiminde önceki hesabın hatırlatıcıları temizlenir.
- Vize hizmetinin güncel, sağlıklı bağlantısı doğrulanmadan yeni takip, sürdürme ve yeniden kontrol başlatılamaz. Sunucu 503 döndürür; süre/üyelik veya takip kaydı oluşturulmaz. Duraklatma kullanılabilir kalır.

## Çalıştırılan kontroller

| Kontrol | Sonuç |
|---|---|
| `npm run test:release` | Başarılı; Codemagic'in kullandığı tam yayın kontrolü |
| Uygulama regresyonları | 139/139 |
| Bildirim regresyonları | 39/39 |
| Ülke verileri ve kaynaklar | 46/46 |
| Veri bütünlüğü, ortak seyahat ve PostgreSQL kontrolleri | 24/24 |
| Yeni seyahat davranış testleri | 28/28 |
| Hesap silme yaşam döngüsü/veritabanı/arayüz | 10 + 7 + 8 başarılı |
| Apple hesap silme | 16 sağlayıcı taklitli kontrol; 13 veritabanı testi başarılı |
| Topluluk, destek ve iOS gizlilik kontrolleri | Başarılı |
| Web üretim derlemesi | Başarılı |
| Mobil lint ve üretim derlemesi | Başarılı |
| iOS/Android Capacitor hazırlığı | Başarılı; Xcode ile IPA derlemesi değildir |
| Değişen web TypeScript dosyalarının lint kontrolü | Başarılı |
| Gerçek React ekranlarının etkileşimleri | Pasaport → Keşfet, kayıt → eşitleme durumu, bildirim → etkinlik ayrıntısı başarılı; tarayıcı yerleşim testi değildir |

`tests/travel-readiness/run.mjs`, gerçek uygulama modüllerini çalıştırır; yalnız depolama/işletim sistemi/ağ sınırları taklit edilir. Testler UTC, Los Angeles ve Tokyo cihaz dilimlerini; New York/Lord Howe saat geçişlerini; Tokyo–Honolulu tarih çizgisini; ağ kesintisini; geç yanıtı; hesap değişimini ve depolama hatasını kapsar. Yayın kontrolüne eklenmiştir.

## Canlı gözlem ve sınırlar

- 10 Eylül 2026 20:15 UTC: canlı `/api/health` 200; veritabanı durumu `ok`.
- Aynı kontrolde vize hizmeti `offline`; son bağlantı `2026-08-27T20:57:39.407+00:00`. Bu çalışma sunucuyu yeniden başlatmaz; sağlıksız hizmet üzerinden takip başlatılmasını engeller.
- Yerel mobil hazırlığında Supabase genel ayarları ve Android `google-services.json` sağlanmadığı için üç uyarı vardır. Bu yerel paket mağazaya gönderilmez. Codemagic, kendi `letsgo2travel_public` grubundaki iki Supabase ayarını zorunlu kontrol eder ve mobil paketi yeniden üretir. Üretilmiş native web dosyaları bu değişikliğe eklenmez.
- Fiziksel iPhone/iPad, Apple'ın gerçek yetkilendirme/iptal hizmeti, APNs teslimi ve imzalı TestFlight paketi bu ortamda çalıştırılmadı. Otomatik kontroller bu sonuçların yerine geçmez. Gerçek kullanıcı hesabı silinmedi ve gerçek e-posta gönderilmedi.
- Önceden telefonun yanlış saat dilimiyle kaydedilmiş uçuşların asıl bilet saati bilinmediğinden eski saatler tahminle değiştirilmez. Yeni kayıtlar doğru dönüşümü kullanır.
- Cihaz çevrimdışıyken sunucuda sonradan tamamlanan eski bir yazma, bağlantı/ön plana dönüşte yeniden uzlaştırılır. Yerel silme kaydı bu sırada korunur.

## Saat dilimi verisi

6.650 havalimanında doğrulanabilir, tekil IATA–IANA eşleştirmesi vardır. Kalan kayıtlarda ülke saat dilimi tahmin edilmez. Kaynak: [mwgg/Airports](https://github.com/mwgg/Airports), MIT lisansı `lib/airport-time-zones-LICENSE.txt` içinde korunmuştur. Üretim betiği indirilen kaynak dosyasının SHA-256 değerini sabitler; güncel dosya üretim derlemesinde internetten çekilmez.

Sağlayıcı zaman alanlarının sözleşmeleri: [Ticketmaster Discovery](https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/), [PredictHQ Events](https://docs.predicthq.com/api/events/search-events). Saat dönüşümü, [ECMA-402 Intl.DateTimeFormat](https://tc39.es/ecma402/#sec-intl.datetimeformat) ve ortamın IANA kurallarını kullanır.
