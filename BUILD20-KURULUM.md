# LetsGo2Travel Build 20 kurulumu

Bu paket **Build 19 kurulu ve temiz** `main` dalının üzerine uygulanır. Yeni ortam değişkeni veya veritabanı migration'ı gerektirmez.

## Değişiklikler

- Ana sayfaya öne çıkan **Gezginlere sor** alanı, ülke kısayolları ve son topluluk soruları eklendi.
- Topluluk soruları ülkeye göre filtrelenebilir hâle getirildi; Kosova bayrağı yerel gerçek görseli kullanır.
- Eksik doğrulama belgesi yönetici ekranında açıkça işaretlenir, onay işlemi engellenir ve gerekçeli red açık kalır.
- Geçerli doğrulama belgesi uygulama içinde açılıp incelenmeden onay veya red işlemi yapılamaz.
- Yönetici ülke adları uygulama dilinde gösterilir ve sekmeler küçük ekranda içeriğin üzerinde asılı kalmaz.
- Etkinlik kartlarından, tarihi örtüşen mevcut bir seyahate etkinlik eklenebilir; eklenen etkinlik Kokpit içindeki seyahat takviminde görünür ve kaldırılabilir.
- iOS Canlı Etkinlikte kalkış, uçuş durumu ve varış alanları dengelendi; sarı varış sayacı sağ tarafa alındı ve tekrarlanan alt sayaç kaldırıldı.

## Gerçek cihaz kontrolü

1. Ana sayfada **Gezginlere sor** kartını açın; ülke kısayolu ve son soru bağlantılarını deneyin.
2. Misafir olarak soruları okuyabildiğinizi, soru sormak veya cevaplamak için giriş istendiğini doğrulayın.
3. Etkinlik Radarı'ndan, tarihi bir seyahatin içinde kalan etkinliği **Seyahate ekle** ile ekleyin; ardından Kokpit'teki seyahat takviminden açıp kaldırın.
4. Tarihi seyahat dışında kalan etkinlikte ilgili seyahatin seçilemediğini kontrol edin.
5. Yönetici panelinde belgesi bulunmayan başvurunun onaylanamadığını ve gerekçe girilerek reddedilebildiğini doğrulayın.
6. Geçerli bir belgeyi uygulama içinde açın; belge yüklenmeden karar düğmelerinin etkinleşmediğini kontrol edin.
7. Kalkış ve varışı birkaç dakika aralıklı test uçuşunda Canlı Etkinliğin `Kalkış` → `Uçuyoruz / Varışa` → `Varış tamamlandı` geçişini deneyin.
8. iPhone SE boyutunda Topluluk, Yönetici ve Etkinlik ekranlarında yatay taşma olmadığını kontrol edin.

## Geri dönüş

Build 20 commit'i uygulandıktan sonra sorun görülürse geri dönüş commit'i oluşturun:

```powershell
git revert HEAD
git push origin main
```

Bu işlem Build 19 koduna döner ve geçmişi silmez.
