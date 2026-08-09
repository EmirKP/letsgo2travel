# LetsGo2Travel Uçuş Meta-Arama — Faz 1 Uygulama Promptu

## Rol ve değişmez kurallar

Mevcut LetsGo2Travel deposunda çalışan kıdemli bir full-stack/altyapı mühendisi gibi ilerle. Next.js 16 App Router, React 19, TypeScript, Supabase, Capacitor, CSS Modules ve mevcut Docker/VDS yaklaşımını koru. Tailwind ekleme, projeyi yeniden kurma, mevcut kullanıcı sistemini çoğaltma.

Skyscanner, Google Flights, Kayak, Momondo, Kiwi, Aviasales veya başka bir meta-arama motorunun sonuçlarını uçuş verisi olarak kullanma. CAPTCHA/anti-bot aşma, gizli endpoint, özel mobil API, izinsiz scraping, proxy rotasyonu veya tersine mühendislik yapma.

Resmî sözleşme, API dokümanı, sandbox ve credential bulunmayan bir kaynak için canlı connector yazma. Böyle bir kaynak production'da kapalı olmalı ve açıkça `integration_required` dönmelidir. Fixture yalnız test ortamında kullanılabilir. Sahte fiyat ve uçuş production'a giremez.

## Bu teslimin gerçek kapsamı: Faz 1 temel

Şunları uygula:

1. Sıkı doğrulanan ortak uçuş arama isteği ve veri modeli.
2. Bağımsız connector interface'i; Enuygun, Ucuzabilet ve doğrudan havayolu için dürüst `integration_required` connector'ları.
3. Kaynak izolasyonlu orchestrator, timeout ve kısmi başarısızlık modeli.
4. Kaynak teklifini normalize etme, temizleme ve güvenli checkout host doğrulaması.
5. Aynı uçuşu pazarlayan/işleten taşıyıcı, uçuş numarası, rota, UTC saatleri, segmentler ve kabinle eşleştirme.
6. Zorunlu ücret, yolcu toplamı, istenen bagaj ve koşullu fiyat uygunluğunu hesaba katan fiyat motoru.
7. Sponsor gelirinden etkilenmeyen “En Ucuz”, “En Hızlı” ve açıklanabilir “En Avantajlı” sıralaması.
8. Supabase üzerinde arama, bacak, job, itinerary, segment, offer, revalidation, redirect, health, heartbeat, rate-limit ve audit tabloları.
9. `FOR UPDATE SKIP LOCKED`, lease token, sınırlı retry ve report idempotency kullanan queue temeli.
10. Service-role taşımayan, ayrı worker secret ile internal API'ye bağlanan VDS worker.
11. Web ve mobil arama akışı; kaynaklar bağlı değilse “Entegrasyon bekleniyor” ve sıfır teklif.
12. Offer ID ile çalışan, URL'yi server'da çözen ve kodda sabit HTTPS host allowlist'i kullanan yönlendirme.
13. Admin kaynak görünümü; resmî izin + credential + hazır kod connector'ı olmadan etkinleştirme engeli.
14. Fixture tabanlı birim testleri ve kurulum/teslim raporu.

## Canlı connector kabul kapısı

Bir kaynağı `active` yapmadan önce aşağıdakilerin tamamı teslim edilmiş olmalı:

- Resmî kullanım/dağıtım izni veya imzalı partnerlik kaydı.
- Kaynağın resmî API/feed/NDC dokümanı ve sürümü.
- Sandbox veya onaylı test ortamı.
- Server/VDS secret store'a eklenmiş credential; istemciye hiçbir secret gitmemesi.
- Arama, normalizasyon, revalidation ve deep-link testleri.
- Kota, timeout, retry, cache ve circuit-breaker değerleri.
- Checkout alan adlarının kod allowlist'i.
- Format değişikliği ve hata gözlemi.

Bu kapı geçilmediyse connector kodunu hazır tut fakat kaynağı etkinleştirme.

## Güvenlik ve veri kuralları

- Para değerlerini veritabanında integer minor unit ve ISO para birimiyle sakla.
- UTC instants için `timestamptz`; kaynağın yerel saatini ayrıca sakla.
- Arama API'sinde küçük body, kesin alan allowlist'i, gerçek tarih/IATA/yolcu doğrulaması ve ortak atomik rate limit kullan.
- Anonim aramaya yüksek entropili opaque token ver; yalnız hash'ini sakla. Token query string'e girmez.
- Kullanıcı sahipliğinde RLS ve server tarafı owner kontrolü uygula.
- Worker secret ve admin mutation'ları fail-closed olsun.
- Redirect endpoint'i istemciden URL veya fiyat kabul etmesin.
- Kaynak metni/HTML'i güvenmeden render etme; provider payload'ını veya secret'ı loglama.
- Affiliate komisyonu organik sıralamaya katılmasın; sponsorlu içerik ayrıca etiketlensin.

## Test ve doğrulama

En az şu testleri fixture ile kapsa: strict request, tek yön/gidiş-dönüş, yolcu kuralları, farklı satıcıda aynı uçuş, codeshare ayrımı, farklı uçuş numarası/saat, bagaj ücreti bilinmiyor, zorunlu ücret eksik, koşullu fiyat uygun/uygun değil, farklı para birimi, sponsorlu teklif, connector no-result/hata/timeout, çelişkili/malformed sonuç, bütün kaynaklar erişim bekliyor ve checkout host saldırısı.

Gerçek kaynaklara CI isteği gönderme. Başarılı olmadığı doğrulamayı başarılı diye raporlama. Eksik root config, Supabase/VDS erişimi veya partner credential varsa açıkça blokaj olarak yaz.

## Teslim biçimi

Yalnız değiştirilen ve yeni dosyaları orijinal klasör yapısıyla tek ZIP'e koy. `node_modules`, `.next`, `dist`, cache, log, `.env`, secret, credential ve değişmemiş dosya ekleme.

Teslim raporu; mimariyi, gerçekten bağlı kaynakları, erişim bekleyen kaynakları, migration/worker/güvenlik değişikliklerini, test sonuçlarını, build durumunu, VDS/Supabase komutlarını, partner başvurularını, tamamlanamayan noktaları ve bilinen riskleri ayrı ayrı belirtmelidir.

