import assert from "node:assert";
import {
  beginLiveActivitySession,
  deactivateLiveActivityInstallation,
  registerLiveActivityToken,
} from "../../lib/live-activity-tokens";

function makeFakeSupabase(respond: (name: string, args: Record<string, unknown>) => { error: unknown } = () => ({ error: null })) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  return {
    client: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return respond(name, args);
      },
      from: () => { throw new Error("Güvenlik-kritik token yolu tablo sorgusu kullanmamalı"); },
    },
    calls,
  };
}

const USER_A = "11111111-1111-4111-8111-111111111111";
const INSTALL_IPHONE = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const EPOCH_A = "cccccccc-1111-4111-8111-cccccccccccc";
const TRIP_ID = "dddddddd-1111-4111-8111-dddddddddddd";
const PUSH_TOKEN = "abcdef0123456789abcdef0123456789";
const GENERATION = 7;

export function registerLiveActivityTokenTests(test: (name: string, fn: () => Promise<void> | void) => void) {
  test("LA session: login generation RPC ile token replay'den ayrı ve atomik başlatılır", async () => {
    const fake = makeFakeSupabase();
    const result = await beginLiveActivitySession(fake.client, USER_A, {
      installationId: INSTALL_IPHONE, sessionEpoch: EPOCH_A, generation: GENERATION,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(fake.calls, [{
      name: "begin_live_activity_session",
      args: { p_user_id: USER_A, p_installation_id: INSTALL_IPHONE, p_epoch: EPOCH_A, p_generation: GENERATION },
    }]);
  });

  test("LA session: eksik/geçersiz generation veya UUID 400", async () => {
    const fake = makeFakeSupabase();
    assert.equal((await beginLiveActivitySession(fake.client, USER_A, {
      installationId: INSTALL_IPHONE, sessionEpoch: EPOCH_A, generation: 0,
    })).status, 400);
    assert.equal((await beginLiveActivitySession(fake.client, USER_A, {
      installationId: "bozuk", sessionEpoch: EPOCH_A, generation: 1,
    })).status, 400);
    assert.equal(fake.calls.length, 0);
  });

  test("LA session: stale generation LA001→409; migration yok→503", async () => {
    const stale = makeFakeSupabase(() => ({ error: { code: "LA001" } }));
    assert.equal((await beginLiveActivitySession(stale.client, USER_A, {
      installationId: INSTALL_IPHONE, sessionEpoch: EPOCH_A, generation: GENERATION,
    })).status, 409);
    for (const code of ["PGRST202", "42883", "42P01", "42703"]) {
      const missing = makeFakeSupabase(() => ({ error: { code } }));
      assert.equal((await beginLiveActivitySession(missing.client, USER_A, {
        installationId: INSTALL_IPHONE, sessionEpoch: EPOCH_A, generation: GENERATION,
      })).status, 503);
    }
  });

  test("push_to_start: güncel generation RPC'ye taşınır; tablo fallback'i yok", async () => {
    const fake = makeFakeSupabase();
    const result = await registerLiveActivityToken(fake.client, USER_A, {
      tokenType: "push_to_start", token: PUSH_TOKEN, installationId: INSTALL_IPHONE,
      sessionEpoch: EPOCH_A, generation: GENERATION,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(fake.calls[0], {
      name: "register_live_activity_push_to_start",
      args: {
        p_user_id: USER_A, p_installation_id: INSTALL_IPHONE, p_token: PUSH_TOKEN,
        p_epoch: EPOCH_A, p_generation: GENERATION,
      },
    });
  });

  test("activity_update: sahiplik+session+kota+upsert tek RPC/transaksiyon yolunda", async () => {
    const fake = makeFakeSupabase();
    const result = await registerLiveActivityToken(fake.client, USER_A, {
      tokenType: "activity_update", token: PUSH_TOKEN, tripId: TRIP_ID,
      installationId: INSTALL_IPHONE, sessionEpoch: EPOCH_A, generation: GENERATION,
    });
    assert.equal(result.status, 200);
    assert.deepEqual(fake.calls[0], {
      name: "register_live_activity_update",
      args: {
        p_user_id: USER_A, p_installation_id: INSTALL_IPHONE, p_token: PUSH_TOKEN,
        p_epoch: EPOCH_A, p_generation: GENERATION, p_trip_id: TRIP_ID,
      },
    });
  });

  test("activity_update: SQL sahiplik reddi LA003→403; stale generation LA001→409", async () => {
    const input = {
      tokenType: "activity_update", token: PUSH_TOKEN, tripId: TRIP_ID,
      installationId: INSTALL_IPHONE, sessionEpoch: EPOCH_A, generation: GENERATION,
    };
    const forbidden = makeFakeSupabase(() => ({ error: { code: "LA003" } }));
    assert.equal((await registerLiveActivityToken(forbidden.client, USER_A, input)).status, 403);
    const stale = makeFakeSupabase(() => ({ error: { code: "LA001" } }));
    assert.equal((await registerLiveActivityToken(stale.client, USER_A, input)).status, 409);
  });

  test("token kaydı: generation dahil zorunlu alanlar geçersizse 400", async () => {
    const fake = makeFakeSupabase();
    const base = { tokenType: "push_to_start", token: PUSH_TOKEN, installationId: INSTALL_IPHONE, sessionEpoch: EPOCH_A };
    assert.equal((await registerLiveActivityToken(fake.client, USER_A, base)).status, 400);
    assert.equal((await registerLiveActivityToken(fake.client, USER_A, { ...base, generation: -1 })).status, 400);
    assert.equal((await registerLiveActivityToken(fake.client, USER_A, { ...base, generation: 1.5 })).status, 400);
    assert.equal(fake.calls.length, 0);
  });

  test("iki token türünde RPC yoksa 503 ve güvensiz fallback yok", async () => {
    for (const tokenType of ["push_to_start", "activity_update"] as const) {
      const fake = makeFakeSupabase(() => ({ error: { code: "PGRST202" } }));
      const result = await registerLiveActivityToken(fake.client, USER_A, {
        tokenType, token: PUSH_TOKEN, ...(tokenType === "activity_update" ? { tripId: TRIP_ID } : {}),
        installationId: INSTALL_IPHONE, sessionEpoch: EPOCH_A, generation: GENERATION,
      });
      assert.equal(result.status, 503);
      assert.equal(fake.calls.length, 1);
    }
  });

  test("çıkış: generation+epoch atomik RPC'ye taşınır; migration yoksa fallback yerine 503", async () => {
    const fake = makeFakeSupabase();
    assert.equal((await deactivateLiveActivityInstallation(
      fake.client, USER_A, INSTALL_IPHONE, EPOCH_A, GENERATION,
    )).status, 200);
    assert.deepEqual(fake.calls[0], {
      name: "deactivate_live_activity_installation",
      args: { p_user_id: USER_A, p_installation_id: INSTALL_IPHONE, p_epoch: EPOCH_A, p_generation: GENERATION },
    });
    const missing = makeFakeSupabase(() => ({ error: { code: "PGRST202" } }));
    assert.equal((await deactivateLiveActivityInstallation(
      missing.client, USER_A, INSTALL_IPHONE, EPOCH_A, GENERATION,
    )).status, 503);
  });

  test("çıkış: eksik/geçersiz generation veya UUID 400", async () => {
    const fake = makeFakeSupabase();
    assert.equal((await deactivateLiveActivityInstallation(fake.client, USER_A, INSTALL_IPHONE, EPOCH_A, 0)).status, 400);
    assert.equal((await deactivateLiveActivityInstallation(fake.client, USER_A, INSTALL_IPHONE, "bozuk", 1)).status, 400);
    assert.equal(fake.calls.length, 0);
  });
}
