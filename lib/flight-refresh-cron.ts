import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { LiveActivityUpdatePayload, LiveActivityEndPayload } from "./push/apns";
import type { FlightMatch } from "./flight-lookup";
import type { flightLookupSettings } from "./flight-lookup-access";
import { boundedWait } from "./bounded-wait";
import { refreshFlight } from "./flight-refresh-service";

type Settings = NonNullable<ReturnType<typeof flightLookupSettings>>;
type Job = { trip_id: string; user_id: string; lease_id: string; generation: number };
type Envelope = { tripId: string; userId: string; generation: number; terminal: boolean; flight: FlightMatch | null; expiresAt: string | null; language: string; tokens: { id: string }[] };
type Transport = (token: string, payload: LiveActivityUpdatePayload | LiveActivityEndPayload) => Promise<{ ok: boolean; shouldDisableToken: boolean }>;

/** This worker only updates existing activities. A lease, token/session fence and
 * monotonic APNs timestamp prevent delayed work from restarting a closed card. */
export async function runFlightRefreshCron(supabase: SupabaseClient, settings: Settings, send: Transport,
  options: { refresh?: typeof refreshFlight; clock?: () => number; softDeadlineMs?: number } = {}) {
  const summary = { claimed: 0, refreshed: 0, sent: 0, ended: 0, skipped: 0, failed: 0, deferred: 0 };
  if (settings.mode !== "commercial" || !settings.nativeDisplayAllowed) return summary;
  const clock = options.clock || Date.now, deadline = clock() + Math.min(45000, Math.max(1, options.softDeadlineMs ?? 45000));
  const refresh = options.refresh || refreshFlight;
  const rpc = async (name: string, args: Record<string, unknown>) => {
    const signal = AbortSignal.timeout(3000);
    const result = await boundedWait(supabase.rpc(name, args).abortSignal(signal), signal);
    if (result.error) throw new Error("flight-background-storage");
    return result.data;
  };
  const jobs = await rpc("claim_flight_native_refresh_batch", { p_limit: 10 }) as Job[];
  if (!Array.isArray(jobs) || jobs.length > 10) throw new Error("flight-background-batch");
  summary.claimed = jobs.length;
  const work = async (job: Job) => {
    if (clock() > deadline - 25000) { summary.deferred++; return; }
    try {
      const before = await rpc("read_flight_native_refresh", { p_trip_id: job.trip_id, p_lease_id: job.lease_id }) as Envelope | null;
      if (!before || before.userId !== job.user_id || !Array.isArray(before.tokens) || !before.tokens.length) { summary.skipped++; return; }
      if (!before.terminal) {
        const result = await refresh(supabase, job.user_id, job.trip_id, job.lease_id, settings);
        if (result.status !== 200) { summary.failed++; return; }
        if (result.body.cached !== true) summary.refreshed++;
      }
      const latest = await rpc("read_flight_native_refresh", { p_trip_id: job.trip_id, p_lease_id: job.lease_id }) as Envelope | null;
      if (!latest || latest.userId !== job.user_id || !Array.isArray(latest.tokens)) { summary.skipped++; return; }
      const f = latest.flight, p = f?.progress, now = clock();
      if (!Number.isSafeInteger(latest.generation) || latest.generation * 1000 > now + 30000) { summary.skipped++; return; }
      // Retrieval does not make an old source fresh. Unknown/stale provider
      // status does not refresh an OS card as though it were a new observation.
      if (!latest.terminal && (!f || f.nativeDisplayAllowed !== true || !p?.sourceUpdatedAt || !p.freshUntil
        || Date.parse(p.freshUntil) <= now || !latest.expiresAt || Date.parse(latest.expiresAt) <= now
        || p.phase === "arrived" || p.phase === "unavailable")) { summary.skipped++; return; }
      const changed = Boolean(p && before.flight?.progress && p.sourceUpdatedAt !== before.flight.progress.sourceUpdatedAt
        && (p.status !== before.flight.progress.status || p.departure.revisedAt !== before.flight.progress.departure.revisedAt || p.arrival.revisedAt !== before.flight.progress.arrival.revisedAt));
      const payload: LiveActivityUpdatePayload | LiveActivityEndPayload = latest.terminal
        ? { event: "end", collapseId: `fl-${job.trip_id}`, timestampMs: latest.generation * 1000, departureAtMs: 0 }
        : { event: "update", collapseId: `fl-${job.trip_id}`, timestampMs: latest.generation * 1000,
          departureAtMs: Date.parse(f!.departureAt), arrivalAtMs: Date.parse(f!.arrivalAt),
          provider: { status: p!.status, updatedAtMs: Date.parse(p!.sourceUpdatedAt!), freshUntilMs: Date.parse(p!.freshUntil!), expiresAtMs: Date.parse(latest.expiresAt!),
            ...(p!.departure.revisedAt ? { revisedDepartureAtMs: Date.parse(p!.departure.revisedAt), departureKind: p!.departure.revisedKind || "unknown" } : {}),
            ...(p!.arrival.revisedAt ? { revisedArrivalAtMs: Date.parse(p!.arrival.revisedAt), arrivalKind: p!.arrival.revisedKind || "unknown" } : {}) },
          ...(changed ? { alert: latest.language === "sq" ? { title: "Përditësim fluturimi", body: "Ka një përditësim për fluturimin tënd. Hap hollësitë e fundit." } : latest.language === "en" ? { title: "Flight update", body: "Your flight has an update. Open the latest details." }
            : { title: "Uçuş güncellemesi", body: "Uçuşunda güncelleme var. Güncel bilgileri aç." } } : {}) };
      const deliver = async (token: { id: string }) => {
        if (clock() > deadline - 12000) { summary.deferred++; return; }
        const claim = randomUUID();
        const value = await rpc("claim_flight_native_delivery", { p_trip_id: job.trip_id, p_lease_id: job.lease_id, p_generation: latest.generation, p_token_id: token.id, p_claim_id: claim });
        if (typeof value !== "string" || !value) { summary.skipped++; return; }
        let result = { ok: false, shouldDisableToken: false };
        try { result = await boundedWait(send(value, payload), AbortSignal.timeout(11000)); } catch { /* retry remains leased/deduplicated */ }
        await rpc("settle_flight_native_delivery", { p_trip_id: job.trip_id, p_token_id: token.id, p_claim_id: claim, p_sent: result.ok, p_disable: result.shouldDisableToken });
        if (result.ok) { summary.sent++; if (latest.terminal) summary.ended++; } else summary.failed++;
      };
      const tokens = latest.tokens.slice(0, 10);
      for (let i = 0; i < tokens.length; i += 2) {
        const results = await Promise.allSettled(tokens.slice(i, i + 2).map(deliver));
        for (const result of results) if (result.status === "rejected") summary.failed++;
      }
    } catch { summary.failed++; }
    finally {
      try { await rpc("release_flight_native_refresh", { p_trip_id: job.trip_id, p_lease_id: job.lease_id }); } catch { /* bounded lease expires without a false success */ }
    }
  };
  for (let i = 0; i < jobs.length; i += 2) await Promise.allSettled(jobs.slice(i, i + 2).map(work));
  return summary;
}
