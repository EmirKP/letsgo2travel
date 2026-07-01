# LetsGo2Travel - Renk Sistemi ve Ana Sayfa Dönüşüm Paketi

Bu paket LetsGo2Travel'ın kurumsal renk dilini sabitler ve ana sayfaya daha net bir dönüşüm akışı ekler.

## Yapılanlar

- Kurumsal renk değişkenleri `app/globals.css` içinde yeniden sabitlendi.
- Ana kimlik: gece laciverti + LetsGo sarısı/gold.
- Fazla mavi CTA kullanımı ana alanlarda gold/naviye çekildi.
- Header, footer, ana butonlar, arama kartı, aktif tablar ve önemli kartlar aynı renk diline alındı.
- Ana sayfaya hızlı aksiyon/dönüşüm paneli eklendi:
  - Ucuz uçak bileti ara
  - Fiyat alarmı kur
  - Vizesiz / kimlikle ülkeler
  - Ülke rehberleri
  - Forum
  - Kaşifler Ligi
- Belgeli Gezgin bandı boğucu siyah yerine gece laciverti banda çekildi.
- Vercel Hobby plan hatası için `vercel.json` cron günlük yedek kontrole alındı: `0 8 * * *`.

## Commit önerisi

```powershell
git commit -m "Renk sistemi ve ana sayfa dönüşüm akışı güçlendirildi"
```

## Not

6 saatlik fiyat alarmı kontrolü Vercel Cron ile değil, dış cron servisiyle çalışmaya devam eder. Vercel tarafındaki cron sadece günlük yedek kontroldür.
