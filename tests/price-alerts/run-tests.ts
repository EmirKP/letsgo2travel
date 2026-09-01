/* eslint-disable @typescript-eslint/no-this-alias */
// =====================================================================
// Fiyat alarmı + push bildirim testleri (sağlayıcılar MOCK'lanır;
// hiçbir gerçek e-posta/push gönderimi veya ağ çağrısı yapılmaz).
// Çalıştırma: npm run test:alerts
// =====================================================================

import assert from "node:assert";
import {
  buildAlertEventKey,
  buildPriceDropPushMessage,
  classifyPushFailure,
  shouldNotifyForPrice,
} from "../../lib/price-alerts";
import { disablePushDevices, sendPushToUser } from "../../lib/push";
import { runPriceAlertCheck, settleAlertNotification } from "../../lib/price-alert-cron";

type Row = Record<string, any>;

// ---------------------------------------------------------------------
// Mock Supabase: cron ve push katmanının kullandığı zincirleri destekler.
// ---------------------------------------------------------------------
class MockSupabase {
  tables: Record<string, Row[]> = {
    flight_price_alerts: [],
    flight_price_alert_logs: [],
    flight_price_alert_notifications: [],
    push_devices: [],
    mail_delivery_logs: [],
  };

  private claimSeq = 0;

  from(table: string) {
    const self = this;
    const state: { filters: Array<(r: Row) => boolean>; op: string; payload?: Row } = { filters: [], op: "select" };

    const builder: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count === "exact") state.op = "count";
        return builder;
      },
      order() { return builder; },
      limit() { return builder; },
      or(expr: string) {
        // "notify_email.eq.true,notify_push.eq.true"
        const parts = expr.split(",").map((p) => p.split(".eq."));
        state.filters.push((r) => parts.some(([col, val]) => String(r[col]) === val));
        return builder;
      },
      in(col: string, values: any[]) {
        state.filters.push((r) => values.includes(r[col]));
        return builder;
      },
      eq(col: string, value: any) {
        state.filters.push((r) => r[col] === value);
        return builder;
      },
      neq(col: string, value: any) {
        state.filters.push((r) => r[col] !== value);
        return builder;
      },
      lt(col: string, value: any) {
        state.filters.push((r) => Number(r[col]) < Number(value));
        return builder;
      },
      update(payload: Row) { state.op = "update"; state.payload = payload; return builder; },
      insert(payload: Row) { state.op = "insert"; state.payload = payload; return builder; },
      then(resolve: (v: any) => void) {
        const rows = self.tables[table] || [];
        if (state.op === "insert") {
          const row: Row = { id: `${table}-${rows.length + 1}`, ...state.payload };
          if (table === "flight_price_alert_notifications") {
            const dup = rows.find((r) =>
              r.alert_id === row.alert_id && r.channel === row.channel && r.event_key === row.event_key);
            if (dup) return resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
          }
          rows.push(row);
          return resolve({ data: row, error: null });
        }
        const matched = rows.filter((r) => state.filters.every((f) => f(r)));
        if (state.op === "count") {
          return resolve({ data: null, error: null, count: matched.length });
        }
        if (state.op === "update") {
          for (const r of matched) Object.assign(r, state.payload);
          return resolve({ data: matched, error: null });
        }
        return resolve({ data: matched, error: null });
      },
    };
    return builder;
  }

  // Atomik claim RPC'sinin mock'u: gercek SQL fonksiyonuyla ayni semantik,
  // JS tarafinda SENKRON calisir (paralel cron testinde yaris penceresi yok).
  // v3: basarili claim'de FENCING token'i doner (claim edilemezse null);
  // stale pending de attempt sinirina tabidir; olay snapshot'i
  // (event_price/event_currency) yalniz ILK kayitta yazilir, reclaim EZMEZ.
  async rpc(name: string, params: Record<string, any>) {
    if (name === "mark_alert_notified") {
      // Gercek SQL fonksiyonuyla ayni semantik: least(fiyat) / greatest(zaman).
      const alert = this.tables.flight_price_alerts.find((r) => r.id === params.p_alert_id);
      if (alert) {
        const price = Number(params.p_event_price);
        const at = typeof params.p_notified_at === "string" ? params.p_notified_at : new Date().toISOString();
        alert.last_notified_price = alert.last_notified_price != null
          ? Math.min(Number(alert.last_notified_price), price)
          : price;
        alert.last_notified_at = alert.last_notified_at && alert.last_notified_at > at
          ? alert.last_notified_at
          : at;
        alert.status = "triggered";
        alert.last_error_message = null;
        alert.last_error_at = null;
        alert.error_count = 0;
      }
      return { data: null, error: null };
    }
    if (name !== "claim_alert_notification") return { data: null, error: { message: `bilinmeyen rpc: ${name}` } };
    const rows = this.tables.flight_price_alert_notifications;
    const maxAttempts = params.p_max_attempts ?? 3;
    const ttlMs = (params.p_pending_ttl_seconds ?? 600) * 1000;
    const nowMs = Date.now();
    this.claimSeq += 1;
    const token = `claim-token-${this.claimSeq}`;
    const existing = rows.find((r) =>
      r.alert_id === params.p_alert_id && r.channel === params.p_channel && r.event_key === params.p_event_key);
    if (!existing) {
      rows.push({
        id: `fpan-${rows.length + 1}`,
        alert_id: params.p_alert_id,
        channel: params.p_channel,
        event_key: params.p_event_key,
        status: "pending",
        attempt_count: 1,
        last_attempt_at: new Date(nowMs).toISOString(),
        failure_kind: null,
        next_retry_at: null,
        claim_token: token,
        event_price: params.p_event_price ?? null,
        event_currency: params.p_event_currency ?? null,
      });
      return { data: token, error: null };
    }
    const lastAttempt = existing.last_attempt_at ? Date.parse(existing.last_attempt_at) : 0;
    const nextRetry = existing.next_retry_at ? Date.parse(existing.next_retry_at) : 0;
    const claimable =
      (existing.status === "pending"
        && existing.attempt_count < maxAttempts
        && (!lastAttempt || lastAttempt < nowMs - ttlMs)) ||
      (existing.status === "failed" && existing.failure_kind === "transient"
        && existing.attempt_count < maxAttempts
        && (!nextRetry || nextRetry <= nowMs));
    if (!claimable) return { data: null, error: null };
    existing.status = "pending";
    existing.attempt_count += 1;
    existing.last_attempt_at = new Date(nowMs).toISOString();
    existing.claim_token = token;
    return { data: token, error: null };
  }
}

function makeAlert(overrides: Row = {}): Row {
  return {
    id: `alert-${Math.random().toString(36).slice(2, 8)}`,
    user_id: "user-1",
    email: "test-alarm@example.com",
    origin_code: "IST",
    origin_label: "İstanbul",
    destination_code: "LHR",
    destination_label: "Londra",
    departure_date: "2026-10-10",
    return_date: null,
    trip_type: "one_way",
    cabin_class: "economy",
    currency: "TRY",
    base_price: 5000,
    target_price: 3000,
    threshold_percent: 5,
    last_checked_price: null,
    lowest_price_seen: null,
    last_notified_price: null,
    last_notified_at: null,
    notify_email: true,
    notify_push: false,
    is_active: true,
    status: "active",
    error_count: 0,
    ...overrides,
  };
}

const mockPriceOk = async () => ({ price: 2500, currency: "TRY" });
const mailOk = async () => ({ success: true, providerId: "mock-mail-1" });
const mailFail = async () => ({ success: false, providerId: null, error: "mock mail hatasi" });
const pushOk = async () => ({ attempted: 1, sent: 1, failed: 0, disabledTokens: 0, skippedUnconfigured: 0, errors: [] });
const pushFail = async () => ({ attempted: 1, sent: 0, failed: 1, disabledTokens: 0, skippedUnconfigured: 0, errors: [{ platform: "ios", reason: "apns_503" }] });

const tests: Array<[string, () => Promise<void> | void]> = [];
function test(name: string, fn: () => Promise<void> | void) { tests.push([name, fn]); }

// ------------------------- saf fonksiyonlar --------------------------

test("shouldNotifyForPrice: hedef fiyata dusunce bildirir", () => {
  assert.equal(shouldNotifyForPrice({ alert: makeAlert(), currentPrice: 2900, basePrice: 5000 }), true);
});

test("shouldNotifyForPrice: son 24 saatte bildirim varsa tekrar bildirmez", () => {
  const alert = makeAlert({ last_notified_at: new Date().toISOString(), last_notified_price: 2900 });
  assert.equal(shouldNotifyForPrice({ alert, currentPrice: 2500, basePrice: 5000 }), false);
});

test("shouldNotifyForPrice: fiyat son bildirilen fiyatin altinda degilse bildirmez", () => {
  const old = new Date(Date.now() - 48 * 3600 * 1000).toISOString();
  const alert = makeAlert({ last_notified_at: old, last_notified_price: 2400 });
  assert.equal(shouldNotifyForPrice({ alert, currentPrice: 2900, basePrice: 5000 }), false);
});

test("shouldNotifyForPrice: hedef yoksa yuzde esigi calisir", () => {
  const alert = makeAlert({ target_price: null, threshold_percent: 10 });
  assert.equal(shouldNotifyForPrice({ alert, currentPrice: 4400, basePrice: 5000 }), true);
  assert.equal(shouldNotifyForPrice({ alert, currentPrice: 4600, basePrice: 5000 }), false);
});

test("buildAlertEventKey: ayni olay ayni anahtari uretir", () => {
  const a = buildAlertEventKey({ departureDate: "2026-10-10", currentPrice: 2500.4, currency: "try" });
  const b = buildAlertEventKey({ departureDate: "2026-10-10", currentPrice: 2500, currency: "TRY" });
  assert.equal(a, b);
  assert.equal(a, "2026-10-10:2500:TRY");
});

test("classifyPushFailure: gecersiz token temizlige gider, gecici hata gitmez", () => {
  assert.equal(classifyPushFailure("apns_410").shouldDisableToken, true);
  assert.equal(classifyPushFailure("apns_BadDeviceToken").shouldDisableToken, true);
  assert.equal(classifyPushFailure("fcm_UNREGISTERED").shouldDisableToken, true);
  assert.equal(classifyPushFailure("apns_timeout").shouldDisableToken, false);
  assert.equal(classifyPushFailure("fcm_network_error").shouldDisableToken, false);
});

test("buildPriceDropPushMessage: rota/tarih icerir, arama imasi icermez", () => {
  const m = buildPriceDropPushMessage({ originLabel: "İstanbul", destinationLabel: "Londra", departureDate: "2026-10-10" });
  assert.equal(m.title, "Fiyat alarmın tetiklendi ✈️");
  assert.ok(m.body.includes("İstanbul → Londra"));
  assert.ok(m.body.includes("2026-10-10"));
  assert.ok(!/ara\b|karşılaştır/i.test(m.body));
  assert.equal(m.data?.screen, "price-alerts");
});

// ------------------------- sendPushToUser ----------------------------

test("sendPushToUser: gecerli token gonderir, gecersiz token devre disi birakilir", async () => {
  const db = new MockSupabase();
  db.tables.push_devices.push(
    { id: "d1", user_id: "user-1", platform: "ios", device_token: "tok-valid-000000000000", enabled: true },
    { id: "d2", user_id: "user-1", platform: "android", device_token: "tok-dead-000000000000", enabled: true },
  );
  const transport = async (device: any) =>
    device.id === "d1"
      ? { ok: true, shouldDisableToken: false }
      : { ok: false, shouldDisableToken: true, reason: "fcm_UNREGISTERED" };
  const summary = await sendPushToUser(db as any, "user-1", { title: "t", body: "b" }, transport as any);
  assert.equal(summary.sent, 1);
  assert.equal(summary.failed, 1);
  assert.equal(summary.disabledTokens, 1);
  const dead = db.tables.push_devices.find((d) => d.id === "d2");
  assert.equal(dead?.enabled, false);
  const alive = db.tables.push_devices.find((d) => d.id === "d1");
  assert.equal(alive?.enabled, true);
  // token degeri hata listesinde yer almamali
  assert.ok(!JSON.stringify(summary.errors).includes("tok-dead"));
});

test("sendPushToUser: transport istisnasi cokme yaratmaz", async () => {
  const db = new MockSupabase();
  db.tables.push_devices.push({ id: "d1", user_id: "user-1", platform: "ios", device_token: "tok-x-0000000000000000", enabled: true });
  const summary = await sendPushToUser(db as any, "user-1", { title: "t", body: "b" }, (async () => { throw new Error("boom"); }) as any);
  assert.equal(summary.failed, 1);
  assert.equal(summary.sent, 0);
});

test("sendPushToUser: aktif cihaz yoksa deneme yapilmaz", async () => {
  const db = new MockSupabase();
  const summary = await sendPushToUser(db as any, "user-1", { title: "t", body: "b" });
  assert.equal(summary.attempted, 0);
});

// ------------------------- cron entegrasyonu -------------------------

function seedDevice(db: MockSupabase, userId = "user-1") {
  db.tables.push_devices.push({ id: `d-${db.tables.push_devices.length + 1}`, user_id: userId, platform: "ios", device_token: "tok-seed-0000000000000000", enabled: true });
}

async function runCron(db: MockSupabase, deps: Record<string, any>) {
  return runPriceAlertCheck({
    deps: {
      supabase: db as any,
      fetchPrice: mockPriceOk as any,
      isEmailConfigured: () => true,
      pushConfig: () => ({ apns: true, fcm: true }),
      ...deps,
    },
  });
}

test("cron: e-posta kanali basariyla bildirir ve idempotency kaydi olusur", async () => {
  const db = new MockSupabase();
  const alert = makeAlert();
  db.tables.flight_price_alerts.push(alert);
  const result = await runCron(db, { sendMail: mailOk, sendPush: pushOk });
  assert.equal(result.notifiedAlerts, 1);
  assert.equal(alert.status, "triggered");
  assert.equal(alert.last_notified_price, 2500);
  const notif = db.tables.flight_price_alert_notifications;
  assert.equal(notif.length, 1);
  assert.equal(notif[0].channel, "email");
  assert.equal(notif[0].status, "sent");
});

test("cron: 'sent' olay bir daha ASLA gonderilmez", async () => {
  const db = new MockSupabase();
  const alert = makeAlert();
  db.tables.flight_price_alerts.push(alert);
  db.tables.flight_price_alert_notifications.push({ id: "n1", alert_id: alert.id, channel: "email", event_key: "2026-10-10:2500:TRY", status: "sent", attempt_count: 1, last_attempt_at: new Date(0).toISOString(), failure_kind: null, next_retry_at: null });
  let mailCalls = 0;
  const mailSpy = async () => { mailCalls += 1; return { success: true, providerId: "x" }; };
  const result = await runCron(db, { sendMail: mailSpy, sendPush: pushOk });
  assert.equal(mailCalls, 0, "ayni olay icin e-posta tekrar gonderilmemeli");
  assert.equal(result.notifiedAlerts, 0);
});

test("cron: PARALEL iki calisma ayni olay icin tek e-posta gonderir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert();
  db.tables.flight_price_alerts.push(alert);
  let mailCalls = 0;
  const slowMail = async () => {
    mailCalls += 1;
    await new Promise((r) => setTimeout(r, 30)); // yavas saglayici: yaris penceresi ac
    return { success: true, providerId: "x" };
  };
  const [r1, r2] = await Promise.all([
    runCron(db, { sendMail: slowMail, sendPush: pushOk }),
    runCron(db, { sendMail: slowMail, sendPush: pushOk }),
  ]);
  assert.equal(mailCalls, 1, "paralel cronlarda e-posta tam 1 kez gitmeli");
  assert.equal((r1.notifiedAlerts + r2.notifiedAlerts), 1);
});

test("cron: taze 'pending' baska cron tarafindan alinamaz; suresi gecen alinir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert();
  db.tables.flight_price_alerts.push(alert);
  // taze pending
  db.tables.flight_price_alert_notifications.push({ id: "n1", alert_id: alert.id, channel: "email", event_key: "2026-10-10:2500:TRY", status: "pending", attempt_count: 1, last_attempt_at: new Date().toISOString(), failure_kind: null, next_retry_at: null });
  let mailCalls = 0;
  const mailSpy = async () => { mailCalls += 1; return { success: true, providerId: "x" }; };
  await runCron(db, { sendMail: mailSpy, sendPush: pushOk });
  assert.equal(mailCalls, 0, "taze pending devralinmamali");
  // suresi gecmis pending
  db.tables.flight_price_alert_notifications[0].last_attempt_at = new Date(Date.now() - 3600 * 1000).toISOString();
  await runCron(db, { sendMail: mailSpy, sendPush: pushOk });
  assert.equal(mailCalls, 1, "suresi gecen pending devralinmali");
});

test("cron: gecici hatada en fazla 3 deneme yapilir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert();
  db.tables.flight_price_alerts.push(alert);
  let mailCalls = 0;
  const failMail = async () => { mailCalls += 1; return { success: false, providerId: null, error: "gecici hata" }; };
  for (let i = 0; i < 5; i += 1) {
    // her turda retry suresini gecmis kabul et
    const row = db.tables.flight_price_alert_notifications[0];
    if (row) { row.next_retry_at = new Date(0).toISOString(); }
    await runCron(db, { sendMail: failMail, sendPush: pushOk });
  }
  assert.equal(mailCalls, 3, "gecici hatada deneme siniri 3 olmali");
  const row = db.tables.flight_price_alert_notifications[0];
  assert.equal(row.status, "failed");
  assert.equal(row.attempt_count, 3);
});

test("cron: KALICI push hatasi tekrar denenmez; cihaz kapatilir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_email: false, notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  let pushCalls = 0;
  const permFailPush = async () => { pushCalls += 1; return { attempted: 1, sent: 0, failed: 1, disabledTokens: 1, errors: [{ platform: "ios", reason: "apns_BadDeviceToken" }] }; };
  await runCron(db, { sendMail: mailOk, sendPush: permFailPush });
  const row = db.tables.flight_price_alert_notifications.find((n) => n.channel === "push");
  assert.equal(row?.status, "failed");
  assert.equal(row?.failure_kind, "permanent");
  // cihaz hala kayitli gorunse bile kalici hata claim edilemez:
  const row2 = db.tables.flight_price_alert_notifications[0];
  row2.next_retry_at = new Date(0).toISOString();
  await runCron(db, { sendMail: mailOk, sendPush: permFailPush });
  assert.equal(pushCalls, 1, "kalici hata sonrasi push tekrar denenmemeli");
});

test("cron: push yapilandirilmamissa olay TUKETILMEZ, sonra gonderilir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_email: false, notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  // 1. tur: push yapilandirilmamis -> claim yok
  await runCron(db, { sendMail: mailOk, sendPush: pushOk, pushConfig: () => ({ apns: false, fcm: false }) });
  assert.equal(db.tables.flight_price_alert_notifications.length, 0, "yapilandirilmamis kanal olay tuketmemeli");
  const skipLog = db.tables.flight_price_alert_logs.find((l) => l.status === "push_skipped_not_configured");
  assert.ok(skipLog, "push_skipped_not_configured logu olmali");
  // 2. tur: yapilandirildi -> gonderilir
  const result = await runCron(db, { sendMail: mailOk, sendPush: pushOk });
  assert.equal(result.notifiedAlerts, 1);
});

test("cron: aktif cihaz yoksa olay TUKETILMEZ; cihaz gelince gonderilir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_email: false, notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  await runCron(db, { sendMail: mailOk, sendPush: pushOk });
  assert.equal(db.tables.flight_price_alert_notifications.length, 0, "cihazsiz push olay tuketmemeli");
  seedDevice(db);
  const result = await runCron(db, { sendMail: mailOk, sendPush: pushOk });
  assert.equal(result.notifiedAlerts, 1);
});

test("cron: e-posta BASARISIZKEN push calismaya devam eder", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  const result = await runCron(db, { sendMail: mailFail, sendPush: pushOk });
  assert.equal(result.notifiedAlerts, 1, "push kanali bildirmis olmali");
  assert.equal(alert.status, "triggered");
  assert.equal(alert.last_mail_status, "drop_failed");
  const pushLog = db.tables.flight_price_alert_logs.find((l) => l.status === "push_sent");
  assert.ok(pushLog, "push_sent logu olmali");
  const emailNotif = db.tables.flight_price_alert_notifications.find((n) => n.channel === "email");
  assert.equal(emailNotif?.status, "failed");
});

test("cron: push BASARISIZKEN e-posta calismaya devam eder", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  const result = await runCron(db, { sendMail: mailOk, sendPush: pushFail });
  assert.equal(result.notifiedAlerts, 1, "e-posta kanali bildirmis olmali");
  assert.equal(alert.status, "triggered");
  const pushLog = db.tables.flight_price_alert_logs.find((l) => l.status === "push_failed");
  assert.ok(pushLog, "push_failed logu olmali");
  const emailNotif = db.tables.flight_price_alert_notifications.find((n) => n.channel === "email");
  assert.equal(emailNotif?.status, "sent");
});

test("cron: anonim alarmda (user_id yok) push denenmez", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ user_id: null, notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  let pushCalls = 0;
  const pushSpy = async () => { pushCalls += 1; return pushOk(); };
  await runCron(db, { sendMail: mailOk, sendPush: pushSpy });
  assert.equal(pushCalls, 0);
});

test("cron: fiyat verisi yoksa sahte fiyat uretilmez, bildirim gitmez", async () => {
  const db = new MockSupabase();
  const alert = makeAlert();
  db.tables.flight_price_alerts.push(alert);
  let mailCalls = 0;
  const mailSpy = async () => { mailCalls += 1; return { success: true, providerId: "x" }; };
  const result = await runPriceAlertCheck({ deps: { supabase: db as any, fetchPrice: (async () => null) as any, sendMail: mailSpy as any, sendPush: pushOk as any } });
  assert.equal(mailCalls, 0);
  assert.equal(result.notifiedAlerts, 0);
  assert.equal(alert.last_checked_price, null, "sahte fiyat yazilmamali");
  const log = db.tables.flight_price_alert_logs.find((l) => String(l.status).startsWith("no_price"));
  assert.ok(log, "no_price logu olmali");
});

test("cron: yalniz push kanalli alarm secime girer ve push ile bildirir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_email: false, notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  let mailCalls = 0;
  const mailSpy = async () => { mailCalls += 1; return { success: true, providerId: "x" }; };
  const result = await runCron(db, { sendMail: mailSpy, sendPush: pushOk });
  assert.equal(mailCalls, 0, "e-posta kanali kapaliyken mail gitmemeli");
  assert.equal(result.notifiedAlerts, 1);
});

// ------------- v3 regresyon: kanal-bagimsiz retry kuyrugu -------------

test("v3: e-posta OK + push TRANSIENT — cooldown push retry'ini durdurmaz; e-posta 1'de kalir, push en fazla 3", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  let mailCalls = 0;
  let pushCalls = 0;
  const mailSpy = async () => { mailCalls += 1; return { success: true, providerId: "x" }; };
  const pushSpyFail = async () => { pushCalls += 1; return { attempted: 1, sent: 0, failed: 1, disabledTokens: 0, skippedUnconfigured: 0, errors: [{ platform: "ios", reason: "apns_503" }] }; };

  // 1. cron: e-posta 1 kez, push 1 kez (transient fail)
  await runCron(db, { sendMail: mailSpy, sendPush: pushSpyFail });
  assert.equal(mailCalls, 1);
  assert.equal(pushCalls, 1);
  const pushRow = db.tables.flight_price_alert_notifications.find((n) => n.channel === "push");
  assert.ok(pushRow, "push bildirim kaydi olusmali");
  assert.equal(pushRow.status, "failed");
  assert.equal(pushRow.failure_kind, "transient");
  assert.ok(alert.last_notified_at, "e-posta basarili: alarm cooldown'u baslamali");

  // 2. cron (retry zamani GELMEDEN): ikisi de tekrar gonderilmez
  await runCron(db, { sendMail: mailSpy, sendPush: pushSpyFail });
  assert.equal(mailCalls, 1, "retry zamani gelmeden e-posta tekrar gitmemeli");
  assert.equal(pushCalls, 1, "retry zamani gelmeden push tekrar denenmemeli");

  // 3. cron (retry zamani geldi): e-posta HALA 1, push toplam 2
  pushRow.next_retry_at = new Date(0).toISOString();
  const r3 = await runCron(db, { sendMail: mailSpy, sendPush: pushSpyFail });
  assert.equal(mailCalls, 1, "cooldown'a ragmen e-posta tekrar GITMEMELI");
  assert.equal(pushCalls, 2, "cooldown push retry'ini DURDURMAMALI: push 2. kez denenmeli");
  assert.equal(pushRow.attempt_count, 2);
  assert.equal(r3.retryProcessed, 1);

  // 4. cron: ucuncu transient deneme mumkun
  pushRow.next_retry_at = new Date(0).toISOString();
  await runCron(db, { sendMail: mailSpy, sendPush: pushSpyFail });
  assert.equal(pushCalls, 3, "3. transient deneme mumkun olmali");
  assert.equal(pushRow.attempt_count, 3);

  // 5. cron: dorduncu deneme YAPILMAZ
  pushRow.next_retry_at = new Date(0).toISOString();
  await runCron(db, { sendMail: mailSpy, sendPush: pushSpyFail });
  assert.equal(pushCalls, 3, "4. deneme yapilmamali");
  assert.equal(mailCalls, 1, "surec boyunca e-posta toplam 1 kalmali");
});

test("v3: push OK + e-posta TRANSIENT — push tekrar gonderilmez; e-posta en fazla 3 kez denenir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  let mailCalls = 0;
  let pushCalls = 0;
  const mailSpyFail = async () => { mailCalls += 1; return { success: false, providerId: null, error: "gecici smtp hatasi" }; };
  const pushSpyOk = async () => { pushCalls += 1; return { attempted: 1, sent: 1, failed: 0, disabledTokens: 0, skippedUnconfigured: 0, errors: [] }; };

  // 1. cron: push 1 (basarili), e-posta 1 (transient fail)
  await runCron(db, { sendMail: mailSpyFail, sendPush: pushSpyOk });
  assert.equal(pushCalls, 1);
  assert.equal(mailCalls, 1);
  const mailRow = db.tables.flight_price_alert_notifications.find((n) => n.channel === "email");
  const pushRow = db.tables.flight_price_alert_notifications.find((n) => n.channel === "push");
  assert.ok(mailRow, "e-posta bildirim kaydi olusmali");
  assert.ok(pushRow, "push bildirim kaydi olusmali");
  assert.equal(pushRow.status, "sent");
  assert.equal(mailRow.status, "failed");
  assert.equal(mailRow.failure_kind, "transient");
  assert.ok(alert.last_notified_at, "push basarili: cooldown baslamali");

  // 2. cron (retry zamani gelmeden): ikisi de gonderilmez
  await runCron(db, { sendMail: mailSpyFail, sendPush: pushSpyOk });
  assert.equal(pushCalls, 1, "basarili push ayni olay icin TEKRAR gonderilmemeli");
  assert.equal(mailCalls, 1);

  // 3-4. cron: e-posta retry (2. ve 3. deneme); push hep 1
  mailRow.next_retry_at = new Date(0).toISOString();
  await runCron(db, { sendMail: mailSpyFail, sendPush: pushSpyOk });
  assert.equal(mailCalls, 2, "cooldown e-posta retry'ini durdurmamali");
  assert.equal(pushCalls, 1);
  mailRow.next_retry_at = new Date(0).toISOString();
  await runCron(db, { sendMail: mailSpyFail, sendPush: pushSpyOk });
  assert.equal(mailCalls, 3);
  assert.equal(mailRow.attempt_count, 3);

  // 5. cron: dorduncu e-posta denemesi yapilmaz
  mailRow.next_retry_at = new Date(0).toISOString();
  await runCron(db, { sendMail: mailSpyFail, sendPush: pushSpyOk });
  assert.equal(mailCalls, 3, "e-posta 4. kez denenmemeli");
  assert.equal(pushCalls, 1, "push surec boyunca toplam 1 kalmali");
});

test("v3: fiyat degisse bile eski olayin transient kanali SNAPSHOT ile tamamlanir; basarili kanal yeni event sanilip tekrar gonderilmez", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  let mailCalls = 0;
  let pushCalls = 0;
  let lastPushSummaryOk = false;
  const mailSpy = async () => { mailCalls += 1; return { success: true, providerId: "x" }; };
  const pushSpy = async () => {
    pushCalls += 1;
    if (!lastPushSummaryOk) {
      lastPushSummaryOk = true; // ilk cagri fail, sonrakiler basarili
      return { attempted: 1, sent: 0, failed: 1, disabledTokens: 0, skippedUnconfigured: 0, errors: [{ platform: "ios", reason: "apns_timeout" }] };
    }
    return { attempted: 1, sent: 1, failed: 0, disabledTokens: 0, skippedUnconfigured: 0, errors: [] };
  };

  // 1. cron @2500: e-posta sent, push transient fail
  await runCron(db, { sendMail: mailSpy, sendPush: pushSpy });
  assert.equal(mailCalls, 1);
  assert.equal(pushCalls, 1);
  const pushRow = db.tables.flight_price_alert_notifications.find((n) => n.channel === "push");
  assert.ok(pushRow, "push bildirim kaydi olusmali");
  assert.equal(pushRow.event_key, "2026-10-10:2500:TRY");
  assert.equal(pushRow.event_price, 2500, "olay snapshot fiyati kaydedilmeli");

  // 2. cron: FIYAT DEGISTI (2300); push retry zamani geldi
  pushRow.next_retry_at = new Date(0).toISOString();
  const priceChanged = async () => ({ price: 2300, currency: "TRY" });
  const r2 = await runCron(db, { sendMail: mailSpy, sendPush: pushSpy, fetchPrice: priceChanged });
  assert.equal(pushCalls, 2, "eski olayin push retry'i fiyat degisse de TAMAMLANMALI");
  assert.equal(pushRow.status, "sent");
  assert.equal(pushRow.event_key, "2026-10-10:2500:TRY", "retry ORIJINAL olay anahtariyla tamamlanmali");
  assert.equal(r2.retrySent, 1);
  assert.equal(mailCalls, 1, "basarili e-posta kanali yeni event sanilip TEKRAR gonderilmemeli");
  const newEventRows = db.tables.flight_price_alert_notifications.filter((n) => String(n.event_key).includes("2300"));
  assert.equal(newEventRows.length, 0, "cooldown icinde yeni fiyat olayi ACILMAMALI");
  const retryLog = db.tables.flight_price_alert_logs.find((l) => l.status === "push_retry_sent");
  assert.equal(retryLog?.price, 2500, "retry logu snapshot fiyatini tasimali");
});

// ------------- v3 regresyon: stale pending attempt siniri -------------

test("v3: suresi gecmis pending attempt sinirini asamaz (2->3 bir kez; sonra asla)", async () => {
  const db = new MockSupabase();
  const staleIso = new Date(Date.now() - 3600 * 1000).toISOString();
  db.tables.flight_price_alert_notifications.push({
    id: "n1", alert_id: "a1", channel: "push", event_key: "2026-10-10:2500:TRY",
    status: "pending", attempt_count: 2, last_attempt_at: staleIso,
    failure_kind: null, next_retry_at: null, claim_token: "eski-token",
  });
  const row = db.tables.flight_price_alert_notifications[0];

  // stale + attempt=2 -> YALNIZ BIR KEZ claim edilir, attempt 3 olur
  const r1 = await db.rpc("claim_alert_notification", { p_alert_id: "a1", p_channel: "push", p_event_key: "2026-10-10:2500:TRY" });
  assert.ok(typeof r1.data === "string" && r1.data, "stale pending (attempt=2) claim edilebilmeli");
  assert.equal(row.attempt_count, 3);

  // tekrar stale hale gelse bile claim EDILMEZ (attempt=3 = sinir)
  row.last_attempt_at = staleIso;
  const r2 = await db.rpc("claim_alert_notification", { p_alert_id: "a1", p_channel: "push", p_event_key: "2026-10-10:2500:TRY" });
  assert.equal(r2.data, null, "attempt sinirina ulasan stale pending TEKRAR claim edilmemeli");
  assert.equal(row.attempt_count, 3, "attempt_count artmamali");

  // dogrudan attempt=3 ile stale pending: hic claim edilmez
  db.tables.flight_price_alert_notifications.push({
    id: "n2", alert_id: "a2", channel: "email", event_key: "2026-10-10:2500:TRY",
    status: "pending", attempt_count: 3, last_attempt_at: staleIso,
    failure_kind: null, next_retry_at: null, claim_token: "eski-token-2",
  });
  const r3 = await db.rpc("claim_alert_notification", { p_alert_id: "a2", p_channel: "email", p_event_key: "2026-10-10:2500:TRY" });
  assert.equal(r3.data, null, "attempt=3 stale pending HIC claim edilmemeli");
});

test("v3: retry kuyrugu da stale pending'i attempt siniri icinde tamamlar (cron uzerinden)", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_push: true, notify_email: false, last_notified_at: new Date().toISOString(), last_notified_price: 2500 });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  const staleIso = new Date(Date.now() - 3600 * 1000).toISOString();
  db.tables.flight_price_alert_notifications.push({
    id: "n1", alert_id: alert.id, channel: "push", event_key: "2026-10-10:2500:TRY",
    status: "pending", attempt_count: 3, last_attempt_at: staleIso,
    failure_kind: null, next_retry_at: null, claim_token: "olu-worker-token",
    event_price: 2500, event_currency: "TRY",
  });
  let pushCalls = 0;
  const pushSpy = async () => { pushCalls += 1; return { attempted: 1, sent: 1, failed: 0, disabledTokens: 0, skippedUnconfigured: 0, errors: [] }; };
  await runCron(db, { sendMail: mailOk, sendPush: pushSpy });
  assert.equal(pushCalls, 0, "attempt=3 stale pending retry kuyrugundan da DENENMEMELI");
});

// ---------------- v3 regresyon: fencing (eski worker) -----------------

test("v3: eski worker yeni claim'in 'sent' sonucunu EZEMEZ (fencing token)", async () => {
  const db = new MockSupabase();
  const alert = makeAlert();
  db.tables.flight_price_alerts.push(alert);

  // Cron A claim alir (henuz settle etmedi — yavas/askida kaldi)
  const rA = await db.rpc("claim_alert_notification", {
    p_alert_id: alert.id, p_channel: "email", p_event_key: "2026-10-10:2500:TRY",
    p_event_price: 2500, p_event_currency: "TRY",
  });
  const tokenA = rA.data as string;
  assert.ok(tokenA, "Cron A claim alabilmeli");
  const row = db.tables.flight_price_alert_notifications[0];

  // Claim stale hale gelir (A cevap vermiyor)
  row.last_attempt_at = new Date(Date.now() - 3600 * 1000).toISOString();

  // Cron B devralir ve BASARIYLA gonderir (retry kuyrugu yolu)
  let mailCalls = 0;
  const mailSpy = async () => { mailCalls += 1; return { success: true, providerId: "x" }; };
  await runCron(db, { sendMail: mailSpy, sendPush: pushOk });
  assert.equal(mailCalls, 1, "Cron B stale claim'i devralip gondermeli");
  assert.equal(row.status, "sent");
  assert.notEqual(row.claim_token, tokenA, "B'nin claim'i yeni token uretmis olmali");

  // Cron A GEC doner ve kendi (eski) token'iyla 'failed' yazmaya calisir
  await settleAlertNotification(db as any, { alertId: alert.id, channel: "email", eventKey: "2026-10-10:2500:TRY" }, tokenA, {
    ok: false, failureKind: "transient", errorMessage: "gec kalan eski worker",
  });
  assert.equal(row.status, "sent", "SON DURUM 'sent' KALMALI — eski worker ezememeli");
  assert.equal(row.error_message ?? null, null, "eski worker'in hata mesaji yazilmamis olmali");
});

// ------------- v3 regresyon: platform bazli push saglayici ------------

test("v3: Android-only cihaz + yalniz APNs -> claim yok, olay tuketilmez; FCM acilinca gonderilir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_email: false, notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  db.tables.push_devices.push({ id: "d-and", user_id: "user-1", platform: "android", device_token: "tok-android-000000000", enabled: true });
  let pushCalls = 0;
  let seenPlatforms: any = null;
  const pushSpy = async (_sb: any, _uid: any, _msg: any, _tr: any, opts: any) => {
    pushCalls += 1;
    seenPlatforms = opts?.platforms || null;
    return { attempted: 1, sent: 1, failed: 0, disabledTokens: 0, skippedUnconfigured: 0, errors: [] };
  };

  // Yalniz APNs yapilandirilmis: Android cihaza saglayici yok -> claim YOK
  await runCron(db, { sendMail: mailOk, sendPush: pushSpy, pushConfig: () => ({ apns: true, fcm: false }) });
  assert.equal(pushCalls, 0, "FCM yokken Android cihaza deneme yapilmamali");
  assert.equal(db.tables.flight_price_alert_notifications.length, 0, "olay CLAIM EDILMEMELI (tuketilmemeli)");
  const skipLog = db.tables.flight_price_alert_logs.find((l) => l.status === "push_skipped_not_configured");
  assert.ok(skipLog, "push_skipped_not_configured logu olmali");

  // FCM sonradan yapilandirilir -> bildirim gonderilir
  const result = await runCron(db, { sendMail: mailOk, sendPush: pushSpy, pushConfig: () => ({ apns: true, fcm: true }) });
  assert.equal(pushCalls, 1);
  assert.equal(result.notifiedAlerts, 1, "FCM acilinca ayni olay gonderilebilmeli");
  assert.deepEqual(seenPlatforms, ["android"], "gonderim yalniz uygun platforma hedeflenmeli");
});

test("v3: iOS-only cihaz + yalniz FCM -> claim yok; APNs acilinca gonderilir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_email: false, notify_push: true });
  db.tables.flight_price_alerts.push(alert);
  db.tables.push_devices.push({ id: "d-ios", user_id: "user-1", platform: "ios", device_token: "tok-ios-0000000000000", enabled: true });
  let pushCalls = 0;
  const pushSpy = async () => { pushCalls += 1; return { attempted: 1, sent: 1, failed: 0, disabledTokens: 0, skippedUnconfigured: 0, errors: [] }; };

  await runCron(db, { sendMail: mailOk, sendPush: pushSpy, pushConfig: () => ({ apns: false, fcm: true }) });
  assert.equal(pushCalls, 0, "APNs yokken iOS cihaza deneme yapilmamali");
  assert.equal(db.tables.flight_price_alert_notifications.length, 0, "olay tuketilmemeli");

  const result = await runCron(db, { sendMail: mailOk, sendPush: pushSpy, pushConfig: () => ({ apns: true, fcm: true }) });
  assert.equal(pushCalls, 1);
  assert.equal(result.notifiedAlerts, 1, "APNs acilinca gonderilebilmeli");
});

test("v3: karma cihazlar — yalniz yapilandirilmis platforma gonderilir; digeri deneme sayilmaz, disable edilmez", async () => {
  const db = new MockSupabase();
  db.tables.push_devices.push(
    { id: "d1", user_id: "user-1", platform: "ios", device_token: "tok-ios-0000000000000", enabled: true },
    { id: "d2", user_id: "user-1", platform: "android", device_token: "tok-and-0000000000000", enabled: true },
  );
  const sentTo: string[] = [];
  const transport = async (device: any) => { sentTo.push(device.platform); return { ok: true, shouldDisableToken: false }; };
  const summary = await sendPushToUser(db as any, "user-1", { title: "t", body: "b" }, transport as any, { platforms: ["ios"] });
  assert.deepEqual(sentTo, ["ios"], "yalniz yapilandirilmis platforma gonderilmeli");
  assert.equal(summary.attempted, 1, "yapilandirilmamis platform DENEME sayilmamali");
  assert.equal(summary.sent, 1);
  assert.equal(summary.skippedUnconfigured, 1);
  assert.equal(summary.failed, 0, "yapilandirilmamis platform basarisizlik sayilmamali");
  const androidRow = db.tables.push_devices.find((d) => d.id === "d2");
  assert.equal(androidRow?.enabled, true, "yapilandirilmamis platformdaki cihaz DISABLE edilmemeli");
});

test("v3: transient-failed push kaydi da saglayici yapilandirilinca retry kuyrugundan gonderilir", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_email: false, notify_push: true, last_notified_at: new Date().toISOString(), last_notified_price: 2500 });
  db.tables.flight_price_alerts.push(alert);
  db.tables.push_devices.push({ id: "d-and", user_id: "user-1", platform: "android", device_token: "tok-android-000000000", enabled: true });
  // Gecmiste transient fail olmus kayit (ornegin FCM o sirada dusmustu)
  db.tables.flight_price_alert_notifications.push({
    id: "n1", alert_id: alert.id, channel: "push", event_key: "2026-10-10:2500:TRY",
    status: "failed", attempt_count: 1, last_attempt_at: new Date(Date.now() - 3600e3).toISOString(),
    failure_kind: "transient", next_retry_at: new Date(0).toISOString(), claim_token: "t-eski",
    event_price: 2500, event_currency: "TRY",
  });
  let pushCalls = 0;
  const pushSpy = async () => { pushCalls += 1; return { attempted: 1, sent: 1, failed: 0, disabledTokens: 0, skippedUnconfigured: 0, errors: [] }; };

  // FCM hala yok: kayit KUYRUKTA KALIR, claim/attempt harcanmaz
  await runCron(db, { sendMail: mailOk, sendPush: pushSpy, pushConfig: () => ({ apns: true, fcm: false }) });
  assert.equal(pushCalls, 0);
  const row = db.tables.flight_price_alert_notifications[0];
  assert.equal(row.attempt_count, 1, "saglayici yokken attempt HARCANMAMALI");
  assert.equal(row.status, "failed");

  // FCM geldi: retry kuyrugundan gonderilir
  const result = await runCron(db, { sendMail: mailOk, sendPush: pushSpy, pushConfig: () => ({ apns: true, fcm: true }) });
  assert.equal(pushCalls, 1);
  assert.equal(row.status, "sent");
  assert.equal(result.retrySent, 1);
});

// ---------------- v4 regresyon: soft deadline / zaman butcesi ---------

test("v4: yavas provider'da soft deadline asilmaz; deadline sonrasi claim acilmaz; ertelenen sonraki cron'da islenir; cift gonderim yok", async () => {
  const db = new MockSupabase();
  const TOTAL = 8;
  for (let i = 0; i < TOTAL; i += 1) {
    // Farkli rotalar -> farkli fiyat gruplari (her biri ayri provider cagrisi).
    db.tables.flight_price_alerts.push(makeAlert({ id: `alert-slow-${i}`, origin_code: `AA${i}`, destination_code: `BB${i}` }));
  }
  let mailCalls = 0;
  const mailSpy = async () => { mailCalls += 1; return { success: true, providerId: "x" }; };
  const slowPrice = async () => {
    await new Promise((r) => setTimeout(r, 70));
    return { price: 2500, currency: "TRY" };
  };

  const t0 = Date.now();
  const r1 = await runCron(db, { sendMail: mailSpy, sendPush: pushOk, fetchPrice: slowPrice, softDeadlineMs: 100 });
  const elapsed = Date.now() - t0;

  assert.ok(elapsed < 1000, `soft deadline buyuk olcude asilmamali (gecen: ${elapsed}ms)`);
  assert.equal(r1.deadlineReached, true, "deadlineReached=true olmali");
  assert.ok(r1.deferred >= 1, "en az bir is ertelenmis olmali");
  assert.equal(r1.processed + r1.deferred, TOTAL, "islenen + ertelenen = toplam is olmali");
  assert.equal(mailCalls, r1.processed, "yalniz islenen alarmlara e-posta gitmeli");
  // Deadline sonrasi claim acilmadi: bildirim kaydi sayisi islenenle sinirli.
  assert.equal(db.tables.flight_price_alert_notifications.length, r1.processed, "ertelenen is claim/attempt HARCAMAMALI");

  // Sonraki cron (normal deadline): ertelenenler islenir, cift gonderim olmaz.
  const r2 = await runCron(db, { sendMail: mailSpy, sendPush: pushOk });
  assert.equal(r2.deadlineReached, false);
  assert.equal(mailCalls, TOTAL, "toplamda her alarma TAM 1 e-posta gitmis olmali");
  const sentRows = db.tables.flight_price_alert_notifications.filter((n) => n.status === "sent");
  assert.equal(sentRows.length, TOTAL, "her alarm icin tek 'sent' kaydi olmali");
  for (const row of sentRows) {
    assert.equal(row.attempt_count, 1, "hicbir kayit iki kez claim edilmemis olmali");
  }
});

// ------------- v4 regresyon: monotonik mark_alert_notified ------------

test("v4: gec tamamlanan eski retry, daha dusuk yeni bildirilen fiyati YUKSELTEMEZ", async () => {
  const db = new MockSupabase();
  const newerAt = new Date().toISOString();
  // Yeni olay 2300'u coktan bildirmis (cooldown aktif); eski 2500 olayinin
  // push kaydi transient-failed bekliyor.
  const alert = makeAlert({
    notify_email: false,
    notify_push: true,
    last_notified_price: 2300,
    last_notified_at: newerAt,
  });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  db.tables.flight_price_alert_notifications.push({
    id: "n-eski", alert_id: alert.id, channel: "push", event_key: "2026-10-10:2500:TRY",
    status: "failed", attempt_count: 1, last_attempt_at: new Date(Date.now() - 3600e3).toISOString(),
    failure_kind: "transient", next_retry_at: new Date(0).toISOString(), claim_token: "t-eski",
    event_price: 2500, event_currency: "TRY",
  });
  const result = await runCron(db, { sendMail: mailOk, sendPush: pushOk });
  assert.equal(result.retrySent, 1, "eski retry tamamlanmali");
  assert.equal(alert.last_notified_price, 2300, "last_notified_price 2500'e YUKSELMEMELI");
  assert.ok(alert.last_notified_at >= newerAt, "last_notified_at geriye gitmemeli");
});

// ------------- v4 regresyon: logout yalniz mevcut cihazi kapatir ------

test("v4: iPhone logout yalniz iPhone kaydini kapatir; iPad aktif kalir; baska kullanicinin cihazi kapatilamaz", async () => {
  const db = new MockSupabase();
  db.tables.push_devices.push(
    { id: "dev-iphone", user_id: "user-1", platform: "ios", device_token: "tok-iphone-000000000000", enabled: true },
    { id: "dev-ipad", user_id: "user-1", platform: "ios", device_token: "tok-ipad-00000000000000", enabled: true },
    { id: "dev-baska", user_id: "user-2", platform: "android", device_token: "tok-baska-000000000000", enabled: true },
  );

  // iPhone logout: yalniz kendi kayit ID'si.
  const r1 = await disablePushDevices(db as any, { userId: "user-1", deviceId: "dev-iphone" });
  assert.equal(r1.ok, true);
  assert.equal(r1.disabled, 1);
  assert.equal(db.tables.push_devices.find((d) => d.id === "dev-iphone")?.enabled, false, "iPhone kaydi kapanmali");
  assert.equal(db.tables.push_devices.find((d) => d.id === "dev-ipad")?.enabled, true, "iPad kaydi ACIK kalmali");

  // Baska kullanicinin cihaz ID'siyle istek: 0 satir etkilenir.
  const r2 = await disablePushDevices(db as any, { userId: "user-1", deviceId: "dev-baska" });
  assert.equal(r2.disabled, 0, "baska kullanicinin cihazi kapatilamamali");
  assert.equal(db.tables.push_devices.find((d) => d.id === "dev-baska")?.enabled, true);

  // deviceId olmadan ve all olmadan: hicbir sey kapanmaz.
  const r3 = await disablePushDevices(db as any, { userId: "user-1" });
  assert.equal(r3.ok, false);
  assert.equal(db.tables.push_devices.find((d) => d.id === "dev-ipad")?.enabled, true);

  // ACIK "tum cihazlarda kapat" islemi: yalniz o kullanicinin cihazlari.
  const r4 = await disablePushDevices(db as any, { userId: "user-1", all: true });
  assert.equal(r4.ok, true);
  assert.equal(db.tables.push_devices.find((d) => d.id === "dev-ipad")?.enabled, false);
  assert.equal(db.tables.push_devices.find((d) => d.id === "dev-baska")?.enabled, true, "diger kullanici etkilenmemeli");
});

// -------- v4 regresyon: paralel push, tek cihaz timeout'u bekletmez ----

test("v4: push gonderimleri paralel; tek cihazin timeout'u digerlerini bekletmez ve token'i disable etmez", async () => {
  const db = new MockSupabase();
  db.tables.push_devices.push(
    { id: "d-yavas", user_id: "user-1", platform: "ios", device_token: "tok-yavas-000000000000", enabled: true },
    { id: "d-hizli", user_id: "user-1", platform: "android", device_token: "tok-hizli-000000000000", enabled: true },
  );
  const transport = async (device: any) => {
    if (device.id === "d-yavas") {
      await new Promise((r) => setTimeout(r, 300)); // asili kalan cihaz
      return { ok: true, shouldDisableToken: false };
    }
    return { ok: true, shouldDisableToken: false };
  };
  const t0 = Date.now();
  const summary = await sendPushToUser(db as any, "user-1", { title: "t", body: "b" }, transport as any, { deviceTimeoutMs: 50 });
  const elapsed = Date.now() - t0;

  assert.ok(elapsed < 250, `yavas cihaz digerini BEKLETMEMELI (gecen: ${elapsed}ms)`);
  assert.equal(summary.sent, 1, "hizli cihaza gonderim tamamlanmali");
  assert.equal(summary.failed, 1, "yavas cihaz timeout ile başarısız sayilmali");
  assert.ok(summary.errors.some((e) => e.reason === "transport_timeout"), "timeout nedeni transport_timeout olmali");
  assert.equal(summary.disabledTokens, 0, "timeout GECICI hatadir; token disable edilmemeli");
  assert.equal(db.tables.push_devices.find((d) => d.id === "d-yavas")?.enabled, true, "yavas cihaz kaydi acik kalmali");
});

// ------------------------------ runner -------------------------------

(async () => {
  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`PASS  ${name}`);
    } catch (error) {
      failed += 1;
      console.error(`FAIL  ${name}`);
      console.error(error instanceof Error ? `      ${error.message}` : error);
    }
  }
  console.log(`\n${tests.length - failed}/${tests.length} test gecti.`);
  if (failed > 0) process.exit(1);
})();
