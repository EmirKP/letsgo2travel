# LetsGo2Travel Visa Worker

Bu klasör VDS üzerinde çalışacak görev tüketicisinin ilk güvenli iskeletidir.

- Site API'sinden kilitli görev alır.
- Şimdilik yalnızca `demo` sağlayıcısını işler.
- Gerçek sağlayıcı adaptörleri doğrulandıktan sonra ayrı modüller olarak eklenecektir.
- CAPTCHA, SMS, e-posta doğrulaması ve ödeme adımlarını atlamaz.

## Docker ile çalıştırma

1. `.env.example` dosyasını `.env` olarak kopyalayın.
2. `API_BASE_URL` ve `VISA_WORKER_SECRET` değerlerini doldurun.
3. Proje kökünde çalıştırın:

```bash
docker compose -f docker-compose.visa-worker.yml up -d --build
```

Demo eşleşmesi üretmek için geçici olarak `DEMO_MATCH_MODE=always` kullanılabilir.
