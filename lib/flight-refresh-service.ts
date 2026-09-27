import type { SupabaseClient } from "@supabase/supabase-js";
import { boundedWait } from "./bounded-wait";
import { boundedJson } from "./travel-assistant/http";
import { FLIGHT_DATA_LIFETIME_MS, type flightLookupSettings } from "./flight-lookup-access";
import { flightLookupInput, inspectFlightMatches, type FlightMatch } from "./flight-lookup";
import { buildFlightProviderRequest } from "./flight-provider";

type Reservation = { kind: string; trip?: Record<string, unknown>; flight?: FlightMatch | null; expiresAt?: string | null };
export type FlightRefreshResult = { status: number; body: Record<string, unknown> };
const reply = (body: Record<string, unknown>, status = 200): FlightRefreshResult => ({ status, body });

/** Shared by authenticated foreground calls and leased background jobs.
 * Caller supplies the independently authenticated owner, never a client body. */
export async function refreshFlight(supabase: SupabaseClient, userId: string, tripId: string, requestId: string,
  settings: NonNullable<ReturnType<typeof flightLookupSettings>>): Promise<FlightRefreshResult> {
  if (settings.mode !== "commercial") return reply({ code: "unavailable" }, 503);
  try {
    const rpc = async (name: string, args?: Record<string, unknown>) => {
      const signal = AbortSignal.timeout(3000);
      return boundedWait(supabase.rpc(name, args).abortSignal(signal), signal);
    };
    const reserved = await rpc("reserve_flight_lookup_refresh", { p_user: userId, p_trip_id: tripId, p_request_id: requestId });
    if (reserved.error || !reserved.data) return reply({ code: "unavailable" }, 503);
    const reservation = reserved.data as Reservation;
    const project = (value: Reservation) => ({ trip: value.trip, flight: value.flight ? { ...value.flight,
      nativeDisplayAllowed: settings.nativeDisplayAllowed && value.flight.nativeDisplayAllowed === true && Boolean(value.flight.progress) } : null, expiresAt: value.expiresAt ?? null });
    if (reservation.kind === "cached") return reply({ ...project(reservation), cached: true, refreshAfterSeconds: 300 });
    if (reservation.kind === "terminal") return reply({ ...project(reservation), cached: true, terminal: true });
    if (reservation.kind === "busy") return reply({ code: "refresh-pending", retryAfterSeconds: 30 }, 409);
    if (reservation.kind !== "reserved" || !reservation.flight || !reservation.trip) return reply({ code: "refresh-unavailable", retryAfterSeconds: 300 }, 409);
    const complete = (outcome: "updated" | "terminal" | "failed", flight?: FlightMatch) => rpc("finish_flight_lookup_refresh", {
      p_user: userId, p_trip_id: tripId, p_request_id: requestId, p_outcome: outcome,
      p_flight: flight ?? null, p_fetched_at: flight?.fetchedAt ?? null,
      p_expires_at: flight ? new Date(Date.parse(flight.fetchedAt) + FLIGHT_DATA_LIFETIME_MS).toISOString() : null,
    });
    // Failures reserve the cost-guard window but do not erase a valid old overlay.
    const failed = async (code: string, status: number) => { try { await complete("failed"); } catch { /* reservation expires safely */ } return reply({ code, retryAfterSeconds: 300 }, status); };
    try {
      const original = reservation.flight;
      const query = flightLookupInput(reservation.trip.flight_number, reservation.trip.start_date);
      if (!query) return failed("refresh-unavailable", 409);
      const quota = await rpc("consume_flight_lookup_quota", { p_user: userId, p_monthly_limit: settings.limit });
      if (quota.error) return failed("unavailable", 503);
      if (quota.data !== true) return failed("limit", 429);
      const { url, headers } = buildFlightProviderRequest(query, settings.provider);
      const signal = AbortSignal.timeout(8000);
      const response = await boundedWait(fetch(url, { headers, signal, cache: "no-store", redirect: "error" }), signal);
      if (response.status === 429) return failed("limit", 429);
      if (!response.ok || response.status === 204) return failed("refresh-unavailable", 503);
      const payload = await boundedWait(boundedJson(response as unknown as Request, 300000), signal);
      const now = new Date();
      const matches = inspectFlightMatches(payload, query, now, { includeInProgress: true, includeTerminal: true }).flights
        .filter(f => f.origin.iata === original.origin.iata && f.destination.iata === original.destination.iata);
      // Multiple same-route legs require a new explicit selection, not guessing.
      if (matches.length !== 1) return failed("refresh-unavailable", 409);
      const flight = { ...matches[0], nativeDisplayAllowed: settings.nativeDisplayAllowed };
      const terminal = flight.progress?.phase === "arrived" || flight.progress?.phase === "unavailable";
      if (terminal && flight.progress?.freshness !== "fresh") return failed("stale-source", 409);
      const result = await complete(terminal ? "terminal" : "updated", flight);
      if (result.error || !result.data) return reply({ code: "unavailable" }, 503);
      const saved = result.data as Reservation;
      if (saved.kind !== "updated" && saved.kind !== "terminal") return reply({ code: "refresh-conflict", retryAfterSeconds: 300 }, 409);
      return reply({ ...project(saved), cached: false, refreshAfterSeconds: 300,
        ...(terminal ? { terminal: true, terminalStatus: flight.progress?.status, sourceUpdatedAt: flight.progress?.sourceUpdatedAt } : {}) });
    } catch { return failed("unavailable", 503); }
  } catch { return reply({ code: "unavailable" }, 503); }
}
