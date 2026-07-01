# LetsGo2Travel — Atlas Premium Tasarım Sistemi V13

Bu paket son denemelerde bozulan renk/font karmaşasını toparlamak için hazırlandı.

## Tasarım kararı

- Sarı, turuncu, indigo ve full beyaz denemeleri bırakıldı.
- Ana sistem: lacivert omurga + açık gökyüzü zemin + beyaz kartlar + mavi CTA.
- Font: Inter. Playfair/Montserrat/Plus Jakarta gibi karakterli fontlar kullanılmadı.
- Hero alanı baştan sadeleştirildi.
- Sağdaki iç içe uçuş kartları tek premium rota kartına indirildi.
- Header koyu lacivert yapıldı, logo görünürlüğü düzeltildi.
- Daha Fazla menüsünde kapanma gecikmesi eklendi.
- Kartlar yumuşak gölge ve 16px radius ile sakinleştirildi.

## Renk sistemi

```css
--l2t-bg: #F6F8FB;
--l2t-card: #FFFFFF;
--l2t-navy: #0B1220;
--l2t-heading: #111827;
--l2t-text: #334155;
--l2t-muted: #64748B;
--l2t-primary: #2563EB;
--l2t-primary-hover: #1D4ED8;
--l2t-sunset: #F97316;
--l2t-success: #10B981;
```

## Kurulum

Paket içeriğini proje ana klasörüne kopyalayın ve üzerine yazın.

```powershell
cd "C:\Users\emirk\OneDrive\Masaüstü\letsgo2travel-final-optimized"

npm run build
git add -A
git commit -m "Atlas premium tasarım sistemi uygulandı"
git push origin main
```

Deploy otomatik düşmezse:

```powershell
npx vercel@latest --prod
```

## Kontrol edilecek sayfalar

- /
- /ucak-bileti-ara
- /vizesiz-ulkeler
- /ulke-rehberi
- /akilli-plan
