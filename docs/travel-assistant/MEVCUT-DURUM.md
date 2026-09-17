# Seyahat Asistanı — kodlama öncesi durum, 16 Eylül 2026

Taban: origin/main fad8ee2. Ayrı worktree: letsgo2travel-next-20260916.
Dal: feature/travel-assistant-v1_1-20260916. v1.1 burada plan adıdır; mağazadaki sürüm 1.4.0'dır.
Bu tablo kod envanteridir; cihazda test edildiği anlamına gelmez.

## A. Mevcut sistemde zaten bulunanlar

| Sistem | Durum | Kanıt |
|---|---|---|
| Web / mobil / native | ✅ | package.json, mobile/package.json, capacitor.config.ts, ios/, android/ |
| Auth, OAuth, logout, onboarding | ✅ | mobile/src/hooks/useAuth.ts, App.tsx, components/Onboarding.tsx |
| Push / deep links | ✅ | mobile/src/lib/push.ts, deepLink.ts, app/api/push-devices, native manifests |
| Passport / dünya haritası | ✅ | PassportScreen, PassportWorldMap, passportPreference |
| Cockpit / Trips | ✅ | CockpitScreen, PlansScreen, lib/cockpit, supabase trips migrations |
| Community / Events / Admin | ✅ | ilgili ekranlar ve app/api altındaki erişim kontrollü servisler |
| Airport Guide / Costs / News | ✅ | AirportGuideScreen, CostsScreen, CountryNewsScreen, country-intelligence |
| Günlük / ortak seyahat / masraf paylaşımı | ✅ | JourneyToolsHub, TripCollaborationHub, journalSync, trip-collaboration |

## B. Kısmen bulunanlar

| Sistem | Durum | Eksik |
|---|---|---|
| Güvenli seyahat | ⚠️ | JourneyToolsHub ve lib/cockpit/destinationInfo ayrı acil numara sözlükleri; kaynak/tarih eksik |
| Travel Companion | 🟡 | Konum, hava, hazır ifadeler, tarayıcı TTS var; ihtiyaç noktaları yok |
| Offline | 🟡 | Yerel ifadeler ve seyahat özetleri var; ülke rehberi/paket sözleşmesi yok |
| Yerel kurallar | ⚠️ | travelEssentials içinde kültür/kanun ayrımı ve kaynak yok |
| Kur | 🟡 | Frankfurter ve önbellek maliyet hesabında var; genel çift yönlü çevirici yok |

## C. Eksikler

❌ İhtiyaç ve gezi POI haritaları; vatandaşlık filtreli temsilcilik kartları; Tax Free,
su durumu ve genel çalışma saatleri için kaynaklı çevrimdışı kartlar.
Mevcut PostGIS veya bu amaçlı nokta/temsilcilik tablosu bulunmadı.

## D. v1.1'de yapılacaklar

Mevcut companion ve safety akışlarını genişlet; acil veri kaynağını birleştir.
Yeni haritayı tembel yükle, sunucuda sınırlı/cache'li OSM sorgusu kullan.
Gerçek kur servisini tekrar kullan; gün içi anlık kur iddiası yapma.
Resmi kaynakla kontrol edilen kayıtları tarihli paketle; kapsam boşluklarını görünür tut.
Yeni UI framework ekleme. Mevcut Sheet, CountryPicker, i18n ve native paylaşımını kullan.

## E. Mevcut build riskleri

Canlı API/veritabanı değişikliği mevcut native build'i etkileyebilir. Bu çalışma yereldir;
deploy, push, App Store gönderimi yapılmayacak. Bundle ID, imza, entitlement, izinler,
callback scheme ve release manifest korunacak. iOS derlemesi için macOS/Xcode gerekir.
Kaynak release manifestindeki 27, Codemagic'in atadığı mağaza build 47 ile aynı şey değildir.

## F. Veritabanı geriye uyumluluk planı

İlk aşamada yeni tablo gerekmez: doğrulanmış rehber cihazda, POI sunucu önbelleğinde.
Eski uç noktalar/yanıtlar değişmez; yeni servisler /api/travel-assistant altında olur.
RLS ve mevcut şema değişmez. İleride PostGIS/topluluk noktaları için ayrı, eklemeli
migration ve yetki testleri gereklidir. Production'a migration uygulanmaz.
