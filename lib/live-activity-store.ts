// Supabase (service-role) uyarlayıcısı: lib/live-activity-cron.ts'in
// LiveActivityStore arayüzünü PostgREST üzerinde ATOMİK olarak uygular.
// - claim: tek UPDATE (id + status + attempt_count guard'ı + lease bitmiş)
//   → Postgres satır kilidi sayesinde paralel cron'lardan yalnız biri alır.
// - settle: tek UPDATE (id + claim_token) → eski worker yeni claim'i ezemez.
// Token değerleri log/yanıtlara yazılmaz.

import type {
  CronToken,
  CronTrip,
  DeliveryRow,
  LiveActivityStore,
  SettlePatch,
} from "./live-activity-cron";

type SupabaseLike = any;

type TripSqlRow = {
  id: string;
  user_id: string;
  destination_country: string | null;
  destination_city: string | null;
  departure_at: string | null;
  arrival_at?: string | null;
  app_language?: string | null;
  origin_iata?: string | null;
  destination_iata?: string | null;
};

const TRIP_BASE_SELECT = "id,user_id,destination_country,destination_city,departure_at";
const TRIP_FLIGHT_SELECT = `${TRIP_BASE_SELECT},origin_iata,destination_iata,arrival_at,app_language`;
let tripFlightColumnsSupported = true;

function toCronTrip(row: TripSqlRow): CronTrip | null {
  const departureAtMs = Date.parse(String(row.departure_at || ""));
  const parsedArrivalAtMs = Date.parse(String(row.arrival_at || ""));
  if (!Number.isFinite(departureAtMs)) return null;
  return {
    id: String(row.id),
    userId: String(row.user_id),
    // Dil bağımsız fallback buildStartPayload içinde seçilir.
    title: [row.destination_city, row.destination_country].filter(Boolean).join(", "),
    originIata: String(row.origin_iata || ""),
    destinationIata: String(row.destination_iata || ""),
    departureAtMs,
    arrivalAtMs: Number.isFinite(parsedArrivalAtMs) && parsedArrivalAtMs > departureAtMs ? parsedArrivalAtMs : undefined,
    language: row.app_language === "en" ? "en" : "tr",
  };
}

function toDeliveryRow(row: Record<string, unknown>): DeliveryRow {
  const claimedUntil = Date.parse(String(row.claimed_until || ""));
  const nextRetry = Date.parse(String(row.next_retry_at || ""));
  return {
    id: String(row.id),
    tripId: String(row.trip_id),
    tokenId: String(row.token_id),
    event: row.event === "end" ? "end" : "start",
    status: (row.status as DeliveryRow["status"]) || "pending",
    attemptCount: Number(row.attempt_count) || 0,
    claimToken: row.claim_token ? String(row.claim_token) : null,
    claimedUntilMs: Number.isFinite(claimedUntil) ? claimedUntil : null,
    nextRetryAtMs: Number.isFinite(nextRetry) ? nextRetry : 0,
  };
}

async function selectTrips(supabase: SupabaseLike, build: (query: any) => any): Promise<CronTrip[]> {
  const run = async (select: string) => build(supabase.from("trips").select(select));
  let result = tripFlightColumnsSupported ? await run(TRIP_FLIGHT_SELECT) : await run(TRIP_BASE_SELECT);
  if (result.error && tripFlightColumnsSupported && (result.error as { code?: string }).code === "42703") {
    // Uçuş kolonu migration'ı üretimde yoksa IATA'sız devam edilir.
    tripFlightColumnsSupported = false;
    result = await run(TRIP_BASE_SELECT);
  }
  if (result.error) throw new Error(`trips_query_failed:${(result.error as { code?: string }).code || "unknown"}`);
  return ((result.data || []) as TripSqlRow[]).flatMap((row) => {
    const trip = toCronTrip(row);
    return trip ? [trip] : [];
  });
}

export function createSupabaseLiveActivityStore(supabase: SupabaseLike): LiveActivityStore {
  return {
    async tripsDepartingBetween(fromMs, toMs, limit) {
      return selectTrips(supabase, (query) => query
        .gte("departure_at", new Date(fromMs).toISOString())
        .lt("departure_at", new Date(toMs).toISOString())
        .in("status", ["upcoming", "active"])
        .order("departure_at", { ascending: true })
        .limit(limit));
    },

    async tripsEndDue(nowMs, horizonMs, limit) {
      // Planlanan varış (+ kısa karşılama payı) geçmiş kayıtlar (iptal dahil:
      // iptal edilen seyahatin açık aktivitesi de bitirilmelidir).
      const candidates = await selectTrips(supabase, (query) => query
        .lt("departure_at", new Date(nowMs).toISOString())
        .gte("departure_at", new Date(nowMs - horizonMs).toISOString())
        .order("departure_at", { ascending: true })
        .limit(limit * 4));
      return candidates
        .filter((trip) => (trip.arrivalAtMs || trip.departureAtMs + 60 * 60 * 1000) + 20 * 60 * 1000 < nowMs)
        .slice(0, limit);
    },

    async pushToStartTokensByUser(userIds) {
      const map = new Map<string, CronToken[]>();
      if (!userIds.length) return map;
      const { data, error } = await supabase
        .from("live_activity_tokens")
        .select("id,user_id,token,enabled")
        .in("user_id", userIds)
        .eq("token_type", "push_to_start")
        .eq("enabled", true);
      if (error) throw new Error("tokens_query_failed");
      for (const row of data || []) {
        const list = map.get(String(row.user_id)) || [];
        list.push({ id: String(row.id), token: String(row.token), enabled: row.enabled === true });
        map.set(String(row.user_id), list);
      }
      return map;
    },

    async activityUpdateTokensByTrip(tripIds) {
      const map = new Map<string, CronToken[]>();
      if (!tripIds.length) return map;
      const { data, error } = await supabase
        .from("live_activity_tokens")
        .select("id,trip_id,token,enabled")
        .in("trip_id", tripIds)
        .eq("token_type", "activity_update")
        .eq("enabled", true);
      if (error) throw new Error("tokens_query_failed");
      for (const row of data || []) {
        const list = map.get(String(row.trip_id)) || [];
        list.push({ id: String(row.id), token: String(row.token), enabled: row.enabled === true });
        map.set(String(row.trip_id), list);
      }
      return map;
    },

    async seedDeliveries(rows) {
      if (!rows.length) return;
      const { error } = await supabase
        .from("live_activity_deliveries")
        .upsert(
          rows.map((row) => ({ trip_id: row.tripId, token_id: row.tokenId, event: row.event })),
          { onConflict: "trip_id,token_id,event", ignoreDuplicates: true },
        );
      if (error) throw new Error(`seed_failed:${(error as { code?: string }).code || "unknown"}`);
    },

    async dueDeliveries(nowMs, limit) {
      const nowIso = new Date(nowMs).toISOString();
      const { data, error } = await supabase
        .from("live_activity_deliveries")
        .select("id,trip_id,token_id,event,status,attempt_count,claim_token,claimed_until,next_retry_at")
        .in("status", ["pending", "transient_failed"])
        .lte("next_retry_at", nowIso)
        .or(`claimed_until.is.null,claimed_until.lt.${nowIso}`)
        .order("next_retry_at", { ascending: true })
        .limit(limit);
      if (error) throw new Error(`due_query_failed:${(error as { code?: string }).code || "unknown"}`);
      return (data || []).map(toDeliveryRow);
    },

    async claimDelivery(id, expectedAttemptCount, claimToken, leaseUntilMs, nowMs) {
      const nowIso = new Date(nowMs).toISOString();
      const { data, error } = await supabase
        .from("live_activity_deliveries")
        .update({
          claim_token: claimToken,
          claimed_until: new Date(leaseUntilMs).toISOString(),
          updated_at: nowIso,
        })
        .eq("id", id)
        .in("status", ["pending", "transient_failed"])
        .eq("attempt_count", expectedAttemptCount)
        .or(`claimed_until.is.null,claimed_until.lt.${nowIso}`)
        .select("id");
      if (error) {
        // Hata GİZLENMEZ: token/secret içermeyen kod güvenli loga yazılır.
        // (Örn. 22P02 = claim_token uuid tip uyuşmazlığı — v3'te tüm
        // teslimleri sessizce durduran üretim hatası buydu.)
        console.error("live_activity_claim_hatasi", {
          code: (error as { code?: string }).code || "unknown",
          deliveryId: String(id),
        });
        return false;
      }
      return Boolean(data?.length);
    },

    async settleDelivery(id, claimToken, patch: SettlePatch) {
      const update: Record<string, unknown> = {
        status: patch.status,
        attempt_count: patch.attemptCount,
        claim_token: null,
        claimed_until: null,
        last_error: patch.lastError ? patch.lastError.slice(0, 200) : null,
        updated_at: new Date().toISOString(),
      };
      if (patch.nextRetryAtMs !== undefined) update.next_retry_at = new Date(patch.nextRetryAtMs).toISOString();
      const { data, error } = await supabase
        .from("live_activity_deliveries")
        .update(update)
        .eq("id", id)
        .eq("claim_token", claimToken)
        .select("id");
      if (error) {
        console.error("live_activity_settle_hatasi", {
          code: (error as { code?: string }).code || "unknown",
          deliveryId: String(id),
        });
        return false;
      }
      return Boolean(data?.length);
    },

    async tripsByIds(ids) {
      const map = new Map<string, CronTrip>();
      if (!ids.length) return map;
      const trips = await selectTrips(supabase, (query) => query.in("id", ids));
      for (const trip of trips) map.set(trip.id, trip);
      return map;
    },

    async tokensByIds(ids) {
      const map = new Map<string, CronToken>();
      if (!ids.length) return map;
      const { data, error } = await supabase
        .from("live_activity_tokens")
        .select("id,token,enabled")
        .in("id", ids);
      if (error) throw new Error("tokens_query_failed");
      for (const row of data || []) {
        map.set(String(row.id), { id: String(row.id), token: String(row.token), enabled: row.enabled === true });
      }
      return map;
    },

    async disableToken(tokenId) {
      await supabase
        .from("live_activity_tokens")
        .update({ enabled: false, updated_at: new Date().toISOString() })
        .eq("id", tokenId);
    },
  };
}
