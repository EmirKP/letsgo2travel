// =====================================================================
// GERÇEK token-sync akışıyla hesap değişimi testleri.
// - Motor: mobile/src/lib/liveActivityTokenSync.ts (ayna kopya) — token
//   event → kayıt → ack, login replay, logout temizliği, oturum-kuşağı
//   (epoch) fencing + in-flight dedup (v8).
// - Sahte sunucu, register_live_activity_push_to_start /
//   deactivate_live_activity_installation SQL fonksiyonlarının SEMANTİĞİNİ
//   uygular (hesaplar-arası tek sahip + rotasyon + kurulum bazlı çıkış +
//   epoch bar → 409). armHold/releaseHeld ile bir kayıt isteği sunucuda
//   BEKLETİLEBİLİR: eski hesabın gecikmiş isteği yarışları test edilir.
// - B'nin tokenı store/map'e ELLE EKLENMEZ: cron'un gördüğü token tablosu
//   yalnız motorun yaptığı kayıtlardan oluşur.
// =====================================================================

import assert from "node:assert";
import { runLiveActivityCron } from "../../lib/live-activity-cron";
import { createTokenSyncEngine, type SyncTokenEntry } from "./_mobile/liveActivityTokenSync";
import { createMemoryStore } from "./liveActivityCron";

type ServerTokenRow = {
  id: string;
  userId: string;
  tokenType: "push_to_start" | "activity_update";
  token: string;
  installationId: string | null;
  enabled: boolean;
};

// SQL fonksiyonlarının semantiğini uygulayan sahte sunucu.
function createFakeServer(options: { migrationApplied?: boolean } = {}) {
  const rows: ServerTokenRow[] = [];
  let nextId = 1;
  let migrationApplied = options.migrationApplied ?? true;
  let networkDown = false;
  const sessions = new Map<string, string>(); // accessToken -> userId
  const tripOwners = new Map<string, string>(); // tripId -> userId
  // Kuşak barları: installationId -> barlanan epoch kümesi (logout yazar).
  const bars = new Map<string, Set<string>>();
  // Gecikmiş istek simülasyonu: armHold() sonrası GELEN kayıt isteği,
  // releaseHeld() çağrılana dek sunucuda İŞLENMEDEN bekletilir.
  let holdArm = false;
  const held: Array<() => void> = [];
  let registerArrivals = 0;

  return {
    rows,
    sessions,
    tripOwners,
    setMigrationApplied(value: boolean) { migrationApplied = value; },
    setNetworkDown(value: boolean) { networkDown = value; },
    armHold() { holdArm = true; },
    releaseHeld() { for (const release of held.splice(0)) release(); },
    heldCount() { return held.length; },
    registerArrivalCount() { return registerArrivals; },
    barEpoch(installationId: string, epoch: string) {
      if (!epoch) return;
      if (!bars.has(installationId)) bars.set(installationId, new Set());
      bars.get(installationId)!.add(epoch);
    },
    /** POST /api/live-activity/tokens eşdeğeri (v8: epoch zorunlu). */
    async register(entry: SyncTokenEntry, accessToken: string, installationId: string, epoch: string) {
      registerArrivals += 1;
      if (holdArm) {
        holdArm = false;
        // İstek sunucuya ULAŞTI ama işlenmesi gecikiyor (ağ/kuyruk).
        await new Promise<void>((resolve) => held.push(resolve));
      }
      const userId = sessions.get(accessToken);
      if (!userId) return { ok: false as const, status: 401 };
      if (networkDown) throw new Error("network");
      // v8: oturum kuşağı ZORUNLU; barlı kuşak — geliş sırasından bağımsız —
      // 409 ile reddedilir (register RPC'de LA001, activity_update yolunda
      // bar tablosu kontrolü).
      if (!epoch) return { ok: false as const, status: 400 };
      if (bars.get(installationId)?.has(epoch)) return { ok: false as const, status: 409 };
      // activity_update: trip sahipliği doğrulanır; per-user upsert.
      if (entry.tokenType === "activity_update") {
        if (!entry.tripId) return { ok: false as const, status: 400 };
        if (tripOwners.get(entry.tripId) !== userId) return { ok: false as const, status: 403 };
        if (!migrationApplied) return { ok: false as const, status: 503 };
        let own = rows.find((row) => row.userId === userId && row.tokenType === "activity_update" && row.token === entry.token);
        if (!own) {
          own = { id: `srv-${nextId++}`, userId, tokenType: "activity_update", token: entry.token, installationId: installationId || null, enabled: true };
          rows.push(own);
        } else {
          own.enabled = true;
        }
        return { ok: true as const };
      }
      if (entry.tokenType !== "push_to_start") return { ok: false as const, status: 400 };
      if (!installationId) return { ok: false as const, status: 400 };
      // RPC migration'ı yoksa GÜVENLİKSİZ fallback YOK: 503.
      if (!migrationApplied) return { ok: false as const, status: 503 };
      // register_live_activity_push_to_start semantiği:
      for (const row of rows) {
        if (row.tokenType === "push_to_start" && row.token === entry.token && row.userId !== userId) row.enabled = false;
      }
      let own = rows.find((row) => row.userId === userId && row.tokenType === "push_to_start" && row.token === entry.token);
      if (!own) {
        own = { id: `srv-${nextId++}`, userId, tokenType: "push_to_start", token: entry.token, installationId, enabled: true };
        rows.push(own);
      } else {
        own.enabled = true;
        own.installationId = installationId;
      }
      for (const row of rows) {
        if (row.userId === userId && row.tokenType === "push_to_start"
          && row.installationId === installationId && row.id !== own.id) row.enabled = false;
      }
      return { ok: true as const };
    },
    /** DELETE /api/live-activity/tokens (çıkış) eşdeğeri: kurulum tokenları
        kapatılır ve verilen oturum kuşağı BARLANIR (v8). */
    deactivate(userId: string, installationId: string, epoch?: string) {
      if (epoch) {
        if (!bars.has(installationId)) bars.set(installationId, new Set());
        bars.get(installationId)!.add(epoch);
      }
      for (const row of rows) {
        if (row.userId === userId && row.installationId === installationId) row.enabled = false;
      }
    },
    enabledRows() { return rows.filter((row) => row.enabled); },
  };
}

// Bir fiziksel cihazın motor + native yüzey simülasyonu. initialLatest:
// uygulama yeniden başlatma senaryosunda UserDefaults'tan geri yüklenen
// "en son push-to-start token" (JS durumu sıfırlanır, native kalıcıdır).
let deviceContextSeq = 0; // gerçek uygulamada createId() uuid'leri bağlamlar arası da TEKİLDİR
function createDevice(server: ReturnType<typeof createFakeServer>, installationId: string, initialLatest = "") {
  let accessToken = "";
  let latestPushToStartToken = initialLatest;
  const contextId = ++deviceContextSeq;
  let epochCounter = 0;
  const nativeBuffer = new Set<string>();
  const bufferedEntries: SyncTokenEntry[] = [];
  const ackLog: string[] = [];

  const engine = createTokenSyncEngine({
    getAccessToken: () => accessToken,
    getInstallationId: () => installationId,
    // Gerçekte createId() (uuid v4); testte deterministik ve TEKİL —
    // bağlam (restart) + login sayacıyla uuid tekilliği modellenir.
    makeEpochId: () => `epoch:${installationId}:${contextId}:${++epochCounter}`,
    send: (entry, token, installation, epochId) => server.register(entry, token, installation, epochId),
    ack: async (entry) => {
      // UserDefaults kaydı YALNIZ sunucu başarısında ack ile silinir.
      nativeBuffer.delete(entry.token);
      const index = bufferedEntries.findIndex((item) => item.tokenType === entry.tokenType && item.token === entry.token && (item.tripId || "") === (entry.tripId || ""));
      if (index >= 0) bufferedEntries.splice(index, 1);
      ackLog.push(entry.token);
    },
    getLatestPushToStartToken: async () => latestPushToStartToken,
  });

  return {
    engine,
    ackLog,
    nativeBuffer,
    /** Native gözlemci event'i: latest KALICI güncellenir + tampon + queue. */
    receivePushToStartToken(token: string) {
      latestPushToStartToken = token; // ack bunu SİLMEZ
      nativeBuffer.add(token);
      engine.queue({ tokenType: "push_to_start", token });
    },
    /** LISTENER KURULMADAN gelen event: yalnız native tampona yazılır
        (retainUntilConsumed olmadan kaybolurdu — v7 bulgusunun modeli). */
    bufferWithoutListener(entry: SyncTokenEntry) {
      latestPushToStartToken = entry.tokenType === "push_to_start" ? entry.token : latestPushToStartToken;
      bufferedEntries.push(entry);
      nativeBuffer.add(entry.token);
    },
    /** JS drainBufferedTokens eşdeğeri: listener kurulunca tamponu çeker
        ve TÜM girişleri motora sıralar (getBufferedTokens yolu). */
    drainBuffer() {
      for (const entry of bufferedEntries) engine.queue({ ...entry });
    },
    login(token: string) {
      accessToken = token;
      return engine.onLogin();
    },
    logout(userId: string) {
      // Uygulamadaki sıra (disableLiveActivityTokensForLogout): önce mevcut
      // kuşak OKUNUR, motor kuyruğu temizlenir + epoch ilerler, sonra DELETE
      // sunucuda kurulum tokenlarını kapatır ve kuşağı BARLAR; latest kalır.
      const epoch = engine.sessionEpochId();
      engine.onLogout();
      server.deactivate(userId, installationId, epoch);
      accessToken = "";
    },
    latest: () => latestPushToStartToken,
  };
}

const IPHONE_TOKEN = "aa11aa11aa11aa11aa11aa11aa11aa11";
const IPAD_TOKEN = "bb22bb22bb22bb22bb22bb22bb22bb22";
const INSTALL_IPHONE = "11111111-aaaa-4aaa-8aaa-000000000001";
const INSTALL_IPAD = "22222222-bbbb-4bbb-8bbb-000000000002";

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

export function registerLiveActivityAccountFlowTests(test: (name: string, fn: () => Promise<void> | void) => void) {
  test("hesap akışı (GERÇEK sync): A login→kayıt+ack; logout yalnız iPhone; B login→replay; cron doğru hedefler", async () => {
    const server = createFakeServer();
    server.sessions.set("bearer-A", "user-A");
    server.sessions.set("bearer-B", "user-B");
    const iphone = createDevice(server, INSTALL_IPHONE);
    const ipad = createDevice(server, INSTALL_IPAD);

    // 1) A login (iPhone + iPad) → token kayıt ve ACK.
    await iphone.login("bearer-A");
    iphone.receivePushToStartToken(IPHONE_TOKEN);
    await ipad.login("bearer-A");
    ipad.receivePushToStartToken(IPAD_TOKEN);
    await settle();
    assert.deepEqual(iphone.ackLog, [IPHONE_TOKEN], "A kaydı ack edilmeli");
    assert.equal(iphone.nativeBuffer.size, 0, "tampon temiz");
    assert.equal(iphone.latest(), IPHONE_TOKEN, "latest KORUNUR (ack silmez)");
    assert.equal(server.enabledRows().filter((row) => row.userId === "user-A").length, 2);

    // 2) A iPhone'dan logout → yalnız iPhone kapanır, iPad açık kalır.
    iphone.logout("user-A");
    const afterLogout = server.enabledRows();
    assert.equal(afterLogout.length, 1);
    assert.equal(afterLogout[0].token, IPAD_TOKEN, "iPad açık kalmalı");
    assert.equal(iphone.engine.pendingCount(), 0, "kuyruk temizlenmeli");
    assert.equal(iphone.latest(), IPHONE_TOKEN, "latest logout'ta da korunur");

    // 3) Uygulama kapanmadan B login → native latest OTOMATİK yeniden
    //    kaydolur (elle map'e ekleme YOK — onLogin replay eder).
    await iphone.login("bearer-B");
    const iphoneOwners = server.rows.filter((row) => row.token === IPHONE_TOKEN);
    assert.equal(iphoneOwners.filter((row) => row.enabled).length, 1, "tek enabled sahip");
    assert.equal(iphoneOwners.find((row) => row.enabled)?.userId, "user-B", "token yalnız B'ye bağlı ve etkin");

    // 4) Cron: token tablosu YALNIZ motorun kayıtlarından kurulur.
    const { store } = createMemoryStore({
      trips: [
        { id: "trip-A", userId: "user-A", title: "Roma, İtalya", originIata: "IST", destinationIata: "FCO", departureAtMs: Date.parse("2026-10-10T10:30:00Z"), status: "upcoming" },
        { id: "trip-B", userId: "user-B", title: "Paris, Fransa", originIata: "IST", destinationIata: "CDG", departureAtMs: Date.parse("2026-10-10T10:30:00Z"), status: "upcoming" },
      ],
      tokens: server.rows.map((row) => ({
        id: row.id, userId: row.userId, token: row.token, enabled: row.enabled, tokenType: row.tokenType,
      })),
    });
    const calls: Array<{ token: string }> = [];
    await runLiveActivityCron(store, async (token) => { calls.push({ token }); return { ok: true, shouldDisableToken: false }; }, {
      nowMs: Date.parse("2026-10-10T08:00:00Z"),
    });
    const iphoneCalls = calls.filter((call) => call.token === IPHONE_TOKEN);
    assert.equal(iphoneCalls.length, 1, "iPhone'a yalnız B'nin uçuşu gitmeli (A'nınki GİDEMEZ)");
    assert.equal(calls.filter((call) => call.token === IPAD_TOKEN).length, 1, "A'nın uçuşu iPad'ine gitmeli");
    assert.equal(calls.length, 2);
  });

  test("KRİTİK yarış (v8): A'nın BEKLETİLEN POST'u logout+B login sonrası GEÇ tamamlanır → sahipliği geri alamaz, B'nin pending'ini silmez, ACK üretmez", async () => {
    const server = createFakeServer();
    server.sessions.set("bearer-A", "user-A");
    server.sessions.set("bearer-B", "user-B");
    const iphone = createDevice(server, INSTALL_IPHONE);

    // A login; token event gelir ama POST sunucuda BEKLETİLİR (gecikmiş istek).
    await iphone.login("bearer-A");
    server.armHold();
    iphone.receivePushToStartToken(IPHONE_TOKEN);
    await settle();
    assert.equal(server.heldCount(), 1, "A'nın POST'u sunucuda beklemede");
    assert.equal(server.enabledRows().length, 0);

    // A logout (kuşak barlanır) → B login: replay kuyruğa girer; in-flight
    // dedup aynı anahtar için İKİNCİ paralel POST açmaz (tasarım gereği).
    iphone.logout("user-A");
    await iphone.login("bearer-B");
    await settle();
    assert.equal(iphone.engine.pendingCount(), 1, "B'nin kaydı kuyruğunda beklemeli");
    assert.equal(server.registerArrivalCount(), 1, "aynı token için paralel ikinci POST AÇILMADI (dedup)");

    // A'nın POST'u GEÇ tamamlanır: sunucu barlı kuşağı 409'lar; istemci de
    // epoch uyuşmazlığıyla sonucu TAMAMEN atar.
    server.releaseHeld();
    await settle();
    assert.equal(iphone.ackLog.length, 0, "A'nın geç sonucu native ACK ÜRETMEZ");
    assert.equal(iphone.engine.pendingCount(), 1, "A'nın geç sonucu B'nin pending kaydını SİLMEZ");
    assert.equal(iphone.nativeBuffer.size, 1, "native tampon korunur");
    assert.equal(server.enabledRows().length, 0, "A'nın geç isteği sahiplik YAZAMAZ (sunucu barı)");

    // B'nin retry'ı (ağ dönüşü/foreground/backoff flush) BAŞARILI.
    iphone.engine.flush();
    await settle();
    const owners = server.rows.filter((row) => row.token === IPHONE_TOKEN && row.enabled);
    assert.equal(owners.length, 1, "token için TEK enabled sahip");
    assert.equal(owners[0].userId, "user-B", "sahip yalnız B");
    assert.deepEqual(iphone.ackLog, [IPHONE_TOKEN], "yalnız B'nin başarısı ack'lenir (çift ACK yok)");
    assert.equal(iphone.engine.pendingCount(), 0);
    assert.equal(iphone.nativeBuffer.size, 0);
  });

  test("KRİTİK yarış (v8, sunucu sırası): uygulama YENİDEN BAŞLASA bile (istemci durumu sıfır) A'nın B'den SONRA işlenen isteği sahipliği ezemez — sunucu bar fencing + cron doğru hedefler", async () => {
    const server = createFakeServer();
    server.sessions.set("bearer-A", "user-A");
    server.sessions.set("bearer-B", "user-B");

    // Restart ÖNCESİ JS bağlamı: A'nın POST'u sunucuda bekletilir, A çıkar.
    const before = createDevice(server, INSTALL_IPHONE);
    await before.login("bearer-A");
    server.armHold();
    before.receivePushToStartToken(IPHONE_TOKEN);
    await settle();
    assert.equal(server.heldCount(), 1);
    before.logout("user-A"); // kuşak barlanır

    // Uygulama yeniden başlar: YENİ JS bağlamı (in-flight seti ve epoch
    // sayacı SIFIR — istemci fencing'i artık koruyamaz), native latest
    // UserDefaults'tan geri gelir. TEK koruma sunucu barıdır.
    const after = createDevice(server, INSTALL_IPHONE, before.latest());
    await after.login("bearer-B");
    await settle();
    let owners = server.rows.filter((row) => row.token === IPHONE_TOKEN && row.enabled);
    assert.equal(owners.length, 1);
    assert.equal(owners[0].userId, "user-B", "B'nin replay kaydı BAŞARILI");
    assert.deepEqual(after.ackLog, [IPHONE_TOKEN], "B'nin kaydı ack edildi");

    // A'nın isteği sunucuda B'DEN SONRA işlenir (ters geliş sırası) →
    // barlı kuşak 409 → sahiplik DEĞİŞMEZ.
    server.releaseHeld();
    await settle();
    owners = server.rows.filter((row) => row.token === IPHONE_TOKEN && row.enabled);
    assert.equal(owners.length, 1, "hâlâ tek enabled sahip");
    assert.equal(owners[0].userId, "user-B", "sahip HÂLÂ B — geç istek ezemedi");
    assert.deepEqual(after.ackLog, [IPHONE_TOKEN], "A'nın geç sonucu EK ack üretmedi");
    assert.equal(before.ackLog.length, 0, "eski bağlamda da ack yok (epoch uyuşmaz)");

    // Cron: bu telefona A'nın uçuşu GİDEMEZ, B'ninki gider.
    const { store } = createMemoryStore({
      trips: [
        { id: "trip-A", userId: "user-A", title: "Roma, İtalya", originIata: "IST", destinationIata: "FCO", departureAtMs: Date.parse("2026-10-10T10:30:00Z"), status: "upcoming" },
        { id: "trip-B", userId: "user-B", title: "Paris, Fransa", originIata: "IST", destinationIata: "CDG", departureAtMs: Date.parse("2026-10-10T10:30:00Z"), status: "upcoming" },
      ],
      tokens: server.rows.map((row) => ({
        id: row.id, userId: row.userId, token: row.token, enabled: row.enabled, tokenType: row.tokenType,
      })),
    });
    const calls: Array<{ token: string }> = [];
    await runLiveActivityCron(store, async (token) => { calls.push({ token }); return { ok: true, shouldDisableToken: false }; }, {
      nowMs: Date.parse("2026-10-10T08:00:00Z"),
    });
    assert.equal(calls.length, 1, "yalnız B'nin uçuşu gönderilir");
    assert.equal(calls[0].token, IPHONE_TOKEN, "telefon tokenına yalnız B'nin uçuşu gider");
  });

  test("v8: sunucu 409 (barlı kuşak) pending'i düşürür ama ACK ETMEZ — token native tamponda kalır ve SONRAKİ login yeni kuşakla kurtarır", async () => {
    const server = createFakeServer();
    server.sessions.set("bearer-A", "user-A");
    const iphone = createDevice(server, INSTALL_IPHONE);
    await iphone.login("bearer-A");
    // Kuşak sunucuda dışarıdan barlanmış (ör. çıkış DELETE'i sunucuya işledi
    // ama istemci motoru henüz haberdar değil).
    server.barEpoch(INSTALL_IPHONE, iphone.engine.sessionEpochId());
    iphone.receivePushToStartToken(IPHONE_TOKEN);
    await settle();
    assert.equal(iphone.ackLog.length, 0, "409 ACK ÜRETMEZ");
    assert.equal(iphone.nativeBuffer.size, 1, "token native tamponda KALIR");
    assert.equal(iphone.engine.pendingCount(), 0, "bu kuşakta asla başaramaz → kuyruktan düşer");
    assert.equal(server.enabledRows().length, 0);

    // Sonraki login YENİ kuşak açar → latest replay başarılı + ack.
    iphone.logout("user-A");
    await iphone.login("bearer-A");
    await settle();
    assert.deepEqual(iphone.ackLog, [IPHONE_TOKEN], "yeni kuşakla kayıt kurtarılır");
    assert.equal(server.enabledRows()[0]?.userId, "user-A");
  });

  test("v8: in-flight dedup — retained event tekrarı + online/foreground flush'ları aynı token için PARALEL ikinci POST açmaz", async () => {
    const server = createFakeServer();
    server.sessions.set("bearer-A", "user-A");
    const iphone = createDevice(server, INSTALL_IPHONE);
    await iphone.login("bearer-A");
    server.armHold();
    iphone.receivePushToStartToken(IPHONE_TOKEN);
    await settle();
    assert.equal(server.registerArrivalCount(), 1, "ilk POST yolda");

    // Retained event tekrarı (listener yeniden tetiklenir) + getBufferedTokens
    // drain'i + ağ dönüşü ve foreground flush'ları — hepsi AYNI anahtar.
    iphone.engine.queue({ tokenType: "push_to_start", token: IPHONE_TOKEN });
    iphone.engine.flush(); // networkStatusChange(connected) eşdeğeri
    iphone.engine.flush(); // appStateChange(isActive) eşdeğeri
    await settle();
    assert.equal(server.registerArrivalCount(), 1, "in-flight dedup: ikinci paralel POST AÇILMAZ");
    assert.equal(iphone.engine.pendingCount(), 1, "aynı anahtar kuyrukta TEK girdi");

    // İlk POST tamamlanınca kayıt + TEK ack; kuyruk boşalır.
    server.releaseHeld();
    await settle();
    assert.deepEqual(iphone.ackLog, [IPHONE_TOKEN], "tek ack");
    assert.equal(iphone.engine.pendingCount(), 0);
    assert.equal(server.enabledRows().length, 1);
    assert.equal(server.registerArrivalCount(), 1);
  });

  test("tampon replay (v7): listener'dan ÖNCE biriken PTS + 2 activity_update tokenının HEPSİ kaydedilir ve ACK edilir", async () => {
    const server = createFakeServer();
    server.sessions.set("bearer-A", "user-A");
    server.tripOwners.set("trip-1", "user-A");
    server.tripOwners.set("trip-2", "user-A");
    const iphone = createDevice(server, INSTALL_IPHONE);
    await iphone.login("bearer-A");

    // Event'ler JS listener kurulmadan gelir: yalnız native tampona yazılır
    // (v7 öncesi bunlar KAYBOLURDU — activity_update için replay yolu yoktu).
    iphone.bufferWithoutListener({ tokenType: "push_to_start", token: "cc33cc33cc33cc33cc33cc33cc33cc33" });
    iphone.bufferWithoutListener({ tokenType: "activity_update", token: "dd44dd44dd44dd44dd44dd44dd44dd44", tripId: "trip-1" });
    iphone.bufferWithoutListener({ tokenType: "activity_update", token: "ee55ee55ee55ee55ee55ee55ee55ee55", tripId: "trip-2" });
    assert.equal(server.enabledRows().length, 0, "listener yokken sunucuya hiçbir şey gitmemeli");

    // Listener kurulur → JS tamponu çeker (getBufferedTokens yolu).
    iphone.drainBuffer();
    await settle();
    assert.equal(server.enabledRows().length, 3, "PTS + 2 activity_update kaydolmalı");
    assert.equal(server.enabledRows().filter((row) => row.tokenType === "activity_update").length, 2);
    assert.equal(iphone.ackLog.length, 3, "üçü de ACK edilmeli");
    assert.equal(iphone.nativeBuffer.size, 0, "tampon yalnız BAŞARI sonrası boşalmalı");

    // İdempotens: aynı tampon ikinci kez drain edilirse zarar vermez.
    iphone.bufferWithoutListener({ tokenType: "activity_update", token: "dd44dd44dd44dd44dd44dd44dd44dd44", tripId: "trip-1" });
    iphone.drainBuffer();
    iphone.drainBuffer();
    await settle();
    assert.equal(server.enabledRows().length, 3, "tekrar kayıt yeni satır AÇMAZ (idempotent)");
  });

  test("tampon replay (v7): sunucu 503/AĞ hatasında token tampondan SİLİNMEZ; sonraki denemede gönderilir", async () => {
    const server = createFakeServer({ migrationApplied: false });
    server.sessions.set("bearer-A", "user-A");
    server.tripOwners.set("trip-1", "user-A");
    const iphone = createDevice(server, INSTALL_IPHONE);
    await iphone.login("bearer-A");

    iphone.bufferWithoutListener({ tokenType: "push_to_start", token: "cc33cc33cc33cc33cc33cc33cc33cc33" });
    iphone.bufferWithoutListener({ tokenType: "activity_update", token: "dd44dd44dd44dd44dd44dd44dd44dd44", tripId: "trip-1" });
    iphone.drainBuffer();
    await settle();
    assert.equal(iphone.ackLog.length, 0, "503'te ACK EDİLMEMELİ");
    assert.equal(iphone.nativeBuffer.size, 2, "tampon korunmalı");
    assert.equal(iphone.engine.pendingCount(), 2, "kuyrukta beklemeli");

    // AĞ hatası da aynı: ack yok, tampon korunur.
    server.setMigrationApplied(true);
    server.setNetworkDown(true);
    iphone.engine.flush();
    await settle();
    assert.equal(iphone.ackLog.length, 0, "ağ hatasında da ACK edilmez");
    assert.equal(iphone.nativeBuffer.size, 2);

    // Bağlantı döner → sonraki flush (ağ dönüşü/foreground/backoff) başarılı.
    server.setNetworkDown(false);
    iphone.engine.flush();
    await settle();
    assert.equal(iphone.ackLog.length, 2, "bağlantı dönünce ikisi de kaydolup ack edilmeli");
    assert.equal(iphone.nativeBuffer.size, 0);
    assert.equal(server.enabledRows().length, 2);
  });

  test("hesap akışı: RPC migration'ı yokken 503 → token ACK EDİLMEZ; migration gelince retry başarılı", async () => {
    const server = createFakeServer({ migrationApplied: false });
    server.sessions.set("bearer-A", "user-A");
    const iphone = createDevice(server, INSTALL_IPHONE);

    await iphone.login("bearer-A");
    iphone.receivePushToStartToken(IPHONE_TOKEN);
    await settle();
    assert.equal(iphone.ackLog.length, 0, "503'te ack EDİLMEMELİ");
    assert.equal(iphone.nativeBuffer.size, 1, "token native tamponda beklemeli");
    assert.equal(iphone.engine.pendingCount(), 1, "kuyrukta beklemeli");
    assert.equal(server.enabledRows().length, 0, "sunucuda kayıt oluşmamalı");

    // Migration uygulanır → flush ile retry BAŞARILI + ack.
    server.setMigrationApplied(true);
    iphone.engine.flush();
    await settle();
    assert.deepEqual(iphone.ackLog, [IPHONE_TOKEN]);
    assert.equal(iphone.engine.pendingCount(), 0);
    assert.equal(server.enabledRows()[0]?.userId, "user-A");
  });
}
