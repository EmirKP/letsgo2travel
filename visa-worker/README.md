# LetsGo2Travel Visa Worker

Bu klasör VDS üzerinde çalışacak görev tüketicisinin ilk güvenli iskeletidir.

- Site API'sinden kilitli görev alır.
- `demo` görevlerini ve iDATA'nın herkese açık giriş sayfasındaki erişim/doğrulama durumunu işler.
- Takvim, CAPTCHA, SMS veya kullanıcı oturumu gerektiren adımları uygun tarih varmış gibi raporlamaz.
- CAPTCHA, SMS, e-posta doğrulaması ve ödeme adımlarını atlamaz.

## Docker ile çalıştırma

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. `API_BASE_URL` ve `VISA_WORKER_SECRET` değerlerini doldurun.
3. Proje kökünde çalıştırın:

```bash
docker compose -f docker-compose.visa-worker.yml up -d --build
```

Demo eşleşmesi üretmek için geçici olarak `DEMO_MATCH_MODE=always` kullanılabilir.
