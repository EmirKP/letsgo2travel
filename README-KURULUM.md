# LetsGo2Travel Kontrast Fix V14D

Bu paket PowerShell gerektirmez.

## Kurulum

1. Zip içindeki iki dosyayı proje ana klasörüne at:
   - `apply-renk-kontrast-fix-v14d.js`
   - `RENK_FIX_CALISTIR.cmd`

2. `RENK_FIX_CALISTIR.cmd` dosyasına çift tıkla.

Bu işlem:
- `app/globals.css` sonuna sadece kontrast düzeltme bloğu ekler.
- `npm run build` çalıştırır.
- Türkçe commit atar.
- GitHub'a pushlar.

## Ne düzelir?

Ana sayfadaki hızlı aksiyon kartlarında beyaz zeminde beyaz kalan yazılar lacivert/griye çekilir.
Layout, hero, arama kartı, font veya menü yapısına dokunmaz.
