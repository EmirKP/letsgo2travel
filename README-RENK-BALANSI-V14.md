# LetsGo2Travel Renk Balansı V14

Bu paket layout, hero yerleşimi, font, component veya arama formuna dokunmaz.
Sadece `app/globals.css` sonuna güvenli bir override bloğu ekler.

## Ne değişir?

- Neon `#FFDF00` sarı yerine daha sakin `#E9B949` gold tonu kullanılır.
- Ana CTA butonları sarıdan güven veren maviye (`#2563EB`) çekilir.
- Logo ve küçük vurgu alanlarında gold kalır.
- Header koyu lacivert kalır.
- Kartlar beyaz + soft shadow dengesiyle kalır.
- Rota fiyatları ve başlık vurgusu artık göz yakmaz.

## Kurulum

PowerShell'de proje ana klasöründe:

```powershell
cd "C:\Users\emirk\OneDrive\Masaüstü\letsgo2travel-final-optimized"
.\apply-renk-balansi-v14.ps1
npm run build
git add -A
git commit -m "Renk balansı ve sarı vurgu tonu düzeltildi"
git push origin main
```

Deploy düşmezse:

```powershell
npx vercel@latest --prod
```
