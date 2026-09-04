# LetsGo2Travel Build 18 kurulum ve kontrol notları

Build 18, Build 17 üzerine uygulanır. Bu sürüm için yeni Supabase migration'ı veya yeni ortam değişkeni gerekmez. Etkinlik sağlayıcıları için daha önce kullanılan `TICKETMASTER_API_KEY` ve `PREDICTHQ_ACCESS_TOKEN` ayarları aynı şekilde korunur; ülke listesi, pasaport haritası, bayraklar ve çevrimdışı acil ifade kartları cihaz paketinin içindedir.

## Kaynak doğrulama

```powershell
npm ci
npm --prefix mobile ci
npm run lint
npm run test:app
npm run test:alerts
npm run build
npm run mobile:prepare:all
```

`mobile:prepare:all` komutu mobil web paketini üretir, iOS ve Android klasörlerine eşitler ve mobil doktor kontrollerini çalıştırır.

## Gerçek cihaz kontrol listesi

1. Açılış videosunun Dynamic Island ve durum çubuğu arkasında kesintisiz mavi zeminle açıldığını kontrol et.
2. Ana ekran, Keşfet, Planla, Seyahatlerim ve Profil ekranlarında beyaz-siyah-mavi-sarı renk sistemini kontrol et.
3. Etkinlik ve Yerel Yardımcı ülke seçicilerinde arama yap; Kosova'nın gerçek bayrağını doğrula.
4. Yerel Yardımcı'da desteklenen ülkelerin yerel ifade paketini, diğer ülkelerin açıkça etiketlenen İngilizce acil kartını çevrimdışı aç.
5. Pasaport haritasında iki parmakla yalnız haritayı yakınlaştır, tek parmakla sürükle ve sıfırlama düğmesini dene. Sayfanın kendisi büyümemeli.
6. Etkinlik, kokpit, fiyat alarmı ve vize randevusu alanlarında geçmiş tarih seçmeyi dene. Bitiş/varış başlangıçtan önce olmamalı.
7. Bangkok, Tiran ve Tokyo önerilerinin kendine ait görsellerini kontrol et.
8. Yönetici ekranında belgeyi uygulama içinde aç; belge yüklenmeden ve “İnceledim” seçilmeden Onayla/Reddet düğmeleri etkinleşmemeli.
9. Küçük ekranlı bir iPhone'da yatay taşma, alt menü çakışması, kesilmiş yazı ve kalıcı mavi seçim lekesi olmadığını kontrol et.

## Geri dönüş

Build 17'nin renkleri ve davranışı Git geçmişinde aynen korunur. Build 18 yayına alındıktan sonra geri dönmek gerekirse önce Build 18 commit kimliğini doğrula, ardından yeni bir geri alma commit'i üret:

```powershell
git log --oneline -5
git revert <BUILD18_COMMIT_KIMLIGI>
git push origin main
```

`git reset --hard` kullanma; `git revert` yayın geçmişini korur.
