# LetsGo2Travel Build 21 kurulumu

Bu paket **Build 20 kurulu ve temiz** `main` dalının üzerine uygulanır. Yeni ortam değişkeni veya veritabanı migration'ı gerektirmez.

## Değişiklikler

- Topluluk soru detayındaki cevap alanı tam genişlikte, okunaklı ve dar iPhone ekranlarına uyumlu hâle getirildi.
- Cevap kutusuna açıklama, karakter sayacı, gönderim durumu ve belirgin odak görünümü eklendi.
- Soru detayı açılırken klavyenin kendiliğinden açılması ve ekranın doğrudan cevap kutusuna kayması engellendi.
- Mobil yönetim özetinde görünmeyen isteğe bağlı servislerin yanlış `modül okunamadı` uyarısı oluşturması kaldırıldı.
- Gerçek bir yönetim modülü yüklenemezse artık etkilenen bölümün adı ve **Tekrar dene** eylemi gösterilir.

## Gerçek cihaz kontrolü

1. Toplulukta cevapları olan bir soruyu açın; ekranın sorunun başından açıldığını doğrulayın.
2. Cevap alanına dokunun; kutunun tam genişlikte kaldığını, iOS'un sayfayı büyütmediğini ve butonun görünür olduğunu kontrol edin.
3. Üç karakterden kısa cevapta gönderimin kapalı, yeterli cevapta açık olduğunu doğrulayın.
4. Yönetim panelini açın; görünür veriler yüklendiyse yanlış `1 modül okunamadı` uyarısının çıkmadığını kontrol edin.
5. Gerçek bir istek hatasında etkilenen bölüm adının ve **Tekrar dene** düğmesinin göründüğünü doğrulayın.

## Geri dönüş

Build 21 commit'i uygulandıktan sonra sorun görülürse geri dönüş commit'i oluşturun:

```powershell
git revert HEAD
git push origin main
```

Bu işlem Build 20 koduna döner ve geçmişi silmez.
