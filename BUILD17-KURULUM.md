# LetsGo2Travel Build 17

## Bu sürümde

- Uygulamanın mevcut statik marka ekranı, dönen dünya üzerinde yürüyen gezgin videosuyla yenilendi.
- Kaynak video 10 saniyeden 3,77 saniyeye indirildi, sesi kaldırıldı ve yaklaşık 9,6 MB'tan 356 KB'a sıkıştırıldı.
- Tam ekran videonun üzerine LetsGo2Travel yazısı, kısa slogan, koyu geçiş ve altın ilerleme çizgisi eklendi.
- Video tamamlanırsa, yüklenemezse veya beklenenden uzun sürerse uygulama güvenli biçimde ana ekrana geçer.
- Cihazın “Hareketi Azalt” tercihi açıksa video yerine kısa statik marka ekranı gösterilir.
- Native iOS/Android açılış katmanı WebView hazırlanırken lacivert kalır; video React katmanı hazır olduğunda oynar.

## Yayın kurulumu

1. Build 17 değişiklik paketini mevcut Build 16 deposunun kökünde uygula.
2. Commit'i `main` dalına gönder.
3. Codemagic ile iOS Build 17'yi üretip TestFlight'a gönder.

Yeni bir API anahtarı, ortam değişkeni veya Supabase migration'ı gerektirmez.
