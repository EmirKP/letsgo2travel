# Google Play yayın kontrol listesi

## Kodda tamamlananlar

- Paket kimliği: `tr.com.letsgo2travel.app`
- Kaynak sürümü: `1.4.0` / `versionCode 27`; imzalı yayın iş akışı Play'de kullanılmamış açık bir `L2T_ANDROID_VERSION_CODE` ister.
- Android hedefi: API 36
- HTTP cleartext kapalı
- Uygulama yedeklemesi ve cihazlar arası veri aktarımı kapalı
- Uygulama içi ve web tabanlı hesap silme talebi yolu
- Release imzası için gizli değerleri repoya yazmayan ortam değişkenleri
- Push eklentisi hesap/cihaz sahipliği korunarak yapılandırıldı; release derlemesi `google-services.json` olmadan güvenli biçimde durur
- 512×512 mağaza simgesi ve 1024×500 özellik grafiği

## Test paketi ve ortak hesap

- `letsgo2travel-android-check`, iOS ile aynı `letsgo2travel_public` ayar grubunu ve aynı mobil kaynakları kullanarak test APK'sı üretir. Google Play hesabı gerekmez.
- `npm run mobile:prepare:android` yalnız Android'in üretilmiş web klasörünü yeniler. İncelemedeki iOS paketi değiştirilmez.
- Android, iOS ve web aynı Supabase hesabı/veritabanı ve ana API ile çalışmalıdır; Android için ikinci kullanıcı veritabanı oluşturulmaz.
- Test APK'sı debug imzalıdır; mağaza sürümü değildir. Firebase ayarı olmadan uzaktan push testi yapılamaz.

## Mağaza yayını için gerekenler

1. Canlı migration durumunu sürüm kayıtlarıyla karşılaştır. Daha önce elle uygulanmış migration'ları topluca yeniden göndermeden yalnız doğrulanmış eksikleri uygula.
2. Vercel'de gerçek veri sorumlusu bilgilerini tanımla:
   - `NEXT_PUBLIC_DATA_CONTROLLER_NAME`
   - `NEXT_PUBLIC_DATA_CONTROLLER_ADDRESS`
   - `NEXT_PUBLIC_PRIVACY_EMAIL`
3. Android upload anahtarını oluştur ve güvenli bir yerde yedekle; `.jks` dosyasını GitHub'a yükleme.
4. Firebase'de `tr.com.letsgo2travel.app` Android istemcisini kaydet. `google-services.json` dosyasını Git'e ekleme. Sunucunun FCM gönderen hesabı aynı projeyi kullanmalı.
5. En az iki gerçek Android cihaz/ekran boyutunda giriş, rota, uçuş ve hesap silme akışlarını dene.
6. Gerçek cihazdan en az iki telefon ekran görüntüsü al. Gerçek kullanıcı kişisel verisi görünmemeli.
7. Data Safety taslağını canlı servislerle eşleştirip Play Console formunu doldur.
8. Gizlilik ve hesap silme URL'lerini Play Console'da kaydet.
9. Uygulama erişimi bölümünde inceleme için giriş gerekmediğini veya gerekiyorsa test hesabını belirt.
10. İç testten sonra pre-launch raporundaki çökme, erişilebilirlik ve 16 KB sayfa uyumluluğu uyarılarını kontrol et.

## Codemagic imzalı paket hazırlığı

`letsgo2travel-android-release` yalnız APK/AAB dosyaları üretir; otomatik Play yayını yapmaz. Codemagic'e `letsgo2travel_android_upload` adıyla upload key eklenmeli. `letsgo2travel_android_release` grubunda şunlar bulunmalı:

- `L2T_GOOGLE_SERVICES_JSON_BASE64`: Firebase Android **istemci** dosyasının Base64 içeriği; gizli değişken olarak saklanır. Sunucu service-account dosyası kullanılmaz.
- `L2T_FIREBASE_PROJECT_ID`: sunucunun FCM projesiyle doğrulanmış proje kimliği.
- `L2T_ANDROID_VERSION_CODE`: Play'de kullanılmamış, kaynak numarasından küçük olmayan pozitif tam sayı.

Imza değişkenlerini Codemagic'in keystore entegrasyonu sağlar. iOS ve Android için uygulama sürümü aynı tutulabilir; Apple build numarası ve Play versionCode bağımsızdır. Bu belgede hesap, Firebase veya imza anahtarının hazır olduğu iddia edilmez.

## Güncel politika kaynakları

- Hedef API: https://support.google.com/googleplay/android-developer/answer/11926878
- Hesap silme: https://support.google.com/googleplay/android-developer/answer/13327111
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- 16 KB sayfa desteği: https://developer.android.com/guide/practices/page-sizes
