# Gece Audit + Push Düzeltme Raporu (02.09.2026)

> Başlangıç commit'i: `9058110` (origin/main) · Bitiş commit'i: `ccedf1d`
> Branch: `gece-audit-push-fix` (4 commit; main'e MERGE EDİLMEDİ, deploy YAPILMADI).
> Not: Bu çalışma, bilgisayara bağlı klasör olmadığı için GitHub `main`'in
> taze klonu üzerinde yapıldı (`origin/main` HEAD'i birebir `9058110`).
> Branch'i almak için: teslim edilen `gece-audit-push-fix.bundle` dosyasından
> `git fetch <bundle-yolu> gece-audit-push-fix:gece-audit-push-fix`.

## 1. Push kök nedeni ve KANITI

**Kök neden: `ios/App/App/AppDelegate.swift` içinde APNs → Capacitor token
köprüsü YOKTU.**

Kanıt zinciri (kod düzeyinde, tahmin değil):

1. `@capacitor/push-notifications@8.1.2` iOS kaynak kodu
   (`PushNotificationsPlugin.swift:40-41`) cihaz tokenini YALNIZ
   `NotificationCenter` üzerindeki `.capacitorDidRegisterForRemoteNotifications`
   bildiriminden alır; eklentinin kendi hata metni bile bunu söyler:
   *"event capacitorDidRegisterForRemoteNotifications not called"*.
2. Bu bildirimi gönderecek tek yer, AppDelegate'in
   `didRegisterForRemoteNotificationsWithDeviceToken` metodudur — repodaki
   AppDelegate'te bu metod (ve `didFail...` eşi) TANIMLI DEĞİLDİ.
3. Sonuç zinciri: iOS token'ı AppDelegate'e verir → metod yok, token düşer →
   JS `registration` olayı hiç tetiklenmez → `waitForRegistrationToken` 20
   sn'de zaman aşımına düşer → `enablePushForUser` "error" döner → cihaz
   `/api/push-devices`'a hiç kaydolmaz → cron `push_skipped_no_device` der →
   telefona bildirim GELMEZ. (Cron'un 200 dönüp e-postaları sorunsuz
   işlemesi bu teşhisle tutarlıdır: sunucu tarafı sağlam, kayıt zinciri
   iOS tarafında kopuktu.)

İkincil bulgular (aynı akışta düzeltildi):

- `capacitor.config.ts`'de `PushNotifications.presentationOptions` yoktu →
  uygulama ÖN PLANDAYKEN gelen bildirim iOS'ta gösterilmiyordu.
- `waitForRegistrationToken` listener'ları `register()` çağrısını
  beklemeden bağlıyordu → olayın listener bağlanmadan ateşlenme yarışı.
- `APNS_ENVIRONMENT` birebir `"production"` eşitliğiyle okunuyordu →
  `"Production"`/boşluklu değer sessizce sandbox'a düşürürdü; TestFlight
  tokenleri production olduğundan Apple `BadDeviceToken` döner. Değer artık
  boşluk/büyük-küçük harf toleranslı; başarısız APNs yanıtı maskeli teşhis
  logu yazar (`status + reason + env`; token/secret YOK).

## 2. Yapılan düzeltmeler (commit: `61add0d`)

- AppDelegate'e `didRegisterForRemoteNotificationsWithDeviceToken` +
  `didFailToRegisterForRemoteNotificationsWithError` köprü metodları.
- `PushNotifications.presentationOptions: ["badge","sound","alert"]`.
- Listener'lar register()'dan ÖNCE kurulup bekleniyor.
- APNs env normalizasyonu + maskeli hata teşhis logu.
- **Güvenli test ucu:** `POST /api/push-devices/test` — yalnız girişli
  kullanıcı, yalnız KENDİ cihazları, kullanıcı başına 60 sn rate limit,
  istek/yanıt/logda token yok; yanıt etkin APNs ortamını söyler (ortam
  uyuşmazlığı teşhisi). Mobil Profil > Bildirimler'e "Test bildirimi
  gönder" eklendi. Public test ucu veya istemciye service-role YOK.

Uçtan uca akışın diğer halkaları koddan doğrulandı (v4 hotfix'te
kanıtlanmış davranışlar korunuyor): token login sonrası Bearer ile
gönderiliyor; kayıt `user_id + platform + enabled=true` ile oluşuyor
(şemadaki alan adı `enabled`; görevde geçen `is_active` bu alandır);
logout yalnız mevcut cihazı kapatıyor; `notify_push` alarm kaydında
saklanıyor; e-posta kanalının sonucu push kanalını TÜKETMİYOR (kanal
bağımsız claim + retry kuyruğu, 37 testte); cooldown/retry/idempotency/
paralel cron/fencing testli; bildirime dokununca "Fiyat Alarmlarım"
açılıyor (`initPushTapListener`, App.tsx'te mount'ta bağlı).

## 3. Arayüzde basitleştirilen akışlar (commit: `74cead2`, `e13c2cf`)

- **Palet düzeltmesi (kök bulgu):** globals.css'te eski V17–V20 bloklarının
  `!important` token tanımları, dosyanın SONUNDAKİ nihai V23 paletini
  (gece laciverti `#071B33`, koyu mavi `#0B2A4A`, altın `#F6C445`, açık
  altın `#FFE08A`, kırık beyaz `#F8F5EE`, metin `#172033`, ikincil
  `#667085`) eziyordu. `!important`'lar kaldırıldı; tasarım dili artık
  gerçekten uygulanıyor. Tailwind eklenmedi; mevcut CSS sistemi kullanıldı.
- **Ana sayfa:** hızlı erişim dörtlüsü artık Keşfet · Rota Asistanı ·
  Fiyat Alarmı · Seyahat Kokpiti. Fiyat Alarmı "takip ettiğin rotada fiyat
  düşünce haber veren bağımsız araç" olarak anlatılır (arama motoru iması yok).
- **BottomNav:** ana sayfayla aynı bilgi mimarisi, 5 hedef: Ana Sayfa,
  Rota, Keşfet (ana), Alarm, Kokpit. Pasaport ve Planlarım Header menüsü/
  Profil üzerinden erişilir (Header'da duruyorlar).
- **Alarm oluşturma:** alan sırası kalkış → varış → tarih → hedef fiyat →
  bildirim kanalları. Kanallar açıklamalı kart seçimine dönüştü; push için
  giriş ve iOS izni ön koşulu ile "Ayarlar > Bildirimler > LetsGo2Travel"
  yolu açıkça yazılıyor; yalnız-push alarm kurulabilir (eski formda e-posta
  alanı zorunluydu); başarıda "Alarmlarımı gör" + "Yeni alarm kur".
- **Fiyat Alarmlarım listesi:** yalnız gerekli bilgiler — rota, tarih,
  hedef fiyat, SON FİYAT, aktif kanal rozetleri (E-posta/Telefon),
  kullanıcı dostu durum ("Takipte", "Bildirim gönderildi", "Duraklatıldı",
  "Kontrol edilemedi — tekrar deneyeceğiz"; APNs/teknik ifade yok).
  Duraklat / Devam ettir / Sil (onaylı). Yükleme/boş/hata durumları net;
  44px dokunma hedefleri; dar ekranda dikey düzen.
- **Mobil profil:** "Bildirimler" ve "Uygulama ve gizlilik" grupları
  (Hesap ve Seyahatlerim/Fiyat Alarmlarım zaten ayrı bölümlerdeydi);
  push izni durumu, Ayarlar'dan değişince uygulama öne gelirken yenilenir.
- **Admin fiyat alarmları:** durum kartları tıklanabilir filtre (aktif /
  duraklatılmış / bildirim gönderilen / hata alan); teknik mail durum
  kodları Türkçe etikete çevrildi. Secret/token gösterilmiyor.
- Mobil menü (MenuSheet) adları zaten tutarlıydı (Fiyat Alarmı, Rota
  Asistanı, Seyahat Kokpiti) — değişiklik gerekmedi.

## 4. Web, mobil ve güvenlik bulguları

Doğrulanan sağlam noktalar: tüm `/api/admin/*` uçları `requireAdmin`
korumalı (yalnız login/logout/session açık — bunlar auth uçlarının
kendisi); `/go/[provider]` yönlendirmesi sıkı host allowlist'li (open
redirect yok, "other" reddedilir); e-posta şablonlarında kullanıcı girdisi
`escapeHtml`'den geçer (XSS yok); alarm POST'unda kullanıcı başına saatlik
rate limit + aktif alarm sayı sınırı; KVKK hesap silme `push_devices`
dahil temizler; cron Bearer-only (doğru secret query'de bile 401, smoke
ile yeniden doğrulandı); RLS + service-role kilitleri migration zincirinde
yeniden doğrulandı; mobil safe-area (`viewport-fit=cover` + `env(...)`)
doğru; sitemap/robots/manifest mevcut; eski uçuş rotaları 410 (smoke).

Açık bulgular (düzeltilMEdi, bilinçli):

1. `npm audit`: 2 zafiyet — `nanoid` (high, <3.3.18) ve `sanitize-html`
   (moderate). Kural gereği `npm audit fix` ÇALIŞTIRILMADI; Emir onayıyla
   çalıştırılması önerilir (ikisinin de düzeltmesi mevcut).
2. `capacitor.config.backup.ts` repoda duruyor (ölü dosya; silme kararı
   Emir'in).
3. Canlı production probu (410/401 kontrolleri) bu oturumdan yapılamadı
   (ağ izni onayı gerektiriyordu) → "NOT VERIFIED (canlı)"; aynı
   kontroller yerel smoke'ta PASS.

## 5. Değişen dosyalar ve commitler

- `61add0d` Push kök neden düzeltmesi (AppDelegate, capacitor.config,
  mobile push.ts, apns.ts, /api/push-devices/test, ProfileScreen izin
  yenileme)
- `74cead2` Palet + ana sayfa + BottomNav + alarm formu + alarm listesi
- `e13c2cf` Admin ayrıştırma + mobil bildirim grubu + test bildirimi UI
- `ccedf1d` Mobil bundle'lar yeniden üretildi (3 kopya tutarlı:
  `mobile-dist`, `ios/App/App/public`, `android/.../assets/public` —
  hepsi `index-BsSKhhUT.js` / `index-C-CpFNoS.css`)

Toplam: 27 kaynak dosyası + bundle kopyaları. iOS↔Android arası yanlış
rename yok; `Package.swift`'te ters bölü 0.

## 6. Test matrisi

| Test | Sonuç |
|---|---|
| npm ci (kök + mobile) | PASS |
| Web ESLint / production build | PASS (0 hata/0 uyarı) |
| Mobil ESLint (--max-warnings=0) / Vite build | PASS |
| Capacitor sync iOS+Android (push 8/8 eklentide) + mobile doctor | PASS (yalnız placeholder-env uyarıları) |
| `npm run test:alerts` | **37/37 PASS** (alarm CRUD kararları, kanal bağımsızlığı, paralel cron, retry ≤3, fencing, idempotency, cihaz izolasyonlu logout, platform-bazlı APNs/FCM, deadline) |
| Smoke (gerçek next start) | PASS: `/fiyat-kontrolu` 200, alarm uçları canlı, cron auth 4 durum (yetkisiz 401 · yanlış Bearer 401 · doğru secret query'de YİNE 401 · doğru Bearer kabul), `/ucak-bileti-ara` + `/api/flights/searches` 410, admin koruması |
| Migration zinciri (izole PostgreSQL 16, sıfırdan) | PASS (CHAIN_FAIL=0) |
| `git diff --check` | PASS (temiz) |
| Secret/env staging taraması | PASS (branch diff'inde .env/.p8/google-services/service-account yok) |
| Yetkisiz API erişimi | PASS (admin uçları requireAdmin; push test ucu 401; cron 401) |
| Gerçek iPhone push testi / Xcode archive / foreground+tap davranışı | **NOT VERIFIED** — macOS/gerçek cihaz bu ortamda yok |
| Canlı production URL probu | **NOT VERIFIED (canlı)** — ağ izni gerektirdi; yerel smoke aynı kontrolleri geçti |

## 7. Production için gereken adımlar (BEN UYGULAMADIM)

1. Branch'i incele → `main`'e merge et → Vercel deploy (web değişiklikleri
   + `/api/push-devices/test` için).
2. **Yeni mobil build şart** (AppDelegate + capacitor.config değişti):
   Codemagic ile build 8 → TestFlight. `aps-environment` production
   provisioning'den gelmeye devam eder.
3. Vercel'de `APNS_ENVIRONMENT` değerinin `production` olduğunu doğrula
   (artık büyük/küçük harf toleranslı ama doğrusu düz `production`).
4. Migration gerekmiyor (bu gece şema değişikliği YOK).
5. `npm audit fix` (nanoid + sanitize-html) — ayrı onayla.

## 8. Fiziksel cihazda son test (yeni TestFlight build'inde)

1. Uygulamada giriş yap → Profil > Bildirimler > Telefon bildirimleri →
   izin ver. Bu kez kayıt 20 sn zaman aşımına DÜŞMEMELİ, "açıldı" demeli.
2. Supabase `push_devices`'ta satırın oluştuğunu gör (token kopyalama).
3. Profil > "Test bildirimi gönder" → birkaç saniyede bildirim gelmeli.
   Gelmezse yanıttaki `apnsEnvironment` alanına bak: `sandbox` görürsen
   Vercel env sorunudur.
4. Bildirime dokun → "Fiyat Alarmlarım" açılmalı; uygulama ön plandayken
   ikinci bir test bildirimi banner olarak görünmeli.
5. Alarm kur (hedef fiyat mevcutun üstünde) → cron sonrası push + e-posta;
   cron'u hemen tekrar tetikle → aynı olaya İKİNCİ bildirim gelmemeli.
6. iPad/ikinci cihazda giriş yap, iPhone'dan çıkış yap → yalnız iPhone
   kaydı kapanmalı.

## 9. Geri alma

- Tümü: `git branch -D gece-audit-push-fix` (main'e dokunulmadı).
- Merge sonrası tek parça geri almak için: `git revert <commit>` —
  commitler bağımsız ve küçük tutuldu. Push düzeltmesi (61add0d) geri
  alınırsa iOS push'un tekrar KIRILACAĞINI unutma.
