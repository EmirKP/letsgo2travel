import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { boundedWait } from "@/lib/bounded-wait";
import { boundedJson } from "@/lib/travel-assistant/http";
import { flightLookupInput, inspectFlightMatches } from "@/lib/flight-lookup";
import { buildFlightProviderRequest } from "@/lib/flight-provider";
import { flightLookupAllowed, flightLookupSettings, flightLookupProtocol, supportsFlightLookupV2, FLIGHT_DATA_LIFETIME_MS } from "@/lib/flight-lookup-access";
import { issueFlightReceipt } from "@/lib/flight-selection-receipt";
import { flightSelectionDeadline } from "@/lib/flight-progress";

export const runtime = "nodejs";
export const maxDuration = 25;
const responder = (request: Request) => (body: object, status = 200) => Response.json({ protocol: flightLookupProtocol(request), ...body }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function GET(request: Request) {
  const reply = responder(request), protocol = flightLookupProtocol(request);
  const settings = flightLookupSettings();
  if (!settings || !supportsFlightLookupV2(request)) return reply({ available: false });
  try {
    const auth = await boundedWait(requireAuthenticatedUser(request), AbortSignal.timeout(4000));
    if (!auth.ok || !flightLookupAllowed(settings, auth.user.id)) return reply({ available: false });
    const signal = AbortSignal.timeout(3000);
    const quota = await boundedWait(auth.supabase.rpc("consume_flight_lookup_quota", { p_user: null, p_monthly_limit: settings.limit }).abortSignal(signal), signal);
    if (quota.error || quota.data !== false) return reply({ available: false });
    if (settings.mode === "commercial") {
      const retention = await boundedWait(auth.supabase.rpc(protocol === 3 ? "flight_lookup_refresh_ready" : "flight_lookup_retention_ready").abortSignal(signal), signal);
      if (retention.error || retention.data !== true) return reply({ available: false });
    }
    return reply({ available: true, mode: settings.mode, maySave: settings.mode === "commercial", ...(protocol === 3 ? { nativeDisplayAllowed: settings.nativeDisplayAllowed } : {}) });
  } catch { return reply({ available: false }); }
}

export async function POST(request: Request) {
  const reply = responder(request), protocol = flightLookupProtocol(request);
  const settings = flightLookupSettings();
  if (!settings) return reply({ code: "unavailable" }, 503);
  if (!supportsFlightLookupV2(request)) return reply({ code: "update-required" }, 426);
  try {
    const auth = await boundedWait(requireAuthenticatedUser(request), AbortSignal.timeout(4000));
    if (!auth.ok) { auth.response.headers.set("Cache-Control", "private, no-store"); return auth.response; }
    if (!flightLookupAllowed(settings, auth.user.id)) return reply({ code: "unavailable" }, 403);
    let query;
    try {
      const body = await boundedWait(boundedJson(request, 1024), AbortSignal.timeout(3000)) as Record<string, unknown>;
      query = flightLookupInput(body?.flightNumber, body?.date);
    } catch { return reply({ code: "invalid" }, 400); }
    if (!query) return reply({ code: "invalid" }, 400);
    const quotaSignal = AbortSignal.timeout(3000);
    if (settings.mode === "commercial") {
      const retention = await boundedWait(auth.supabase.rpc(protocol === 3 ? "flight_lookup_refresh_ready" : "flight_lookup_retention_ready").abortSignal(quotaSignal), quotaSignal);
      if (retention.error || retention.data !== true) return reply({ code: "unavailable" }, 503);
    }
    const quota = await boundedWait(auth.supabase.rpc("consume_flight_lookup_quota", { p_user: auth.user.id, p_monthly_limit: settings.limit }).abortSignal(quotaSignal), quotaSignal);
    if (quota.error) return reply({ code: "unavailable" }, 503);
    if (quota.data !== true) return reply({ code: "limit" }, 429);
    const { url, headers } = buildFlightProviderRequest(query, settings.provider);
    const signal = AbortSignal.timeout(8000);
    const response = await fetch(url, { headers, signal, cache: "no-store", redirect: "error" });
    if (response.status === 204) return reply({ flights: [], reason: "not-found", maySave: settings.mode === "commercial" });
    if (response.status === 429) return reply({ code: "limit" }, 429);
    if (!response.ok) return reply({ code: "unavailable" }, 503);
    const payload = await boundedWait(boundedJson(response as unknown as Request, 300000), signal);
    const now = new Date();
    const inspected = inspectFlightMatches(payload, query, now, { includeInProgress: protocol === 3 });
    const maySave = settings.mode === "commercial";
    const flights = inspected.flights.map(value => {
      const flight = { ...value, ...(protocol === 3 ? { nativeDisplayAllowed: settings.nativeDisplayAllowed } : {}) };
      const selectable = maySave && flightSelectionDeadline(flight, now) > now.getTime();
      return { ...flight, maySave: selectable,
        ...(selectable ? issueFlightReceipt(auth.user.id, query, flight, process.env.FLIGHT_LOOKUP_RECEIPT_SECRET!, now)
          : { receipt: null, expiresAt: new Date(Date.parse(flight.fetchedAt) + FLIGHT_DATA_LIFETIME_MS).toISOString() }) };
    });
    return reply({ flights, reason: inspected.reason, maySave });
  } catch { return reply({ code: "unavailable" }, 503); }
}
