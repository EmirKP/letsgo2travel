# Google Play yayın kontrol listesi

## Kodda tamamlananlar

- Paket kimliği: `tr.com.letsgo2travel.app`
- Sürüm: `1.3.0` / `versionCode 3`
- Android hedefi: API 36
- HTTP cleartext kapalı
- Uygulama yedeklemesi ve cihazlar arası veri aktarımı kapalı
- Uygulama içi ve web tabanlı hesap silme talebi yolu
- Release imzası için gizli değerleri repoya yazmayan ortam değişkenleri
- Kullanılmayan push eklentisi kaldırıldı
- 512×512 mağaza simgesi ve 1024×500 özellik grafiği

## Yayından önce kullanıcı tarafından tamamlanacaklar

1. `supabase_evening_web_android.sql` dosyasını Supabase SQL Editor'da bir kez çalıştır.
2. Vercel'de gerçek veri sorumlusu bilgilerini tanımla:
   - `NEXT_PUBLIC_DATA_CONTROLLER_NAME`
   - `NEXT_PUBLIC_DATA_CONTROLLER_ADDRESS`
   - `NEXT_PUBLIC_PRIVACY_EMAIL`
3. Android upload anahtarını oluştur ve güvenli bir yerde yedekle; `.jks` dosyasını GitHub'a yükleme.
4. İmzalı AAB üretip Play Console iç test kanalına yükle.
5. En az iki gerçek Android cihaz/ekran boyutunda giriş, rota, uçuş ve hesap silme akışlarını dene.
6. Gerçek cihazdan en az iki telefon ekran görüntüsü al. Gerçek kullanıcı kişisel verisi görünmemeli.
7. Data Safety taslağını canlı servislerle eşleştirip Play Console formunu doldur.
8. Gizlilik ve hesap silme URL'lerini Play Console'da kaydet.
9. Uygulama erişimi bölümünde inceleme için giriş gerekmediğini veya gerekiyorsa test hesabını belirt.
10. İç testten sonra pre-launch raporundaki çökme, erişilebilirlik ve 16 KB sayfa uyumluluğu uyarılarını kontrol et.

## Güncel politika kaynakları

- Hedef API: https://support.google.com/googleplay/android-developer/answer/11926878
- Hesap silme: https://support.google.com/googleplay/android-developer/answer/13327111
- Data Safety: https://support.google.com/googleplay/android-developer/answer/10787469
- 16 KB sayfa desteği: https://developer.android.com/guide/practices/page-sizes
