# Letsgo2Travel yeni detay ve AI güncellemesi

Bu sürümde mevcut ekran görüntüsündeki lacivert/açık gökyüzü/beyaz kart/mavi buton paletine dokunulmadı. Sadece site daha dolu, daha premium ve daha dönüşüm odaklı hale getirildi.

## Eklenenler

- Ana sayfaya büyük AI Trip Builder bölümü eklendi.
- `/api/ai-trip-planner` route'u eklendi.
- OpenAI API anahtarı varsa gerçek AI plan üretir; yoksa akıllı fallback çalışır.
- Mevcut `/api/arama` geliştirildi ve AI rota önizleme kartları eklendi.
- `AISearchBox` daha detaylı cevap, skor, tag ve ipucu gösterecek hale getirildi.
- Ana sayfaya akıllı senaryolar, rota zekası matrisi, seyahat kontrol listesi ve site akışı bölümleri eklendi.
- Affiliate yönlendirmeleri AI plan sonucunda uçuş/otel/eSIM/tur olarak tek akışta bağlandı.
- Tasarım responsive şekilde düzenlendi.

## AI ayarı

`.env.local` içine isteğe bağlı şunları ekleyebilirsin:

```env
OPENAI_API_KEY=senin_openai_api_keyin
OPENAI_MODEL=gpt-4o-mini
```

Anahtar eklenmezse site bozulmaz; kendi akıllı fallback sistemi ile rota planı üretir.

## Kontrol

- `npm run lint` geçti.
- `npm run build` geçti.

## Kurulum

```bash
npm install
cp .env.local.example .env.local
npm run dev
```
