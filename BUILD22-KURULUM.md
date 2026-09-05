# LetsGo2Travel Build 22 kurulumu

Bu paket **Build 21 kurulu ve temiz** `main` dalının üzerine uygulanır. Ortak seyahat özelliği yeni bir Supabase migration'ı gerektirir.

## Eklenenler

- Seyahat sahibinin yedi gün geçerli güvenli davet kodu ve bağlantısı oluşturması.
- Davet edilen kişinin aynı seyahate düzenleyici veya izleyici olarak katılması.
- Katılımcı yetkisini değiştirme, katılımcıyı çıkarma ve ortak seyahatten ayrılma.
- Rota, konaklama, ulaşım ve aktivite önerileri ile kişi başına tek oy.
- Ortak hedef bütçe, ödeme yapan kişi, masrafa katılan kişiler ve eşit paylaşım.
- Her katılımcının toplam alacak/borç dengesinin otomatik hesaplanması.
- Davet bağlantısının iOS/Android uygulamasında doğrudan Seyahat Kokpiti'ni açması.

## Zorunlu Supabase adımı

Patch uygulandıktan sonra, proje kökünde linked Supabase projesine migration'ı gönderin:

```powershell
cd C:\Projects\letsgo2travel
npx supabase db push
```

Komut onay isterse `Y` yazın. `Finished supabase db push` görülmeden ortak seyahat tabloları canlıda hazır değildir.

## Gerçek cihaz kontrolü

1. Bir seyahat ekleyin ve **Ortak seyahat** kartından açın.
2. **Davet et** ile kod oluşturup başka bir kullanıcı hesabında kabul edin.
3. Seyahat sahibinin katılımcı rolünü değiştirebildiğini doğrulayın.
4. İki kullanıcıyla aynı öneriye oy verin; oy sayısının her cihazda güncellendiğini kontrol edin.
5. Hedef bütçe ve bir masraf ekleyin; ödeme yapan kişi ile alacak/borç tutarlarını doğrulayın.

## Geri dönüş

Kod için geri dönüş commit'i oluşturabilirsiniz:

```powershell
git revert HEAD
git push origin main
```

Migration verileri korunur; tabloları silmek veri kaybına yol açacağı için otomatik geri dönüşte kaldırılmaz.
