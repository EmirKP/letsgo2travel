# Letsgo2Travel Optimizasyon Notları

Bu paket beta/yayın öncesi teknik kalite, hız, SEO ve güvenlik için güncellendi.

## Yapılan ana işler

- Next.js 16 için `middleware.ts` kaldırıldı, `proxy.ts` kullanıldı.
- Statik/yarı-statik API yanıtlarına CDN cache header'ları eklendi.
- AI Rota Planlayıcı için Supabase destekli `ai_plan_cache` mimarisi eklendi.
- AI istek girdileri normalize edildi, aynı isteklerde tekrar LLM maliyeti azaltıldı.
- Ülke rehberi, blog ve uçak bileti detay sayfalarına JSON-LD Schema eklendi.
- `next.config.ts` içine temel güvenlik header'ları eklendi.
- Renk/design token sistemi koyu lacivert + sarı/turuncu CTA + yeşil vize rozeti mantığıyla güçlendirildi.
- `.gitattributes` eklendi; Windows LF/CRLF uyarıları azalır.
- Supabase için AI cache, moderasyon log ve affiliate click tabloları ayrı SQL dosyası olarak eklendi.

## Supabase tarafında çalıştırılacak ek SQL

`supabase_ai_cache_moderation_affiliate.sql`

Bu dosya şunları oluşturur:

- `ai_plan_cache`
- `moderation_logs`
- `affiliate_clicks`

Bu tablolar RLS açık ve client erişimine kapalıdır. Uygulama bunları server/service role üzerinden kullanmalıdır.

## Deploy öncesi

```bash
npm install
npm run build
git add -A
git commit -m "Apply SEO performance and security improvements"
git push origin main
```

## Öncelikli canlı kontrol

- Ana sayfa mobil akıcılık
- Uçak bileti arama kartı
- `/akilli-plan`
- `/ulke-rehberi/azerbaycan`
- `/blog/ucuz-ucak-bileti-bulma-taktikleri`
- `/admin/login`
