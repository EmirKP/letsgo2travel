# LetsGo2Travel Uçuş Meta-Arama — Faz 2 Teslim Raporu

Tarih: 09.08.2026

## Sonuç

Faz 1'deki güvenli arama/iş kuyruğu omurgası korunarak ilk gerçek sağlayıcı uçtan uca bağlandı. Enuygun/Wingie'nin resmî public MCP `flight_search` ve `flight_allocate` araçları kullanılıyor; scraping, uydurma fiyat veya LetsGo2Travel içinde ödeme yok. Sağlayıcının ham bağlantısı sonuçlara eklenmiyor; yalnız yeniden doğrulama sonrası allowlist'ten geçen satış bağlantısı yönlendirme çağrısına veriliyor.

Canlı kontrat probunda 20.08.2026 IST–AYT araması başarıyla 7 kaynak teklifi döndürdü. İlk kaynak toplamı prob anında 1.970 TRY idi; bu tutar yalnız bağlantı testinin anlık sonucudur ve uygulamada sabitlenmemiştir. Public şema zorunlu ücret kapsamını alan düzeyinde taahhüt etmediği için bu toplam `partial / karşılaştırma dışı` tutulur; sözleşmesel kanıt gelene kadar “en ucuz” sıralamasına girmez.

## Uygulanan ana değişiklikler

### Canlı kaynak ve backend

- Resmî Enuygun MCP connector'ı, bounded-response JSON-RPC istemcisi, MCP initialize/initialized yaşam döngüsü, SSE request-id eşlemesi ve fail-closed hata eşlemesi eklendi.
- Tek yön ve gidiş-dönüş fiyatları parti toplamı olarak normalize edildi; gidiş-dönüş kombinasyonlarında iki yönün fiyatı toplanıyor.
- Kaynak para birimi/capability filtresi, yakın havalimanı eşlemesi, sponsorlu teklifleri organik sıralamadan çıkarma ve dönüş-zamanı doğrulaması eklendi.
- Kaynak TTL'si, `verifiedAt` ve `expiresAt` birlikte kullanılarak eski tekliflerin ingest/sıralama/yönlendirmesi engellendi.
- Click-time yeniden arama ile `confirmed`, `price_changed` ve `unavailable` durumları eklendi. Tutar aynı kalsa bile bagaj/tarife paketi materyal olarak değişirse ikinci onay isteniyor. Kullanıcının onayı teklif kimliği, tutar, para birimi ve doğrulama zamanına bağlandı; redirect aynı sürümü sunucuda tekrar doğruluyor.
- Teklif CAS güncellemesi, materyal-değişiklik durumu ve audit kaydı tek transactional RPC içinde commit ediliyor.
- Deep link, yeniden aramayla aynı MCP oturumunda ve yalnız sunucuda `flight_allocate` ile oluşturuluyor; HTTPS, port, credential, tam host, tam path ve izinli query anahtar/değer allowlist kontrolü uygulanıyor.
- Aktör, teklif-sürümü ve sağlayıcı geneli için dağıtık kotalar eklendi; uzun revalidation süresinde aynı teklif paralel çalıştırılmıyor ve eski kota bucket'ları temizleniyor.
- Enuygun için `public_documented` izin modeli ve worker claim RPC güncellemesi eklendi. Canlı-provider migration'ı, mevcut Enuygun satırını secret içermeyen bir snapshot ile yedekliyor; rollback admin kill-switch kararlarını ezmeden önceki metadata'yı geri yüklüyor. Diğer satıcılar partner erişimi beklerken kapalı kalıyor.

### Web

- Arama sayfası başlık/canonical/wrapper kazandı; eski `/flights` rotası sorguyu koruyarak canonical rotaya yönleniyor.
- Bilinmeyen rota değerlerinin sessizce Dubai'ye düşmesi kaldırıldı. Yerel havalimanı/metro verisi kullanılıyor.
- Teklifler satıcı bazında gruplanıyor; gerçek benzersiz satıcı sayısı, fiyat doğrulama zamanı ve tazelik durumu gösteriliyor.
- Fiyat veya bagaj/tarife koşulu değişikliğinde açık uyarı ve ikinci tıklama şartı eklendi; yönlendirme aynı sekmede.
- Gidiş/dönüş, terminal, operating carrier, uçak, aktarma/overnight/self-transfer ve fiyat koşulları görünür hale getirildi.
- Filtre sıfır sonucu, focus, `aria-live`, combobox klavyesi ve expand semantiği düzeltildi.
- Travelpayouts havalimanı autocomplete bağımlılığı kaldırıldı.

### Mobil

- Yetişkin/çocuk/bebek, dört kabin, bagaj, para birimi, direkt ve yakın havalimanı seçenekleri API sözleşmesine bağlandı.
- Aynı güzergâh altında satıcı teklifleri, benzersiz satıcı sayısı ve `En iyi / En ucuz / En hızlı / Kalkış` sıralamaları eklendi.
- Polling 120 saniyeyle sınırlandı; manuel yenileme ve yerel tazelik sayacı eklendi.
- Eski fiyat CTA'sı güvenli yeniden doğrulama başlatıyor; fiyat veya materyal bilet koşulu değişikliğinde sürüme bağlı ikinci onay gerekiyor.
- Native dış URL açma başarısızsa ana WebView'ın checkout sayfasına dönüşmesi engellendi.
- Güncel bundle iOS ve Android projelerine senkronize edildi; eski hash'li varlıklar çıkarıldı.

## Güvenlik ve doğruluk

- Arama sahipliği kullanıcı oturumu veya opaque capability token ile kontrol edilir.
- Worker secret ve lease token hash'i server-only kalır.
- Provider checkout URL'si sonuç API'sine çıkmaz.
- Kaynak aktiflik/izin/kill-switch durumu hem aramada hem yönlendirme anında tekrar kontrol edilir.
- Sponsorlu, koşullu, farklı para birimli, eksik zorunlu ücretli veya istenen bagaj bedeli bilinmeyen teklif organik fiyat sıralamasına giremez.
- Public MCP'nin zorunlu ücret kapsamı kanıtlanmadığı için Enuygun kaynak toplamı görünür kalır fakat karşılaştırılabilir toplam sayılmaz.
- Arama/redirect sonuçları private no-store olarak döner.
- İç uçuş URL yardımcıları bilinmeyen üç harfli ülke değerini havalimanı sanmaz ve varsayılan destinasyon üretmez.

## Doğrulama sonucu

| Kontrol | Sonuç |
| --- | --- |
| Uçuş core/API sözleşme testleri | 39/39 PASS |
| Worker connector testleri | 11/11 PASS |
| Tam TypeScript kontrolü | PASS |
| ESLint (`--max-warnings=0`) | PASS |
| Next.js 16 üretim derlemesi | PASS — 137 statik sayfa üretildi |
| Mobil ESLint + TypeScript/Vite build | PASS |
| iOS Capacitor sync + doctor | Kritik hata yok; yalnız ortamda Supabase public değerleri eksik uyarısı |
| Android Capacitor sync + doctor | Kritik hata yok; yalnız ortamda Supabase public değerleri eksik uyarısı |
| Canlı Enuygun MCP arama + aynı-oturum allocate probu | PASS — 7 teklif, exact host/path |

## Canlıya almadan önce zorunlu kullanıcı adımları

1. İki Supabase migration'ını staging ve ardından production üzerinde uygulayın.
2. Web ve worker için aynı güçlü `FLIGHT_WORKER_SECRET`, ayrıca bağımsız `FLIGHT_RATE_LIMIT_SECRET` tanımlayın.
3. Worker container'ını yayınlayın ve admin ekranında heartbeat'i doğrulayın.
4. Production domaininden arama → fiyat değişikliği → allocate → satıcı yönlendirmesi senaryolarını gerçek cihazda kabul testinden geçirin.
5. MCP kullanım koşulları, affiliate/komisyon ilişkisi ve tüketici bilgilendirme metnini hukuk/iş birimiyle onaylayın.

## Açık kalan üretim işleri

- Bu sürümde gerçek teklif veren kaynak sayısı birdir. Trip.com, Kiwi.com, eDreams, Mytrip, Ucuzabilet ve havayolları için resmî partner erişimi gerekir.
- Bir provider'ın birden fazla gerçek satıcı döndürdüğü connector'lar eklenmeden önce `provider` ve `seller` veri modeli ayrılmalıdır.
- Yüksek hacim için teklif ingest'i tek transactional bulk RPC'ye taşınmalı; provider cache/circuit-breaker ve geçici hata backoff'u tamamlanmalıdır.
- Supabase claim/lease, paralel report ve redirect/revalidation yolları için gerçek DB entegrasyon testleri eklenmelidir.
- Yeni meta-arama Travelpayouts kullanmaz; legacy fiyat alarmı modülü ayrı bir sonraki temizlik işidir.

Bu açıklar gizlenmemiştir: kapalı kaynaklar çalışıyormuş gibi gösterilmez, sahte satıcı veya örnek fiyat canlı sonuçlara karıştırılmaz.
