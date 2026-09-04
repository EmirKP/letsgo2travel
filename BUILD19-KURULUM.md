# LetsGo2Travel Build 19 kurulumu

Bu paket **Build 18 kurulu ve temiz** `main` dalının üzerine uygulanır. Yeni ortam değişkeni veya veritabanı migration'ı gerektirmez.

## Değişiklikler

- Etkinlik, kokpit, fiyat alarmı ve yönetici ekranlarındaki tarih/saat seçimleri ortak, sola hizalı mobil alana taşındı.
- Pasaport haritası vektör olarak netleştirildi; bayraklar büyütüldü, yakınlaştırma sınırı 8× yapıldı ve tam ekran harita eklendi.
- Yerel yardımcıdaki seçilmiş ülkeyi ikinci kez gösteren büyük kart kaldırıldı.
- Ana sayfa sıkılaştırıldı ve giriş yapan kullanıcının devam eden/yaklaşan seyahati öne çıkarıldı.
- iOS Canlı Etkinlik kalkış anında otomatik olarak **Uçuyoruz** evresine geçer; kalkış sayacı kapanır, sarı varış sayacı sağ tarafta görünür.

## Gerçek cihaz kontrolü

1. Uygulamayı tamamen kapatıp yeniden açın.
2. Etkinlik, kokpit ve fiyat alarmında tarih metninin alan içinde sola hizalı olduğunu kontrol edin.
3. Geçmiş gün seçiminin takvimde kapalı olduğunu ve gönderimde de reddedildiğini doğrulayın.
4. Pasaport haritasını iki parmakla yakınlaştırın, sürükleyin, tam ekran açın ve Kosova bayrağını kontrol edin.
5. Yerel yardımcı > Konuş bölümünde ülke adının büyük mavi kartta tekrar etmediğini kontrol edin.
6. Başlangıç ve varış zamanı birkaç dakika aralıklı bir test uçuşu ekleyip Canlı Etkinlikte `Kalkışa` → `Uçuyoruz / Varışa` → `Varış tamamlandı` geçişini uygulama kapalıyken doğrulayın.

## Geri dönüş

Build 19 commit'i uygulandıktan sonra sorun görülürse geri dönüş commit'i oluşturun:

```powershell
git revert HEAD
git push origin main
```

Bu işlem Build 18 koduna döner ve geçmişi silmez.
