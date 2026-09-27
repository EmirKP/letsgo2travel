# Fotoğraftan rehber: hizmet hazırlığı — 27 Eylül 2026

Bu çalışma canlı ayarları, veritabanını veya dağıtımı değiştirmez. Model yanıtları testlerde sahte sağlayıcıyla doğrulanır; gerçek fotoğraf analizi doğrulanmış değildir.

## Bu değişiklik

- Hizmet kontrolü yalnız özellik bayrağına bakmaz. Yönetici istemcisi ve kota fonksiyonuna erişimi de sınar. `consume_travel_photo_quota(p_user: null)` mevcut migration gereği hiçbir kayıt yazmadan `false` döner. Kontrol günlük hak tüketmez, kullanıcı/anahtar/veritabanı ayrıntısı döndürmez. Eş zamanlı kontroller birleştirilir; olumlu sonuç 30, olumsuz sonuç 5 saniye işlem içinde saklanır. HTTP yanıtı `private, no-store` kalır.
- Kimlik doğrulaması 4 saniye, istek gövdesi okuması 4 saniye, görsel işleme 3 saniye, kota 3 saniye, model çağrısı 25 saniye ile sınırlandırılır. Başarısız kimlik veya geçersiz fotoğraf sonrası kota/model çağrısı başlamaz. Kota yanıtının zaman aşımına uğraması, işlemin veritabanında kesinlikle geri alındığı anlamına gelmez; otomatik POST yeniden denemesi yapılmaz.
- Kullanıcı bağlantı geri gelince veya düğmeyle hizmeti tekrar denetleyebilir. Kapalı hizmet, geçici sunucu sorunu ve bağlantı hatası ayrı açıklanır.
- Dil/oturum değişince önceki fotoğraf ve yanıt kaldırılır. İşlem sürerken temizleme, yalnız ekrandaki fotoğraf ve yanıtı kaldırır; gönderilmiş analizin iptal edildiği söylenmez. Bekleyen işlem bitmeden ikinci analiz gönderilmez.
- HEIC/HEIF için JPEG dışa aktarma/ekran görüntüsü açıklaması vardır. Tarayıcı görsel çözümleme süresi 5 saniyeyle sınırlandırılmıştır.

## Açılış için kalanlar

1. Fotoğraf API'sinin çalıştığı **ana API projesinde** `AI_CAMERA_ENABLED=true`, görüntü kabul eden doğrulanmış bir `GEMINI_CAMERA_MODEL` ve mevcut `GEMINI_API_KEY` (veya `GOOGLE_GENERATIVE_AI_API_KEY`) olmalıdır. Genel `GEMINI_MODEL` bu özel model ayarının yerini almaz. Anahtarı istemciye veya test dosyasına koymayın.
2. Aynı projede geçerli `NEXT_PUBLIC_SUPABASE_URL` ve `SUPABASE_SERVICE_ROLE_KEY` veya `SUPABASE_SECRET_KEY` bulunmalıdır.
3. `supabase/migrations/20260926170000_travel_photo_quota.sql` hedef veritabanına uygulanmış olmalıdır. Yeni SQL gerekmez. RLS ve yalnız `service_role` çalıştırma yetkisi korunmalıdır.
4. Özellik ana API'ye dağıtılmalıdır. `VITE_TRAVEL_ASSISTANT_API_BASE_URL` yalnız halka açık seyahat verisini değiştirir; fotoğraf/hesap belirteci o adrese gönderilmez.

## Yayın öncesi doğrulama

- GET `/api/travel-assistant/photo`: kapalı bayrakta `available:false`; eksik kota/erişimde `available:false`; hazırlık tamamlanınca `available:true`. Başarılı GET modelin fotoğraf analizini garanti etmez; sağlayıcıya gerçek fotoğraf göndermeyen bir altyapı kontrolüdür.
- Gerçek test hesabında açık rıza ve kişisel veri içermeyen bir yapı fotoğrafıyla TR/EN denemesi; yanıtın belirsizliğini kontrol edin. Fotoğraf ve yanıt uygulama veritabanında tutulmamalıdır.
- Oturum yok/bitmiş; HEIC; büyük/bozuk resim; çevrimdışı→çevrimiçi; dil değişimi; analiz sürerken temizleme; kullanıcı değişimi; kota sınırı senaryoları gerçek iPhone/iPad'de sınanmalıdır.
- `node --test tests/travel-assistant/photo-readiness.mjs` hazırlık/kimlik/kota zaman aşımı ve doğrulama kontrollerini sınar. Mevcut `tests/travel-assistant/expansion.mjs` metadata temizliği ve gerçek SQL kota yetkileri/sınırlarını da sınar.

Kaynak: [Sharp işlem süresi sınırı](https://sharp.pixelplumbing.com/api-output/#timeout). Supabase iptal desteği kurulu `@supabase/postgrest-js` türleriyle doğrulanmıştır.
