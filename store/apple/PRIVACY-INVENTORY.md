# iOS gizlilik envanteri ve yayın kontrolü

İnceleme tarihi: **10 Eylül 2026**. Kapsam: repodaki iOS uygulaması ve kullandığı sunucu akışları. Bu belge veya manifest değişikliği App Store Connect cevaplarını değiştirmez. Canlı veritabanı, sağlayıcı saklama ayarları ve imzalı arşiv ayrıca doğrulanmalıdır.

## Zorunlu API gerekçesi

`ios/App/App/LiveActivityTokenObserver.swift`, uygulamanın kendi `UserDefaults.standard` alanındaki `l2t.liveActivity.tokenBuffer` ve `l2t.liveActivity.latestPushToStartToken` anahtarlarını okuyup yazar. Amaç, WebView hazır değilken Live Activity tokenlarını tamponlamak ve oturum açıldığında uygulamanın sunucusuna kaydetmektir. Başka uygulamaların veya sistemin tercihleri okunmaz; App Group alanı kullanılmaz.

`PrivacyInfo.xcprivacy`, bu kullanım için `NSPrivacyAccessedAPICategoryUserDefaults` altında **CA92.1** beyan eder. Apple'ın güncel açıklaması bu gerekçeyi yalnız uygulamanın kendi erişebildiği tercihleri okuma/yazma ile sınırlar. SDK ve App Group gerekçeleri bu kullanımın yerine geçmez. [Apple: API kategorileri ve gerekçeler](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitype), [uygulama ve SDK manifestlerinin ayrı sorumluluğu](https://developer.apple.com/documentation/bundleresources/describing-use-of-required-reason-api).

## Uygulama dışına gönderilip saklanan veriler

Aşağıdaki **12 veri türü**, manifestte **kullanıcıyla bağlantılı**, **izleme amacı yok**, **App Functionality** amacıyla beyan edilir. Search History ayrıca mevcut rota önerileri için **Product Personalization** içerir. Aynı veri türünün bir bölümünün misafir veya ortak önbellekte bulunması, hesapla kaydedilen örneklerinin bağlantısını ortadan kaldırmaz. Özel depolama kovası da veriyi anonim yapmaz.

| Apple veri türü | Gerçek veri ve kullanım | Kod / saklandığı yer |
| --- | --- | --- |
| Name | Kayıtta veya profil düzenlemede verilen ad; hesap ve topluluk kimliği | `mobile/src/hooks/useAuth.ts`; Supabase Auth kullanıcı metadatası |
| Email Address | Oturum, hesap kurtarma ve hesap işlemleri iletişimi | `mobile/src/hooks/useAuth.ts`; Supabase Auth, `kvkk_requests` |
| User ID | Hesap UUID'si, kullanıcı adı, içerik sahipliği ve ortak seyahat üyeliği | `mobile/src/lib/supabaseData.ts`; Auth, `profiles`, kullanıcıya bağlı kayıtlar |
| Photos or Videos | Onaylanarak yüklenen profil JPEG'i ve görsel seyahat kanıtı | `app/api/profile/avatar/route.ts`, `app/api/travel-verifications/route.ts`; özel `profile-avatars` / `travel-evidence` kovaları. Apple anahtarının yazımı **PhotosorVideos** |
| Other User Content | Günlük başlığı/notu, forum yazıları/yanıtları, seyahat kontrol listeleri, kaydedilen planlar, belge/PDF ve doğrulama notu | `mobile/src/lib/journalSync.ts`, `mobile/src/lib/supabaseData.ts`, `app/api/travel-verifications/route.ts`; `user_trips`, `trips`, forum kayıtları, `travel_verifications` |
| Search History | Kaydedilen rota arama tercihleri ve sonuçları; sonraki kullanıma uygun planlar | `mobile/src/lib/guestDataSync.ts` içindeki `tripData.input`; `app/api/ai-plan/route.ts` içindeki `ai_plan_cache.input_json` |
| Device ID | APNs cihaz tokenı, Live Activity tokenı ve kurulum UUID'si; doğru cihaza bildirim ve oturum ayrımı | `app/api/push-devices/route.ts`, `lib/live-activity-tokens.ts`; `push_devices`, Live Activity oturum/token tabloları |
| Customer Support | Hesap silme/hak talebi açıklaması ve içerik şikâyeti | `app/api/kvkk-requests/route.ts`, topluluk şikâyet servisleri; kullanıcıya bağlı talep/moderasyon kayıtları |
| Coarse Location | Kullanıcının kendi bildirdiği ziyaret edilmiş ülke ve günlükteki ülke/yer geçmişi; seyahat haritası ve doğrulama | `mobile/src/lib/supabaseData.ts`, `mobile/src/lib/journalSync.ts`; `profiles.visited_countries`, `user_trips`, `travel_verifications.country_code`. Bu, sürekli GPS takibi beyanı değildir |
| Other Financial Info | Ortak seyahat bütçesi, kişinin ödediği masraf ve katılımcı borç payı | `app/api/trip-collaboration/route.ts`; `trip_budgets`, `trip_expenses`, `trip_expense_shares`. Kart veya banka bilgisi toplanmaz |
| Product Interaction | Hesaba bağlı ortak plan oyları ve yararlı oyları; uygulama içi oylama işlevi | `app/api/trip-collaboration/route.ts`, `app/api/country-community/helpful-vote/route.ts`; `trip_plan_votes`, yararlı oy kayıtları |
| Other Diagnostic Data | Bildirim/Live Activity teslim hata kodu ve teslim durumu; çalışmayan teslimatı düzeltme veya eski tokenı devreden çıkarma | `lib/push/index.ts`, `lib/live-activity-store.ts`; kullanıcı/cihaz/seyahatle bağlantılı `last_error` ve teslim kayıtları |

Apple; belirli bir medya yükleme özelliği için o medya türünü ayrıca belirtmeyi, serbest metni ise Other User Content olarak ele almayı söyler. Veri türünün isteğe bağlı bir özellikte kullanılması tek başına beyanı kaldırmaz. [Apple: veri türleri, saklama, kullanıcı bağlantısı ve kullanım amaçları](https://developer.apple.com/app-store/app-privacy-details/), [manifestte geçerli veri türü anahtarları](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacycollecteddatatypes/nsprivacycollecteddatatype).

## Sınırlar ve saklama kontrolü

- Canlı yakın çevre önerisinde konum telefonda iki ondalığa yuvarlanır. `app/api/travel-now/route.ts` yalnız anlık hava isteğinde kullanır, veritabanına yazmaz ve yanıtı `no-store` gönderir. Bu akış nedeniyle **Precise Location** eklenmedi. Harita uygulamasını açmak kullanıcının açık seçimine bağlıdır. Hava sağlayıcısının üretim saklama koşulları ayrıca kontrol edilmelidir.
- Misafir günlük/ayar verisinin yalnız cihazda kalan kısmı, kamera/fotoğraf erişim izni veya yerel bildirim planlamak tek başına sunucuda veri toplandığını göstermez. Fotoğraftan biyometrik kimlik çıkaran bir özellik yoktur; bu nedenle yalnız fotoğraf var diye Sensitive Info eklenmedi.
- Profil fotoğrafı değiştirilince eski dosyanın silinmesi denenir. Seyahat kanıtının hedef süresi 30 gündür (`evidence_expires_at`); bunun fiilen uygulanması `app/api/cron/purge-travel-evidence/route.ts` görevinin çalışmasına bağlıdır. Diğer kayıtlar hesap/içerik silme akışına bağlıdır. Kaynak kod, canlı saklama süresinin yerine kanıt sayılmaz.
- Bildirim kapatmak veya çıkış yapmak token kaydını devreden çıkarabilir; bunun tüm geçmiş kayıtları sildiği iddia edilmemelidir. Hesap silme testinde depolama, günlük/forum içeriği ve teslim kayıtları birlikte kontrol edilmelidir.
- Uygulamada reklam kimliği veya üçüncü taraf reklam izleme SDK'sı bulunmadı. `NSPrivacyTracking=false` mevcut uygulamayı anlatır. Web'deki `app/go/[provider]/route.ts` ayrı olarak tıklama, user-agent ve yapılandırıldıysa IP hash'i kaydeder. Mobil akışa bu yönlendirme/analitik eklenirse veri kullanımı ve sağlayıcı paylaşımı yeniden incelenmelidir. Bu belge tüm web sitesinin gizlilik envanteri değildir.
- Üretim Supabase/Vercel, yapay zekâ, hava, APNs ve diğer sağlayıcıların gerçek log/saklama ayarları bu incelemede okunmadı. Yeni crash SDK'sı veya davranış analitiği etkinleştirilirse manifest ve App Store cevapları tekrar güncellenmelidir.

## Yayından önce doğrulanacaklar

1. `node --test tests/ios-privacy.test.mjs` çalıştır. Boş API listesi, yanlış sözlüğe eklenmiş gerekçe, eksik fotoğraf beyanı ve yanlış kullanıcı bağlantısı gibi regresyonlar başarısız olmalıdır. `mobile:doctor -- --platform=ios` aynı semantik manifest doğrulayıcısını kullanır; mevcut Codemagic `mobile:prepare:ios` aşaması bu kontrolü imzalamadan önce çalıştırır.
2. Xcode Organizer'da **nihai imzalı arşivin** Privacy Report'unu üret; uygulama, uzantı ve dahil edilen SDK manifestlerini, API gerekçelerini ve veri türlerini incele. Uygulamanın beyanı SDK'nın kendi eksik manifestini telafi ettiği varsayılmamalıdır. Archive Validate/Upload sonucunu kaydet. Bu Linux çalışma alanında arşiv doğrulaması yapılmadı.
3. App Store Connect'te bu envanterle App Privacy cevaplarını eşleştir; yayınlanan gizlilik politikası, sağlayıcı kullanımı ve saklama uygulamasıyla karşılaştır. Bu dosya konsoldaki cevapların tamamlandığı anlamına gelmez.
4. TestFlight'ta gerçek iPhone ve iPad üzerinde fotoğraf seçme/iptal/yükleme, hesap değiştirme/silme, çevrimdışı günlük eşitleme ve bildirim kapatmayı dene. Üretim APNs ile bildirim/Live Activity start-update-end ve uygulama kapalıyken token yakalama ayrıca cihaz kanıtı gerektirir.
