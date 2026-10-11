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
  resolveAlertDeliveryState,
  shouldNotifyForPrice,
  hashAlertToken,
  alertEmailIdempotencyKey,
  verifyAlertUnsubscribeToken,
} from "../../lib/price-alerts";
import { disablePushDevices, sendPushToUser } from "../../lib/push";
import { runPriceAlertCheck, settleAlertNotification } from "../../lib/price-alert-cron";

type Row = Record<string, any>;
const DEPARTURE_DATE = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
process.env.CRON_SECRET = "alert-test-only-signing-secret";

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
  fault: ((table: string, operation: string, payload?: Row) => string | null) | null = null;

  from(table: string) {
    const self = this;
    const state: { filters: Array<(r: Row) => boolean>; op: string; payload?: Row; limit?: number; orders: Array<[string, any]> } = { filters: [], op: "select", orders: [] };

    const builder: any = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (opts?.count === "exact") state.op = "count";
        return builder;
      },
      order(column: string, options: any = {}) { state.orders.push([column, options]); return builder; },
      limit(value: number) { state.limit=value; return builder; },
      or(expr: string) {
        if (expr.startsWith("and(or(next_retry_at")) {
          const due = /next_retry_at\.lte\.([^,)]+)/.exec(expr)![1], stale = /last_attempt_at\.lt\.([^,)]+)/.exec(expr)![1];
          state.filters.push(row => (row.next_retry_at == null || row.next_retry_at <= due) && (row.last_attempt_at == null || row.last_attempt_at < stale));
          return builder;
        }
        if (/^(next_retry_at|last_attempt_at)\.is\.null,/.test(expr)) {
          const [, column, operator, value] = /^(\w+)\.is\.null,\w+\.(lte|lt)\.(.+)$/.exec(expr)!;
          state.filters.push(r => r[column] == null || (operator === "lte" ? r[column] <= value : r[column] < value));
          return builder;
        }
        if (expr.startsWith("and(or(notify_email")) {
          const checkedBefore = /last_checked_at\.lt\.([^,)]+)/.exec(expr)?.[1];
          const snapshotBefore = /created_at\.lte\.([^,)]+)/.exec(expr)?.[1];
          state.filters.push(r => Boolean(r.notify_email || r.notify_push) && (!r.last_checked_at || r.last_checked_at < checkedBefore!) && r.created_at <= snapshotBefore!);
          return builder;
        }
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
      is(col: string, value: any) {
        state.filters.push((r) => value === null ? r[col] == null : r[col] === value);
        return builder;
      },
      gte(col: string, value: any) {
        state.filters.push((r) => r[col] >= value);
        return builder;
      },
      lt(col: string, value: any) {
        state.filters.push((r) => r[col] < value);
        return builder;
      },
      update(payload: Row) { state.op = "update"; state.payload = payload; return builder; },
      insert(payload: Row) { state.op = "insert"; state.payload = payload; return builder; },
      then(resolve: (v: any) => void) {
        const failure = self.fault?.(table, state.op, state.payload);
        if (failure) return resolve({ data: null, error: { message: failure } });
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
        matched.sort((a, b) => {
          for (const [column, options] of state.orders) {
            if (a[column] == null && b[column] == null) continue;
            if (a[column] == null) return options.nullsFirst ? -1 : 1;
            if (b[column] == null) return options.nullsFirst ? 1 : -1;
            if (a[column] !== b[column]) return (a[column] < b[column] ? -1 : 1) * (options.ascending === false ? -1 : 1);
          }
          return 0;
        });
        if (state.op === "count") {
          return resolve({ data: null, error: null, count: matched.length });
        }
        if (state.op === "update") {
          for (const r of matched) Object.assign(r, state.payload);
          return resolve({ data: matched, error: null });
        }
        return resolve({ data: (state.limit === undefined ? matched : matched.slice(0,state.limit)).map(row => ({ ...row })), error: null });
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
      if (alert && alert.is_active !== false && !alert.cancelled_at && alert.status !== "cancelled") {
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
        created_at: new Date(nowMs).toISOString(),
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
    manage_token_hash: hashAlertToken("original-token"),
    manage_token_expires_at: new Date(Date.now() + 365 * 86400000).toISOString(),
    origin_code: "IST",
    origin_label: "İstanbul",
    destination_code: "LHR",
    destination_label: "Londra",
    departure_date: DEPARTURE_DATE,
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

test("alarm kanalları: aktif alarm teslim kanalsız bırakılamaz", () => {
  const emailOnly = { is_active: true, notify_email: true, notify_push: false };
  assert.equal(resolveAlertDeliveryState(emailOnly, { notify_email: false }).valid, false,
    "aktif e-posta alarmında son kanal kapatılamamalı");

  const pushOnly = { is_active: true, notify_email: false, notify_push: true };
  assert.equal(resolveAlertDeliveryState(pushOnly, { notify_push: false }).valid, false,
    "aktif push alarmında son kanal kapatılamamalı");

  const noChannels = { is_active: false, notify_email: false, notify_push: false };
  assert.equal(resolveAlertDeliveryState(noChannels, { is_active: true }).valid, false,
    "kanalsız alarm yeniden başlatılamamalı");
});

test("alarm kanalları: duraklatılmış alarm yönetilebilir ve kanal açılarak başlatılabilir", () => {
  const paused = { is_active: false, notify_email: false, notify_push: false };
  assert.equal(resolveAlertDeliveryState(paused, {}).valid, true,
    "duraklatılmış alarm geçici olarak kanalsız kalabilmeli");
  assert.deepEqual(
    resolveAlertDeliveryState(paused, { is_active: true, notify_push: true }),
    { active: true, email: false, push: true, valid: true },
  );

  // Tarihsel kayıtların boş e-posta değeri varsayılan açık kanal olarak
  // yorumlanır; mevcut kullanıcı verisi geriye dönük uyumla korunur.
  assert.deepEqual(
    resolveAlertDeliveryState({ is_active: true, notify_email: null, notify_push: false }, {}),
    { active: true, email: true, push: false, valid: true },
  );
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
  db.tables.flight_price_alert_notifications.push({ id: "n1", alert_id: alert.id, channel: "email", event_key: `${DEPARTURE_DATE}:2500:TRY`, status: "sent", attempt_count: 1, last_attempt_at: new Date(0).toISOString(), failure_kind: null, next_retry_at: null });
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
  db.tables.flight_price_alert_notifications.push({ id: "n1", alert_id: alert.id, channel: "email", event_key: `${DEPARTURE_DATE}:2500:TRY`, status: "pending", attempt_count: 1, last_attempt_at: new Date().toISOString(), failure_kind: null, next_retry_at: null });
  let mailCalls = 0;
  const mailSpy = async () => { mailCalls += 1; return { success: true, providerId: "x" }; };
  await runCron(db, { sendMail: mailSpy, sendPush: pushOk });
  assert.equal(mailCalls, 0, "taze pending devralinmamali");
  // suresi gecmis pending
  db.tables.flight_price_alert_notifications[0].error_message = "delivery_outcome_unknown:provider_request_started";
  db.tables.flight_price_alert_notifications[0].created_at = new Date(Date.now() - 3600 * 1000).toISOString();
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
  assert.equal(pushRow.event_key, `${DEPARTURE_DATE}:2500:TRY`);
  assert.equal(pushRow.event_price, 2500, "olay snapshot fiyati kaydedilmeli");

  // 2. cron: FIYAT DEGISTI (2300); push retry zamani geldi
  pushRow.next_retry_at = new Date(0).toISOString();
  const priceChanged = async () => ({ price: 2300, currency: "TRY" });
  const r2 = await runCron(db, { sendMail: mailSpy, sendPush: pushSpy, fetchPrice: priceChanged });
  assert.equal(pushCalls, 2, "eski olayin push retry'i fiyat degisse de TAMAMLANMALI");
  assert.equal(pushRow.status, "sent");
  assert.equal(pushRow.event_key, `${DEPARTURE_DATE}:2500:TRY`, "retry ORIJINAL olay anahtariyla tamamlanmali");
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
    id: "n1", alert_id: "a1", channel: "push", event_key: `${DEPARTURE_DATE}:2500:TRY`,
    status: "pending", attempt_count: 2, last_attempt_at: staleIso,
    failure_kind: null, next_retry_at: null, claim_token: "eski-token",
  });
  const row = db.tables.flight_price_alert_notifications[0];

  // stale + attempt=2 -> YALNIZ BIR KEZ claim edilir, attempt 3 olur
  const r1 = await db.rpc("claim_alert_notification", { p_alert_id: "a1", p_channel: "push", p_event_key: `${DEPARTURE_DATE}:2500:TRY` });
  assert.ok(typeof r1.data === "string" && r1.data, "stale pending (attempt=2) claim edilebilmeli");
  assert.equal(row.attempt_count, 3);

  // tekrar stale hale gelse bile claim EDILMEZ (attempt=3 = sinir)
  row.last_attempt_at = staleIso;
  const r2 = await db.rpc("claim_alert_notification", { p_alert_id: "a1", p_channel: "push", p_event_key: `${DEPARTURE_DATE}:2500:TRY` });
  assert.equal(r2.data, null, "attempt sinirina ulasan stale pending TEKRAR claim edilmemeli");
  assert.equal(row.attempt_count, 3, "attempt_count artmamali");

  // dogrudan attempt=3 ile stale pending: hic claim edilmez
  db.tables.flight_price_alert_notifications.push({
    id: "n2", alert_id: "a2", channel: "email", event_key: `${DEPARTURE_DATE}:2500:TRY`,
    status: "pending", attempt_count: 3, last_attempt_at: staleIso,
    failure_kind: null, next_retry_at: null, claim_token: "eski-token-2",
  });
  const r3 = await db.rpc("claim_alert_notification", { p_alert_id: "a2", p_channel: "email", p_event_key: `${DEPARTURE_DATE}:2500:TRY` });
  assert.equal(r3.data, null, "attempt=3 stale pending HIC claim edilmemeli");
});

test("v3: retry kuyrugu da stale pending'i attempt siniri icinde tamamlar (cron uzerinden)", async () => {
  const db = new MockSupabase();
  const alert = makeAlert({ notify_push: true, notify_email: false, last_notified_at: new Date().toISOString(), last_notified_price: 2500 });
  db.tables.flight_price_alerts.push(alert);
  seedDevice(db);
  const staleIso = new Date(Date.now() - 3600 * 1000).toISOString();
  db.tables.flight_price_alert_notifications.push({
    id: "n1", alert_id: alert.id, channel: "push", event_key: `${DEPARTURE_DATE}:2500:TRY`,
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
    p_alert_id: alert.id, p_channel: "email", p_event_key: `${DEPARTURE_DATE}:2500:TRY`,
    p_event_price: 2500, p_event_currency: "TRY",
  });
  const tokenA = rA.data as string;
  assert.ok(tokenA, "Cron A claim alabilmeli");
  const row = db.tables.flight_price_alert_notifications[0];

  // Claim stale hale gelir (A cevap vermiyor)
  row.error_message = "delivery_outcome_unknown:provider_request_started";
  row.last_attempt_at = new Date(Date.now() - 3600 * 1000).toISOString();

  // Cron B devralir ve BASARIYLA gonderir (retry kuyrugu yolu)
  let mailCalls = 0;
  const mailSpy = async () => { mailCalls += 1; return { success: true, providerId: "x" }; };
  await runCron(db, { sendMail: mailSpy, sendPush: pushOk });
  assert.equal(mailCalls, 1, "Cron B stale claim'i devralip gondermeli");
  assert.equal(row.status, "sent");
  assert.notEqual(row.claim_token, tokenA, "B'nin claim'i yeni token uretmis olmali");

  // Cron A GEC doner ve kendi (eski) token'iyla 'failed' yazmaya calisir
  await settleAlertNotification(db as any, { alertId: alert.id, channel: "email", eventKey: `${DEPARTURE_DATE}:2500:TRY` }, tokenA, {
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
    id: "n1", alert_id: alert.id, channel: "push", event_key: `${DEPARTURE_DATE}:2500:TRY`,
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
  row.next_retry_at = new Date(0).toISOString(); // deferred retry is now due
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
    id: "n-eski", alert_id: alert.id, channel: "push", event_key: `${DEPARTURE_DATE}:2500:TRY`,
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

test("v5: gecmis tarih veya silinme isareti fiyat taramasi ve retry gonderiminden dislanir", async () => {
  const db = new MockSupabase();
  const expired = makeAlert({ departure_date: "2020-01-01" });
  const deleted = makeAlert({ status: "active", cancelled_at: new Date().toISOString() });
  db.tables.flight_price_alerts.push(expired, deleted);
  for (const alert of [expired, deleted]) db.tables.flight_price_alert_notifications.push({
    id: `retry-${alert.id}`, alert_id: alert.id, channel: "email", event_key: `${alert.departure_date}:2500:TRY`,
    status: "failed", attempt_count: 1, last_attempt_at: new Date(0).toISOString(), failure_kind: "transient", next_retry_at: new Date(0).toISOString(),
    event_price: 2500, event_currency: "TRY",
  });
  let deliveryCalls = 0, priceCalls = 0;
  await runCron(db, { sendMail: async () => { deliveryCalls++; return mailOk(); }, sendPush: pushOk,
    fetchPrice: async () => { priceCalls++; return mockPriceOk(); } });
  assert.equal(priceCalls, 0);
  assert.equal(deliveryCalls, 0);
  assert.ok(db.tables.flight_price_alert_notifications.every(row => row.failure_kind === "permanent"));
});

test("v5: fiyat saglayicisi beklerken silinen alarm canlanmaz veya bildirim uretmez", async () => {
  for (const response of [mockPriceOk(), Promise.resolve(null)]) {
    const db = new MockSupabase(), alert = makeAlert();
    db.tables.flight_price_alerts.push(alert);
    let deliveries = 0;
    await runCron(db, { sendMail: async () => { deliveries++; return mailOk(); }, sendPush: pushOk,
      fetchPrice: async () => { Object.assign(alert, { is_active: false, status: "cancelled", cancelled_at: new Date().toISOString() }); return response; } });
    assert.equal(alert.status, "cancelled");
    assert.equal(alert.is_active, false);
    assert.equal(deliveries, 0);
  }
});

test("v5: genel fiyat bildirimi tercihleri kanal bazinda yeni olayi ve retry'i durdurur", async () => {
  const db = new MockSupabase(), alert = makeAlert({ notify_push: true });
  db.tables.flight_price_alerts.push(alert); seedDevice(db);
  db.tables.community_notification_preferences = [{ user_id: "user-1", price_alert_email: false, price_alert_push: false }];
  db.tables.flight_price_alert_notifications.push({ id: "queued", alert_id: alert.id, channel: "email", event_key: `${DEPARTURE_DATE}:2500:TRY`,
    status: "failed", attempt_count: 1, last_attempt_at: new Date(0).toISOString(), failure_kind: "transient", next_retry_at: new Date(0).toISOString(), event_price: 2500, event_currency: "TRY" });
  let emails = 0, pushes = 0;
  const deps = { sendMail: async () => { emails++; return mailOk(); }, sendPush: async () => { pushes++; return pushOk(); } };
  await runCron(db, deps);
  assert.equal(emails, 0); assert.equal(pushes, 0);
  assert.equal(db.tables.flight_price_alert_notifications[0].attempt_count, 1);
  assert.equal(alert.notify_email, true, "Genel tercih alarm ozelindeki tercihi ezmemeli");
  db.tables.community_notification_preferences[0].price_alert_push = true;
  await runCron(db, deps);
  assert.equal(emails, 0); assert.equal(pushes, 1);
});

test("v6: daily bounded batches drain beyond 80 and include same-day creation without rechecking completed rows", async () => {
  const db = new MockSupabase();
  const cutoff = new Date().toISOString(), dayStart = cutoff.slice(0,10)+"T00:00:00.000Z";
  for(let i=0;i<185;i++) db.tables.flight_price_alerts.push(makeAlert({id:`batch-${i}`,created_at:dayStart,last_checked_at:null}));
  db.tables.flight_price_alerts.push(makeAlert({id:"already-checked",created_at:dayStart,last_checked_at:cutoff}));
  db.tables.flight_price_alerts.push(makeAlert({id:"after-snapshot",created_at:new Date(Date.parse(cutoff)+1).toISOString(),last_checked_at:null}));
  let emails=0;
  const deps={supabase:db,fetchPrice:mockPriceOk,sendMail:async()=>{emails++;return mailOk();},sendPush:pushOk,isEmailConfigured:()=>true,pushConfig:()=>({apns:false,fcm:false})};
  const first=await runPriceAlertCheck({checkedBefore:cutoff,limit:80,deps});assert.equal(first.processedAlerts,80);
  const second=await runPriceAlertCheck({checkedBefore:cutoff,limit:80,deps});assert.equal(second.processedAlerts,80);
  const last=await runPriceAlertCheck({checkedBefore:cutoff,limit:80,deps});assert.equal(last.processedAlerts,25);
  assert.equal((await runPriceAlertCheck({checkedBefore:cutoff,limit:80,deps})).processedAlerts,0);
  assert.equal(emails,185);assert.equal(db.tables.flight_price_alerts.find(r=>r.id==="after-snapshot")?.last_checked_at,null);
});

function queuedEmail(db: MockSupabase, alert: Row, overrides: Row = {}) {
  const row = { id: `queued-${alert.id}`, alert_id: alert.id, channel: "email", event_key: `${DEPARTURE_DATE}:2500:TRY`,
    status: "failed", attempt_count: 1, last_attempt_at: new Date(Date.now() - 3600e3).toISOString(),
    created_at: new Date(Date.now() - 3600e3).toISOString(), failure_kind: "transient", next_retry_at: new Date(0).toISOString(),
    claim_token: "old", event_price: 2500, event_currency: "TRY", error_message: "delivery_not_accepted:provider_rejected", ...overrides };
  db.tables.flight_price_alert_notifications.push(row); return row;
}

test("v7: transient retry lookup failure defers without losing the event or consuming an attempt", async () => {
  const db = new MockSupabase(), alert = makeAlert({ last_notified_at: new Date().toISOString() });
  db.tables.flight_price_alerts.push(alert); const row = queuedEmail(db, alert);
  let fail = true, emails = 0;
  db.fault = (table, op) => table === "flight_price_alerts" && op === "select" && fail ? (fail = false, "temporary read error") : null;
  const sendMail = async () => { emails++; return mailOk(); };
  const first = await runCron(db, { sendMail });
  assert.equal(row.failure_kind, "transient"); assert.equal(row.attempt_count, 1);
  assert.equal(emails, 0); assert.equal(first.retryProcessed, 0);
  assert.ok(Date.parse(row.next_retry_at) > Date.now());
  row.next_retry_at = new Date(0).toISOString();
  await runCron(db, { sendMail }); assert.equal(emails, 1); assert.equal(row.status, "sent");
});

test("v7: truly absent alert retires its retry; failed queue reads surface instead of reporting success", async () => {
  const db = new MockSupabase(); const row = queuedEmail(db, makeAlert());
  await runCron(db, { sendMail: mailOk }); assert.equal(row.failure_kind, "permanent"); assert.equal(row.error_message, "alert_missing");
  db.fault = table => table === "flight_price_alert_notifications" ? "queue offline" : null;
  await assert.rejects(runCron(db, { sendMail: mailOk }), /kuyruğu okunamadı/);
});

test("v7: eligible retries behind 145 muted and 120 not-yet-due events are delivered", async () => {
  const db = new MockSupabase(); db.tables.community_notification_preferences = [{ user_id: "muted", price_alert_email: false }];
  for (let i = 0; i < 145; i++) {
    const alert = makeAlert({ id: `muted-${i}`, user_id: "muted", last_notified_at: new Date().toISOString() });
    db.tables.flight_price_alerts.push(alert); queuedEmail(db, alert);
  }
  for (let i = 0; i < 120; i++) queuedEmail(db, makeAlert({ id: `future-${i}` }), { next_retry_at: new Date(Date.now() + 86400e3).toISOString() });
  const alert = makeAlert({ id: "eligible", user_id: "allowed", last_notified_at: new Date().toISOString() });
  db.tables.flight_price_alerts.push(alert); const row = queuedEmail(db, alert);
  let emails = 0; const result = await runCron(db, { sendMail: async () => { emails++; return mailOk(); } });
  assert.equal(emails, 1); assert.equal(row.status, "sent"); assert.equal(result.retryProcessed, 1);
  assert.ok(db.tables.flight_price_alert_notifications.filter(n => n.alert_id.startsWith("muted-")).every(n => n.attempt_count === 1 && Date.parse(n.next_retry_at) > Date.now()));
});

test("v7: pending deferral is fenced against a concurrent claim", async () => {
  const db = new MockSupabase(), alert = makeAlert({ last_notified_at: new Date().toISOString() });
  db.tables.flight_price_alerts.push(alert); const row = queuedEmail(db, alert, { status: "pending" });
  let once = true;
  db.fault = (table, op, payload) => {
    if (table === "flight_price_alert_notifications" && op === "update" && payload?.next_retry_at && once) {
      once = false; Object.assign(row, { claim_token: "new-worker", attempt_count: 2, next_retry_at: null, last_attempt_at: new Date().toISOString() });
    }
    return null;
  };
  await runCron(db, { isEmailConfigured: () => false });
  assert.equal(row.claim_token, "new-worker"); assert.equal(row.next_retry_at, null); assert.equal(row.attempt_count, 2);
});

test("v7: lost settlement retries one stable provider key and never counts unpersisted success", async () => {
  const db = new MockSupabase(), alert = makeAlert(); db.tables.flight_price_alerts.push(alert);
  const provider = new Map<string, string>(), requests: Row[] = []; let fail = true;
  db.fault = (table, op, payload) => table === "flight_price_alert_notifications" && op === "update" && payload?.status === "sent" && fail ? "settlement offline" : null;
  const sendMail = async (mail: Row) => {
    requests.push(mail); const existing = provider.get(mail.idempotencyKey);
    if (existing) assert.equal(existing, mail.html, "retry payload must be identical");
    provider.set(mail.idempotencyKey, mail.html); return mailOk();
  };
  await assert.rejects(runCron(db, { sendMail }), /teslim sonucu kaydedilemedi/);
  const row = db.tables.flight_price_alert_notifications[0];
  assert.equal(row.status, "pending"); assert.equal(alert.last_notified_at, null);
  assert.match(row.error_message, /^delivery_outcome_unknown:/);
  fail = false; row.last_attempt_at = new Date(Date.now() - 3600e3).toISOString();
  await runCron(db, { sendMail });
  assert.equal(requests.length, 2); assert.equal(provider.size, 1); assert.equal(row.status, "sent");
  assert.equal(requests[0].idempotencyKey, alertEmailIdempotencyKey(alert.id, row.event_key));
  assert.notEqual(alertEmailIdempotencyKey("other", row.event_key), requests[0].idempotencyKey);
  assert.notEqual(alertEmailIdempotencyKey(alert.id, `${DEPARTURE_DATE}:2400:TRY`), requests[0].idempotencyKey);
});

test("v7: durable provider receipt reconciles settlement after 24h without resending", async () => {
  const db = new MockSupabase(), alert = makeAlert(); db.tables.flight_price_alerts.push(alert);
  let emails = 0, fail = true;
  db.fault = (table, op, payload) => table === "flight_price_alert_notifications" && op === "update" && payload?.status === "sent" && fail ? "settlement offline" : null;
  const sendMail = async (mail: Row) => {
    emails++; db.tables.mail_delivery_logs.push({ reference_type: mail.referenceType, reference_id: mail.referenceId, status: "sent", provider_id: "accepted-1" });
    return { success: true, providerId: "accepted-1" };
  };
  await assert.rejects(runCron(db, { sendMail }));
  const row = db.tables.flight_price_alert_notifications[0];
  row.created_at = row.last_attempt_at = new Date(Date.now() - 48 * 3600e3).toISOString(); fail = false;
  await runCron(db, { sendMail }); assert.equal(emails, 1); assert.equal(row.status, "sent"); assert.equal(row.provider_id, "accepted-1");
});

test("v7: uncertain delivery beyond provider dedupe window stops; known rejection can safely retry", async () => {
  for (const uncertain of [true, false]) {
    const db = new MockSupabase(), alert = makeAlert({ last_notified_at: new Date().toISOString() }); db.tables.flight_price_alerts.push(alert);
    const row = queuedEmail(db, alert, { created_at: new Date(Date.now() - 48 * 3600e3).toISOString(), error_message: uncertain ? "delivery_outcome_unknown:timeout" : "delivery_not_accepted:provider rejected" });
    let emails = 0; await runCron(db, { sendMail: async () => { emails++; return mailOk(); } });
    assert.equal(emails, uncertain ? 0 : 1);
    if (uncertain) { assert.equal(row.failure_kind, "permanent"); assert.match(row.error_message, /^delivery_unconfirmed:/); }
    else assert.equal(row.status, "sent");
  }
});

test("v7: failed receipt reads and send-intent writes never call the email provider", async () => {
  for (const stage of ["receipt", "intent"]) {
    const db = new MockSupabase(), alert = makeAlert(); db.tables.flight_price_alerts.push(alert);
    db.fault = (table, op, payload) => ((stage === "receipt" && table === "mail_delivery_logs") || (stage === "intent" && table === "flight_price_alert_notifications" && op === "update" && payload?.error_message?.startsWith("delivery_outcome_unknown:"))) ? "offline" : null;
    let emails = 0; await assert.rejects(runCron(db, { sendMail: async () => { emails++; return mailOk(); } })); assert.equal(emails, 0);
  }
});

test("v7: guest drop email contains a valid alert-specific cancel capability", async () => {
  const db = new MockSupabase(), alert = makeAlert({ user_id: null }); db.tables.flight_price_alerts.push(alert);
  let html = "";
  await runCron(db, { sendMail: async (mail: Row) => { html = mail.html; return mailOk(); } });
  const link = /href="([^"]+)"[^>]*>Bu alarmı kapat/.exec(html)?.[1]; assert.ok(link);
  const url = new URL(link!); assert.equal(url.pathname, `/api/flight-alerts/${alert.id}/unsubscribe`);
  const token = url.searchParams.get("token")!;
  assert.ok(verifyAlertUnsubscribeToken({ alertId: alert.id, departureDate: alert.departure_date, storedHash: alert.manage_token_hash, expiresAt: alert.manage_token_expires_at, plainToken: token }));
  assert.equal(verifyAlertUnsubscribeToken({ alertId: "someone-else", departureDate: alert.departure_date, storedHash: alert.manage_token_hash, expiresAt: alert.manage_token_expires_at, plainToken: token }), false);
});

test("v7: the last provider attempt reconciles its durable receipt without a fourth send", async () => {
  for (const receipt of [true, false]) {
    const db = new MockSupabase(), alert = makeAlert({ last_notified_at: new Date().toISOString() }); db.tables.flight_price_alerts.push(alert);
    const row = queuedEmail(db, alert, { attempt_count: 3, status: "pending", error_message: "delivery_outcome_unknown:timeout" });
    if (receipt) db.tables.mail_delivery_logs.push({ reference_type: "flight_price_alert_notification", reference_id: row.id, status: "sent", provider_id: "final-receipt" });
    let requests = 0; const result = await runCron(db, { sendMail: async () => { requests++; return mailOk(); } });
    assert.equal(requests, 0); assert.equal(row.attempt_count, 3); assert.equal(result.retryProcessed, 1);
    assert.equal(row.status, receipt ? "sent" : "failed");
    if (!receipt) { assert.equal(row.failure_kind, "permanent"); assert.match(row.error_message, /delivery_unconfirmed/); }
  }
});

test("v7: active guest alerts still deliver after old management expiry and with legacy null hashes", async () => {
  for (const hash of [hashAlertToken("expired-original"), null]) {
    const db = new MockSupabase(), alert = makeAlert({ user_id: null, manage_token_hash: hash, manage_token_expires_at: new Date(0).toISOString() });
    db.tables.flight_price_alerts.push(alert); let requests = 0;
    await runCron(db, { sendMail: async (mail: Row) => { requests++; assert.match(mail.html, /unsubscribe\?token=cancel-v1/); return mailOk(); } });
    assert.equal(requests, 1); assert.equal(alert.manage_token_expires_at, new Date(0).toISOString());
  }
});

test("v7: ambiguous send followed by a known rejection cannot erase uncertainty and resend after 24h", async () => {
  for (const rejection of ["429 rate limit", "409 idempotency conflict"]) {
    const db = new MockSupabase(), alert = makeAlert(); db.tables.flight_price_alerts.push(alert);
    let requests = 0;
    const sendMail = async () => { requests++; return requests === 1
      ? { success: false, error: "acknowledgement lost", deliveryUncertain: true }
      : { success: false, error: rejection, deliveryUncertain: false }; };
    await runCron(db, { sendMail }); const row = db.tables.flight_price_alert_notifications[0];
    assert.match(row.error_message, /^delivery_outcome_unknown:/);
    row.next_retry_at = new Date(0).toISOString(); await runCron(db, { sendMail });
    assert.equal(requests, 2); assert.match(row.error_message, /^delivery_outcome_unknown:/);
    row.next_retry_at = new Date(0).toISOString(); row.created_at = new Date(Date.now() - 48 * 3600e3).toISOString();
    await runCron(db, { sendMail });
    assert.equal(requests, 2); assert.equal(row.failure_kind, "permanent"); assert.match(row.error_message, /^delivery_unconfirmed:/);
  }
});

test("v7: legacy pending without a provider key or intent marker is never resent under a new key", async () => {
  const db = new MockSupabase(), alert = makeAlert({ last_notified_at: new Date().toISOString() }); db.tables.flight_price_alerts.push(alert);
  const row = queuedEmail(db, alert, { status: "pending", error_message: null });
  // Alert-wide legacy receipt cannot prove which price event was accepted.
  db.tables.mail_delivery_logs.push({ reference_type: "flight_price_alert", reference_id: alert.id, status: "sent", provider_id: "legacy-accepted" });
  let requests = 0;
  await runCron(db, { sendMail: async () => { requests++; return mailOk(); } });
  assert.equal(requests, 0); assert.equal(row.failure_kind, "permanent"); assert.match(row.error_message, /^delivery_unconfirmed:/);
});

test("v7: legacy failed timeout cannot masquerade as a confirmed provider rejection", async () => {
  const db = new MockSupabase(), alert = makeAlert({ last_notified_at: new Date().toISOString() }); db.tables.flight_price_alerts.push(alert);
  const row = queuedEmail(db, alert, { error_message: "Network error" }); let requests = 0;
  await runCron(db, { sendMail: async () => { requests++; return mailOk(); } });
  assert.equal(requests, 0); assert.equal(row.failure_kind, "permanent"); assert.match(row.error_message, /^delivery_unconfirmed:/);
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
