// =====================================================================
// Live Activity token kayıt/çıkış iş mantığı testleri
// (lib/live-activity-tokens). Sahte Supabase istemcisi PostgREST
// zincirini taklit eder; RPC-yokluğu GERÇEK PostgREST koduyla (PGRST202)
// simüle edilir — migration uygulanmadan önceki davranış kanıtlanır.
// =====================================================================

import assert from "node:assert";
import {
  deactivateLiveActivityInstallation,
  registerLiveActivityToken,
} from "../../lib/live-activity-tokens";

type QueryLog = {
  table: string;
  op: string;
  payload?: unknown;
  filters: Array<[string, unknown]>;
};

type Responder = (query: QueryLog) => unknown;

// PostgREST zincirini taklit eden thenable sorgu kurucusu.
function makeFakeSupabase(options: {
  rpc?: (name: string, args: Record<string, unknown>) => { error: unknown };
  respond?: Responder;
}) {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const queries: QueryLog[] = [];

  const builder = (table: string) => {
    const query: QueryLog = { table, op: "", filters: [] };
    const chain: Record<string, unknown> = {};
    const record = (op: string, payload?: unknown) => {
      query.op = query.op || op;
      if (payload !== undefined) query.payload = payload;
      return chain;
    };
    Object.assign(chain, {
      select: (sel: unknown, opts?: unknown) => record(query.op || "select", { sel, opts }),
      update: (payload: unknown) => record("update", payload),
      upsert: (payload: unknown, opts?: unknown) => record("upsert", { payload, opts }),
      eq: (column: string, value: unknown) => { query.filters.push([column, value]); return chain; },
      order: () => chain,
      limit: () => chain,
      then: (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) => {
        queries.push(query);
        try {
          return Promise.resolve(options.respond?.(query) ?? { data: [], error: null, count: 0 }).then(resolve, reject);
        } catch (error) {
          return Promise.reject(error).then(resolve, reject);
        }
      },
    });
    return chain;
  };

  return {
    client: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        rpcCalls.push({ name, args });
        return options.rpc ? options.rpc(name, args) : { error: null };
      },
      from: builder,
    },
    rpcCalls,
    queries,
  };
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const INSTALL_IPHONE = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const PUSH_TOKEN = "abcdef0123456789abcdef0123456789";

export function registerLiveActivityTokenTests(test: (name: string, fn: () => Promise<void> | void) => void) {
  test("token kaydı: RPC varken rotasyon TEK çağrıyla yapılır (upsert yolu çalışmaz)", async () => {
    const fake = makeFakeSupabase({ rpc: () => ({ error: null }) });
    const result = await registerLiveActivityToken(fake.client, USER_A, {
      tokenType: "push_to_start",
      token: PUSH_TOKEN,
      installationId: INSTALL_IPHONE,
    });
    assert.equal(result.status, 200);
    assert.equal(fake.rpcCalls.length, 1);
    assert.equal(fake.rpcCalls[0].name, "register_live_activity_push_to_start");
    assert.deepEqual(fake.rpcCalls[0].args, {
      p_user_id: USER_A,
      p_installation_id: INSTALL_IPHONE,
      p_token: PUSH_TOKEN.toLowerCase(),
    });
    assert.equal(fake.queries.length, 0, "RPC başarılıysa tablo sorgusu yapılmamalı");
  });

  test("token kaydı: RPC migration'ı YOKKEN (gerçek PostgREST kodu PGRST202) GÜVENLİKSİZ fallback YOK → 503", async () => {
    // Supabase JS, şema önbelleğinde olmayan fonksiyon için PGRST202 döner:
    // "Could not find the function public.register_live_activity_push_to_start".
    // v6: per-user upsert hesaplar-arası tekillik sağlamadığından fallback
    // KALDIRILDI — 503 döner; istemci token'ı ack etmeden bekletir.
    const fake = makeFakeSupabase({
      rpc: () => ({ error: { code: "PGRST202", message: "Could not find the function" } }),
    });
    const result = await registerLiveActivityToken(fake.client, USER_A, {
      tokenType: "push_to_start",
      token: PUSH_TOKEN,
      installationId: INSTALL_IPHONE,
    });
    assert.equal(result.status, 503, "migration öncesi 503 dönmeli (fallback yok)");
    assert.equal(fake.queries.length, 0, "HİÇBİR tablo yazımı olmamalı (upsert dahil)");
    // 42883 (doğrudan PG eşdeğeri) de aynı davranış.
    const fake2 = makeFakeSupabase({ rpc: () => ({ error: { code: "42883" } }) });
    const result2 = await registerLiveActivityToken(fake2.client, USER_A, {
      tokenType: "push_to_start", token: PUSH_TOKEN, installationId: INSTALL_IPHONE,
    });
    assert.equal(result2.status, 503);
    assert.equal(fake2.queries.length, 0);
  });

  test("token kaydı: tablo yokken (42P01) dürüst 503", async () => {
    const fake = makeFakeSupabase({ rpc: () => ({ error: { code: "42P01" } }) });
    const result = await registerLiveActivityToken(fake.client, USER_A, {
      tokenType: "push_to_start",
      token: PUSH_TOKEN,
      installationId: INSTALL_IPHONE,
    });
    assert.equal(result.status, 503);
    assert.equal(fake.queries.length, 0);
  });

  test("token kaydı: GEÇERSİZ installationId 400 döner — sessiz rotasyonsuz yol YOK", async () => {
    const fake = makeFakeSupabase({});
    const result = await registerLiveActivityToken(fake.client, USER_A, {
      tokenType: "push_to_start",
      token: PUSH_TOKEN,
      installationId: "not-a-uuid",
    });
    assert.equal(result.status, 400);
    assert.equal(fake.rpcCalls.length, 0, "RPC çağrılmamalı");
    assert.equal(fake.queries.length, 0, "hiçbir tablo yazımı olmamalı");
    // v6: push_to_start için kurulum kimliği ZORUNLU — alan hiç
    // gönderilmemişse de 400 (kimliksiz kayıt sızıntı korumasını atlatır).
    const missing = makeFakeSupabase({});
    const missingResult = await registerLiveActivityToken(missing.client, USER_A, {
      tokenType: "push_to_start",
      token: PUSH_TOKEN,
    });
    assert.equal(missingResult.status, 400, "kimliksiz push_to_start reddedilmeli");
    assert.equal(missing.rpcCalls.length + missing.queries.length, 0);
  });

  test("çıkış: kurulum tokenları RPC ile kapatılır; RPC yoksa (PGRST202) tek UPDATE fallback", async () => {
    const fake = makeFakeSupabase({ rpc: () => ({ error: null }) });
    const result = await deactivateLiveActivityInstallation(fake.client, USER_A, INSTALL_IPHONE);
    assert.equal(result.status, 200);
    assert.equal(fake.rpcCalls[0].name, "deactivate_live_activity_installation");
    assert.deepEqual(fake.rpcCalls[0].args, { p_user_id: USER_A, p_installation_id: INSTALL_IPHONE });
    assert.equal(fake.queries.length, 0);

    const fallback = makeFakeSupabase({
      rpc: () => ({ error: { code: "PGRST202" } }),
      respond: () => ({ data: [], error: null }),
    });
    const fallbackResult = await deactivateLiveActivityInstallation(fallback.client, USER_A, INSTALL_IPHONE);
    assert.equal(fallbackResult.status, 200);
    const update = fallback.queries.find((query) => query.op === "update");
    assert.ok(update, "fallback UPDATE çalışmalı");
    // Filtreler: yalnız BU kullanıcı + BU kurulum (iPad'e dokunulmaz).
    assert.deepEqual(update!.filters, [["user_id", USER_A], ["installation_id", INSTALL_IPHONE], ["enabled", true]]);
    assert.equal((update!.payload as { enabled?: boolean }).enabled, false);
  });

  test("çıkış: eksik/geçersiz installationId 400; tablo yoksa 503", async () => {
    const fake = makeFakeSupabase({});
    assert.equal((await deactivateLiveActivityInstallation(fake.client, USER_A, undefined)).status, 400);
    assert.equal((await deactivateLiveActivityInstallation(fake.client, USER_A, "bozuk")).status, 400);
    assert.equal(fake.rpcCalls.length, 0);

    const missingTable = makeFakeSupabase({ rpc: () => ({ error: { code: "42P01" } }) });
    assert.equal((await deactivateLiveActivityInstallation(missingTable.client, USER_A, INSTALL_IPHONE)).status, 503);
  });
}
