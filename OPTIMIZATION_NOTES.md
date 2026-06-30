# LetsGo2Travel Optimizasyon Notları

Bu sürüm performans, eksik asset ve deploy temizliği için düzenlendi.

## Yapılan ana düzeltmeler

- `.next`, `node_modules`, `.vercel` ve gerçek `.env` dosyaları temiz paket dışında bırakıldı.
- Tailwind sınıfları kullanıldığı için PostCSS üzerinde `@tailwindcss/postcss` aktif edildi.
- Google Font runtime import kaldırıldı; sistem font stack kullanıldı.
- Global sayfa geçişindeki `framer-motion` kaldırıldı, hafif CSS animasyonuna geçildi.
- Ana sayfadaki `ScrollReveal` bileşeni `framer-motion` yerine IntersectionObserver + CSS ile çalışacak hale getirildi.
- Header içindeki `TripDashboard` lazy/dynamic import edildi; ilk yük bundle’ı hafifletildi.
- Header auth kontrolü her sayfa değişiminde tekrar listener kurmayacak şekilde düzeltildi.
- Header’daki dış ses dosyası çağrısı kaldırıldı; Bilet Ara normal Next.js Link oldu.
- `DealCard` içinde `canvas-confetti` ilk yükten çıkarıldı, sadece tıklanınca dinamik import ediliyor.
- Kampanya kartlarında her kart için tekrar eden Supabase session kontrolü tek seferlik promise’e indirildi.
- Büyük PNG hero ve pasaport görselleri WebP’ye çevrildi.
- Kullanılmayan büyük görsel exportları temizlendi.
- Eksik `/destinations/...` görselleri yerel fallback görsellerle tamamlandı; 404 görsel istekleri azaltıldı.
- PWA manifest ikonları gerçek kare ikonlarla güncellendi.
- Statik asset cache header’ları eklendi.
- `prefers-reduced-motion` ve mobil jank azaltıcı CSS eklendi.

## Kontrol sonucu

- `tsc --noEmit` başarılı.
- Sandbox içinde `next build` çalıştırılamadı; verilen zip Windows ortamından geldiği için Linux SWC paketi (`@next/swc-linux-x64-*`) node_modules içinde yoktu ve internet erişimi kapalıydı. Temiz pakette `node_modules` bulunmadığı için Vercel deploy sırasında doğru Linux SWC paketini `npm install` ile kuracaktır.

## Deploy önerisi

```bash
npm install
npm run build
git add .
git commit -m "Optimize LetsGo2Travel performance and assets"
git push
```

Vercel ortam değişkenlerinde gerçek `.env` değerlerinin girili olduğundan emin olun.
## Next.js 16 Proxy Güncellemesi

- `middleware.ts` kaldırıldı.
- Next.js 16 uyarısını çözmek için dosya `proxy.ts` olarak değiştirildi.
- Export edilen fonksiyon `middleware` yerine `proxy` yapıldı.
- Admin rota koruma mantığı aynen korundu: `/admin/login` serbest, diğer `/admin/*` rotaları `admin_session=true` cookie kontrolüyle korunur.

