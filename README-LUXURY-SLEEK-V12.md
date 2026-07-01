# LetsGo2Travel Luxury Sleek Light v12

Seçilen konsept: **Sleek Light**.

Neden bu konsept seçildi?
- LetsGo2Travel sadece uçak bileti sitesi değil; rota seçimi, ülke rehberi, doğrulanmış gezgin ve lokasyon danışmanlığı akışı var.
- Bu yapı için Airbnb / modern teknoloji ürünü gibi ferah, açık ve premium hiyerarşi daha doğru.
- Premium Dark güzel görünür ama seyahat + rehber + form ağırlıklı sitede okunabilirliği ve güven hissini düşürebilir.

Uygulanan ana kararlar:
- Ana arka plan: `#F9FAFB`
- Kartlar: `#FFFFFF`
- Başlıklar: `#111827`
- Paragraf metinleri: `#334155`
- İkincil metin: `#6B7280`
- Ana CTA: `#6366F1`
- Güven / doğrulama / başarı destek rengi: `#10B981`
- Kartlarda 16px radius + çok hafif geniş shadow
- Video/reel alanlarında 12px radius + hover scale 1.02
- Font sistemi: başlıklar Plus Jakarta Sans, metinler Inter
- Hero alanı baştan yazıldı: daha ferah, daha lüks, daha az ucuz bilet sitesi hissi

Kurulumdan sonra önerilen commit mesajı:

```powershell
npm run build
git add -A
git commit -m "Luxury sleek light tasarım sistemi uygulandı"
git push origin main
```

Deploy düşmezse:

```powershell
npx vercel@latest --prod
```
