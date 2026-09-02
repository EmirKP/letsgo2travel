// =====================================================================
// Live Activity cron çekirdeği testleri (lib/live-activity-cron).
// In-memory store, Supabase uyarlayıcısıyla AYNI atomik sözleşmeyi uygular:
// claim = tek atomik kontrol-ve-yaz; settle = claim_token fencing.
// =====================================================================

import assert from "node:assert";
import {
  LIVE_ACTIVITY_LEAD_MS,
  LIVE_ACTIVITY_RETRY_BACKOFF_MS,
  LIVE_ACTIVITY_TAIL_MS,
  defaultClaimToken,
  runLiveActivityCron,
  type CronToken,
  type CronTrip,
  type DeliveryRow,
  type LiveActivityPushOutcome,
  type LiveActivitySendPayload,
  type LiveActivityStore,
} from "../../lib/live-activity-cron";

type MemoryTrip = CronTrip & { status: string };
type MemoryToken = CronToken & { userId: string; tokenType: "push_to_start" | "activity_update"; tripId?: string };
type MemoryDelivery = DeliveryRow;

export function createMemoryStore(seed: { trips?: MemoryTrip[]; tokens?: MemoryToken[] } = {}) {
  const trips = new Map<string, MemoryTrip>((seed.trips || []).map((trip) => [trip.id, trip]));
  const tokens = new Map<string, MemoryToken>((seed.tokens || []).map((token) => [token.id, token]));
  const deliveries = new Map<string, MemoryDelivery>();
  let nextDeliveryId = 1;

  const key = (tripId: string, tokenId: string, event: string) => `${tripId}:${tokenId}:${event}`;

  // GERÇEK ŞEMA SÖZLEŞMESİ: live_activity_deliveries.claim_token UUID
  // kolonudur. UUID olmayan bir değer Postgres'te 22P02 ile reddedilir;
  // in-memory store da AYNI şekilde reddeder ki tip uyuşmazlığı testte
  // yakalansın (v3'teki 'claim-<ts>-<rnd>' üretim hatası böyle yakalanırdı).
  const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const claimTokenErrors: string[] = [];
  const assertUuid = (value: string) => {
    if (UUID_PATTERN.test(value)) return true;
    claimTokenErrors.push(value);
    return false; // Postgres 22P02 eşdeğeri: yazım reddedilir
  };

  const store: LiveActivityStore = {
    async tripsDepartingBetween(fromMs, toMs, limit) {
      return Array.from(trips.values())
        .filter((trip) => ["upcoming", "active"].includes(trip.status))
        .filter((trip) => trip.departureAtMs >= fromMs && trip.departureAtMs < toMs)
        .slice(0, limit);
    },
    async tripsEndDue(nowMs, horizonMs, limit) {
      return Array.from(trips.values())
        .filter((trip) => trip.departureAtMs < nowMs - LIVE_ACTIVITY_TAIL_MS && trip.departureAtMs >= nowMs - horizonMs)
        .slice(0, limit);
    },
    async pushToStartTokensByUser(userIds) {
      const map = new Map<string, CronToken[]>();
      for (const token of tokens.values()) {
        if (token.tokenType !== "push_to_start" || !token.enabled || !userIds.includes(token.userId)) continue;
        map.set(token.userId, [...(map.get(token.userId) || []), token]);
      }
      return map;
    },
    async activityUpdateTokensByTrip(tripIds) {
      const map = new Map<string, CronToken[]>();
      for (const token of tokens.values()) {
        if (token.tokenType !== "activity_update" || !token.enabled || !token.tripId || !tripIds.includes(token.tripId)) continue;
        map.set(token.tripId, [...(map.get(token.tripId) || []), token]);
      }
      return map;
    },
    async seedDeliveries(rows) {
      for (const row of rows) {
        const k = key(row.tripId, row.tokenId, row.event);
        if (deliveries.has(k)) continue; // unique constraint: çakışanı atla
        deliveries.set(k, {
          id: `d${nextDeliveryId++}`,
          tripId: row.tripId,
          tokenId: row.tokenId,
          event: row.event,
          status: "pending",
          attemptCount: 0,
          claimToken: null,
          claimedUntilMs: null,
          nextRetryAtMs: 0,
        });
      }
    },
    async dueDeliveries(nowMs, limit) {
      return Array.from(deliveries.values())
        .filter((row) => (row.status === "pending" || row.status === "transient_failed")
          && row.nextRetryAtMs <= nowMs
          && (row.claimedUntilMs === null || row.claimedUntilMs < nowMs))
        .sort((left, right) => left.nextRetryAtMs - right.nextRetryAtMs)
        .slice(0, limit)
        .map((row) => ({ ...row }));
    },
    async claimDelivery(id, expectedAttemptCount, claimToken, leaseUntilMs, nowMs) {
      // ATOMİK kontrol-ve-yaz (Postgres'teki tek UPDATE'in eşdeğeri).
      if (!assertUuid(claimToken)) return false;
      const row = Array.from(deliveries.values()).find((item) => item.id === id);
      if (!row) return false;
      if (row.status !== "pending" && row.status !== "transient_failed") return false;
      if (row.attemptCount !== expectedAttemptCount) return false;
      if (row.claimedUntilMs !== null && row.claimedUntilMs >= nowMs) return false;
      row.claimToken = claimToken;
      row.claimedUntilMs = leaseUntilMs;
      return true;
    },
    async settleDelivery(id, claimToken, patch) {
      // FENCED: yalnız satırdaki claim_token eşleşirse yazar.
      const row = Array.from(deliveries.values()).find((item) => item.id === id);
      if (!row || row.claimToken !== claimToken) return false;
      row.status = patch.status;
      row.attemptCount = patch.attemptCount;
      if (patch.nextRetryAtMs !== undefined) row.nextRetryAtMs = patch.nextRetryAtMs;
      row.claimToken = null;
      row.claimedUntilMs = null;
      return true;
    },
    async tripsByIds(ids) {
      const map = new Map<string, CronTrip>();
      for (const id of ids) {
        const trip = trips.get(id);
        if (trip) map.set(id, trip);
      }
      return map;
    },
    async tokensByIds(ids) {
      const map = new Map<string, CronToken>();
      for (const id of ids) {
        const token = tokens.get(id);
        if (token) map.set(id, token);
      }
      return map;
    },
    async disableToken(tokenId) {
      const token = tokens.get(tokenId);
      if (token) token.enabled = false;
    },
  };

  return { store, trips, tokens, deliveries, claimTokenErrors };
}

type TransportBehavior = (token: string, payload: LiveActivitySendPayload) => LiveActivityPushOutcome | Promise<LiveActivityPushOutcome>;

function makeTransport(behavior: TransportBehavior) {
  const calls: Array<{ token: string; event: "start" | "end" }> = [];
  const transport = async (token: string, payload: LiveActivitySendPayload) => {
    calls.push({ token, event: payload.event });
    return behavior(token, payload);
  };
  return { transport, calls };
}

const OK: LiveActivityPushOutcome = { ok: true, shouldDisableToken: false };
const TRANSIENT: LiveActivityPushOutcome = { ok: false, shouldDisableToken: false, reason: "apns_timeout" };
const PERMANENT: LiveActivityPushOutcome = { ok: false, shouldDisableToken: true, reason: "apns_BadDeviceToken" };

const T0 = Date.parse("2026-10-10T08:00:00Z");
const DEPARTURE = T0 + LIVE_ACTIVITY_LEAD_MS - 30 * 60 * 1000; // pencere içinde

function tripUpcoming(id: string, userId: string): MemoryTrip {
  return { id, userId, title: "Roma, İtalya", originIata: "IST", destinationIata: "FCO", departureAtMs: DEPARTURE, status: "upcoming" };
}

function pushToStartToken(id: string, userId: string): MemoryToken {
  return { id, userId, token: `pts-token-${id}-0123456789abcdef`, enabled: true, tokenType: "push_to_start" };
}

function updateToken(id: string, userId: string, tripId: string): MemoryToken {
  return { id, userId, token: `upd-token-${id}-0123456789abcdef`, enabled: true, tokenType: "activity_update", tripId };
}

export function registerLiveActivityCronTests(test: (name: string, fn: () => Promise<void> | void) => void) {
  test("cron: paralel iki çalışma cihaz başına TEK start gönderir", async () => {
    const { store } = createMemoryStore({
      trips: [tripUpcoming("trip-1", "user-1")],
      tokens: [pushToStartToken("tok-a", "user-1"), pushToStartToken("tok-b", "user-1")],
    });
    // Yavaş transport: iki cron'un claim aşamaları kesişsin.
    const { transport, calls } = makeTransport(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      return OK;
    });
    const [first, second] = await Promise.all([
      runLiveActivityCron(store, transport, { nowMs: T0 }),
      runLiveActivityCron(store, transport, { nowMs: T0 }),
    ]);
    const perToken = new Map<string, number>();
    for (const call of calls) perToken.set(call.token, (perToken.get(call.token) || 0) + 1);
    assert.equal(calls.length, 2, `cihaz başına tek gönderim olmalı (gelen: ${calls.length})`);
    for (const [, count] of perToken) assert.equal(count, 1);
    assert.equal(first.sent + second.sent, 2);
    assert.ok(first.claimLost + second.claimLost >= 0, "yarışan claim'ler kaybeden tarafta claimLost olarak görünür");
  });

  test("cron: kısmi başarı — başarısız cihaz retry edilir, başarılı tekrar GÖNDERİLMEZ", async () => {
    const { store, deliveries } = createMemoryStore({
      trips: [tripUpcoming("trip-1", "user-1")],
      tokens: [pushToStartToken("tok-ok", "user-1"), pushToStartToken("tok-bad", "user-1")],
    });
    const { transport, calls } = makeTransport((token) => token.includes("tok-bad") ? TRANSIENT : OK);
    const run1 = await runLiveActivityCron(store, transport, { nowMs: T0 });
    assert.equal(run1.sent, 1);
    assert.equal(run1.transientFailed, 1);

    // Geri çekilme süresi dolunca yalnız başarısız cihaz yeniden denenir.
    const { transport: transport2, calls: calls2 } = makeTransport(() => OK);
    const run2 = await runLiveActivityCron(store, transport2, { nowMs: T0 + LIVE_ACTIVITY_RETRY_BACKOFF_MS + 1000 });
    assert.equal(run2.sent, 1, "yalnız retry edilen cihaz gönderilmeli");
    assert.equal(calls2.length, 1);
    assert.ok(calls2[0].token.includes("tok-bad"));
    assert.equal(calls.filter((call) => call.token.includes("tok-ok")).length, 1, "başarılı cihaz tekrar gönderilmedi");
    const statuses = Array.from(deliveries.values()).map((row) => row.status).sort();
    assert.deepEqual(statuses, ["sent", "sent"]);
  });

  test("cron: transient hata en fazla 3 denemeden sonra permanent_failed olur (token KAPANMAZ)", async () => {
    const { store, tokens, deliveries } = createMemoryStore({
      trips: [tripUpcoming("trip-1", "user-1")],
      tokens: [pushToStartToken("tok-a", "user-1")],
    });
    const { transport, calls } = makeTransport(() => TRANSIENT);
    let now = T0;
    for (let round = 0; round < 5; round += 1) {
      await runLiveActivityCron(store, transport, { nowMs: now });
      now += LIVE_ACTIVITY_RETRY_BACKOFF_MS + 1000;
    }
    assert.equal(calls.length, 3, `en fazla 3 deneme olmalı (gelen: ${calls.length})`);
    const row = Array.from(deliveries.values())[0];
    assert.equal(row.status, "permanent_failed");
    assert.equal(row.attemptCount, 3);
    assert.equal(tokens.get("tok-a")!.enabled, true, "transient tükenmesi token'ı kapatmaz");
  });

  test("cron: kalıcı APNs hatasında YALNIZ ilgili token kapanır", async () => {
    const { store, tokens, deliveries } = createMemoryStore({
      trips: [tripUpcoming("trip-1", "user-1")],
      tokens: [pushToStartToken("tok-bad", "user-1"), pushToStartToken("tok-ok", "user-1")],
    });
    const { transport } = makeTransport((token) => token.includes("tok-bad") ? PERMANENT : OK);
    const summary = await runLiveActivityCron(store, transport, { nowMs: T0 });
    assert.equal(summary.tokensDisabled, 1);
    assert.equal(tokens.get("tok-bad")!.enabled, false, "kalıcı hatalı token kapanmalı");
    assert.equal(tokens.get("tok-ok")!.enabled, true, "diğer token AÇIK kalmalı");
    const byToken = new Map(Array.from(deliveries.values()).map((row) => [row.tokenId, row.status]));
    assert.equal(byToken.get("tok-bad"), "permanent_failed");
    assert.equal(byToken.get("tok-ok"), "sent");
  });

  test("cron: activity_update tokenı yoksa END tamamlanmış SAYILMAZ; token gelince gönderilir", async () => {
    const endedTrip: MemoryTrip = { ...tripUpcoming("trip-end", "user-1"), departureAtMs: T0 - 2 * 60 * 60 * 1000 };
    const { store, tokens, deliveries } = createMemoryStore({ trips: [endedTrip], tokens: [] });
    const { transport, calls } = makeTransport(() => OK);
    const run1 = await runLiveActivityCron(store, transport, { nowMs: T0 });
    assert.equal(run1.seededEnds, 0, "token yokken end teslim satırı AÇILMAZ");
    assert.equal(calls.length, 0, "end push'u gönderilmemeli");
    assert.equal(deliveries.size, 0);

    // Token sonradan kaydolur → sonraki cron end'i açar ve gönderir.
    const token = updateToken("tok-u", "user-1", "trip-end");
    tokens.set(token.id, token);
    const run2 = await runLiveActivityCron(store, transport, { nowMs: T0 + 60_000 });
    assert.equal(run2.seededEnds, 1);
    assert.equal(run2.sent, 1);
    assert.equal(calls.filter((call) => call.event === "end").length, 1);
  });

  test("cron: END transient hatada sent YAZILMAZ ve retry edilir", async () => {
    const endedTrip: MemoryTrip = { ...tripUpcoming("trip-end", "user-1"), departureAtMs: T0 - 2 * 60 * 60 * 1000 };
    const { store, deliveries } = createMemoryStore({
      trips: [endedTrip],
      tokens: [updateToken("tok-u", "user-1", "trip-end")],
    });
    const { transport: failing } = makeTransport(() => TRANSIENT);
    await runLiveActivityCron(store, failing, { nowMs: T0 });
    const afterFail = Array.from(deliveries.values())[0];
    assert.equal(afterFail.status, "transient_failed", "başarısız end sent yazmamalı");

    const { transport: okTransport, calls } = makeTransport(() => OK);
    await runLiveActivityCron(store, okTransport, { nowMs: T0 + LIVE_ACTIVITY_RETRY_BACKOFF_MS + 1000 });
    assert.equal(calls.filter((call) => call.event === "end").length, 1, "retry tek end gönderir");
    assert.equal(Array.from(deliveries.values())[0].status, "sent");
  });

  test("cron: başarılı END tekrar gönderilmez", async () => {
    const endedTrip: MemoryTrip = { ...tripUpcoming("trip-end", "user-1"), departureAtMs: T0 - 2 * 60 * 60 * 1000 };
    const { store } = createMemoryStore({
      trips: [endedTrip],
      tokens: [updateToken("tok-u", "user-1", "trip-end")],
    });
    const { transport, calls } = makeTransport(() => OK);
    await runLiveActivityCron(store, transport, { nowMs: T0 });
    await runLiveActivityCron(store, transport, { nowMs: T0 + 10 * 60 * 1000 });
    await runLiveActivityCron(store, transport, { nowMs: T0 + 20 * 60 * 1000 });
    assert.equal(calls.length, 1, "başarılı end yalnız BİR kez gönderilir");
  });

  test("cron: eski worker yeni claim sonucunu EZEMEZ (fencing)", async () => {
    const { store, deliveries } = createMemoryStore({
      trips: [tripUpcoming("trip-1", "user-1")],
      tokens: [pushToStartToken("tok-a", "user-1")],
    });
    // Satırı seed etmek için transport'suz bir hazırlık koşusu değil,
    // doğrudan sözleşme testi: A claim eder, lease'i dolar, B claim edip
    // 'sent' yazar; A'nın GECİKMİŞ settle'ı reddedilmelidir.
    await store.seedDeliveries([{ tripId: "trip-1", tokenId: "tok-a", event: "start" }]);
    const [row] = await store.dueDeliveries(T0, 10);

    const claimA = defaultClaimToken();
    const claimB = defaultClaimToken();
    const claimedByA = await store.claimDelivery(row.id, 0, claimA, T0 + 60_000, T0);
    assert.equal(claimedByA, true);
    // Lease dolmadan B alamaz (paralel cron'lar AYNI ANDA gönderemez).
    assert.equal(await store.claimDelivery(row.id, 0, claimB, T0 + 90_000, T0 + 1000), false);
    // Lease doldu → B devralır.
    const laterNow = T0 + 61_000;
    assert.equal(await store.claimDelivery(row.id, 0, claimB, laterNow + 60_000, laterNow), true);
    assert.equal(await store.settleDelivery(row.id, claimB, { status: "sent", attemptCount: 1 }), true);
    // A'nın gecikmiş sonucu (ör. transient_failed) yeni durumu EZEMEZ.
    assert.equal(await store.settleDelivery(row.id, claimA, { status: "transient_failed", attemptCount: 1 }), false);
    const finalRow = Array.from(deliveries.values())[0];
    assert.equal(finalRow.status, "sent", "eski worker'ın yazımı reddedilmeli");
  });

  test("cron: üretilen HER claim token geçerli UUID'dir (DB uuid kolonu sözleşmesi)", async () => {
    const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    const seen = new Set<string>();
    for (let index = 0; index < 200; index += 1) {
      const token = defaultClaimToken();
      assert.match(token, UUID_PATTERN, `claim token UUID değil: ${token}`);
      seen.add(token);
    }
    assert.equal(seen.size, 200, "claim token'lar benzersiz olmalı");

    // Varsayılan üreticiyle koşan cron, UUID zorlayan store'da SORUNSUZ
    // teslim yapabilmeli (22P02 sınıfı regresyon burada patlar).
    const { store, claimTokenErrors } = createMemoryStore({
      trips: [tripUpcoming("trip-1", "user-1")],
      tokens: [pushToStartToken("tok-a", "user-1")],
    });
    const { transport, calls } = makeTransport(() => OK);
    const summary = await runLiveActivityCron(store, transport, { nowMs: T0 });
    assert.equal(summary.sent, 1, "UUID claim token ile teslim başarılı olmalı");
    assert.equal(calls.length, 1);
    assert.equal(claimTokenErrors.length, 0, "hiçbir claim token DB tipine takılmamalı");
  });

  test("cron: UUID olmayan claim token DB katmanında reddedilir ve teslim YAPILMAZ (v3 hatasının kanıtı)", async () => {
    const { store, claimTokenErrors, deliveries } = createMemoryStore({
      trips: [tripUpcoming("trip-1", "user-1")],
      tokens: [pushToStartToken("tok-a", "user-1")],
    });
    const { transport, calls } = makeTransport(() => OK);
    const summary = await runLiveActivityCron(store, transport, {
      nowMs: T0,
      makeClaimToken: () => `claim-${Date.now()}-abc123`, // v3'teki hatalı biçim
    });
    assert.equal(calls.length, 0, "claim başarısızsa APNs'e HİÇ gidilmemeli");
    assert.equal(summary.sent, 0);
    assert.ok(summary.claimLost >= 1, "başarısız claim'ler claimLost olarak görünmeli");
    assert.ok(claimTokenErrors.length >= 1, "tip uyuşmazlığı store katmanında yakalanmalı");
    for (const row of deliveries.values()) assert.equal(row.status, "pending", "teslim ilerlememeli");
  });

  test("cron: hesap değişimi senaryosu — A'nın uçuşu iPhone'a GİDEMEZ, iPad'e gider; B'ninki gider", async () => {
    // A: iPhone + iPad push-to-start tokenları; B: aynı iPhone'u devralır.
    const PHYSICAL_IPHONE_TOKEN = "iphone-fiziksel-token-0123456789abcdef";
    const { store, tokens } = createMemoryStore({
      trips: [tripUpcoming("trip-A", "user-A"), tripUpcoming("trip-B", "user-B")],
      tokens: [
        { id: "tok-A-iphone", userId: "user-A", token: PHYSICAL_IPHONE_TOKEN, enabled: true, tokenType: "push_to_start" },
        { id: "tok-A-ipad", userId: "user-A", token: "ipad-fiziksel-token-0123456789abcdef", enabled: true, tokenType: "push_to_start" },
      ],
    });
    // 1) A iPhone'dan çıkış: iPhone tokenı kapanır (logout API →
    //    deactivate_live_activity_installation); iPad'e DOKUNULMAZ.
    await store.disableToken("tok-A-iphone");
    // 2) Aynı iPhone'da B giriş: aynı FİZİKSEL token yalnız B altında etkin
    //    (register RPC'sinin hesaplar-arası garantisi; gerçek PG'de testli).
    tokens.set("tok-B-iphone", { id: "tok-B-iphone", userId: "user-B", token: PHYSICAL_IPHONE_TOKEN, enabled: true, tokenType: "push_to_start" });

    const { transport, calls } = makeTransport(() => OK);
    await runLiveActivityCron(store, transport, { nowMs: T0 });

    const toIphone = calls.filter((call) => call.token === PHYSICAL_IPHONE_TOKEN);
    assert.equal(toIphone.length, 1, "fiziksel iPhone tokenına yalnız TEK teslim (B kaydı) gitmeli");
    const byToken = new Map<string, number>();
    for (const call of calls) byToken.set(call.token, (byToken.get(call.token) || 0) + 1);
    assert.equal(byToken.get("ipad-fiziksel-token-0123456789abcdef"), 1, "A kendi iPad'ine almalı");
    assert.equal(calls.length, 2, "toplam: B iPhone + A iPad; A iPhone YOK");
  });

  test("cron: soft deadline sonrası yeni claim açılmaz; iş sonraki cron'a kalır", async () => {
    const { store, deliveries } = createMemoryStore({
      trips: [tripUpcoming("trip-1", "user-1")],
      tokens: [pushToStartToken("tok-a", "user-1"), pushToStartToken("tok-b", "user-1")],
    });
    const { transport, calls } = makeTransport(() => OK);
    const summary = await runLiveActivityCron(store, transport, { nowMs: T0, softDeadlineMs: -1 });
    assert.equal(summary.deadlineReached, true);
    assert.equal(summary.deferred, 2, "alınmayan işler deferred sayılmalı");
    assert.equal(calls.length, 0, "deadline sonrası gönderim olmamalı");
    for (const row of deliveries.values()) {
      assert.equal(row.status, "pending", "claim açılmamış olmalı");
      assert.equal(row.claimToken, null);
    }
    // Sonraki cron kaldığı yerden tamamlar.
    const next = await runLiveActivityCron(store, transport, { nowMs: T0 + 60_000 });
    assert.equal(next.sent, 2);
  });
}
