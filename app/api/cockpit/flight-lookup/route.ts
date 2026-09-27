import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { boundedWait } from "@/lib/bounded-wait";
import { boundedJson } from "@/lib/travel-assistant/http";
import { flightLookupInput, normalizeFlightMatches } from "@/lib/flight-lookup";

export const runtime = "nodejs";
export const maxDuration = 25;
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
const monthlyLimit = () => Number(process.env.FLIGHT_LOOKUP_MONTHLY_LIMIT);
const configured = () => process.env.FLIGHT_LOOKUP_ENABLED === "true" && Boolean(process.env.AERODATABOX_API_KEY?.trim())
  && Number.isInteger(monthlyLimit()) && monthlyLimit() > 0 && monthlyLimit() <= 10000;
let readiness: { until: number; available: boolean } | null = null;
let pending: Promise<boolean> | null = null;
export async function GET() {
  if (!configured()) return reply({ available: false });
  if (!readiness || readiness.until <= Date.now()) {
    pending ??= (async () => {
      try {
        const admin = getSupabaseAdmin();
        if (!admin) return false;
        const signal = AbortSignal.timeout(3000);
        const result = await boundedWait(admin.rpc("consume_flight_lookup_quota", { p_user: null, p_monthly_limit: monthlyLimit() }).abortSignal(signal), signal);
        return !result.error && result.data === false;
      } catch { return false; }
    })();
    const available = await pending;
    readiness = { until: Date.now() + (available ? 30000 : 5000), available };
    pending = null;
  }
  return reply({ available: readiness.available });
}

export async function POST(request: Request) {
  if (!configured()) return reply({ code: "unavailable" }, 503);
  try {
    const auth = await boundedWait(requireAuthenticatedUser(request), AbortSignal.timeout(4000));
    if (!auth.ok) { auth.response.headers.set("Cache-Control", "private, no-store"); return auth.response; }
    let query;
    try {
      const body = await boundedWait(boundedJson(request, 1024), AbortSignal.timeout(3000)) as Record<string, unknown>;
      query = flightLookupInput(body?.flightNumber, body?.date);
    } catch { return reply({ code: "invalid" }, 400); }
    if (!query) return reply({ code: "invalid" }, 400);
    const quotaSignal = AbortSignal.timeout(3000);
    const quota = await boundedWait(auth.supabase.rpc("consume_flight_lookup_quota", { p_user: auth.user.id, p_monthly_limit: monthlyLimit() }).abortSignal(quotaSignal), quotaSignal);
    if (quota.error) return reply({ code: "unavailable" }, 503);
    if (quota.data !== true) return reply({ code: "limit" }, 429);
    // The provider host and projection are fixed; tokens/PNR never leave our server.
    const url = `https://api.aerodatabox.com/flights/number/${encodeURIComponent(query.flightNumber)}/${query.date}?dateLocalRole=Departure&withAircraftImage=false&withLocation=false&withFlightPlan=false`;
    const signal = AbortSignal.timeout(8000);
    const response = await fetch(url, { headers: { "X-Api-Key": process.env.AERODATABOX_API_KEY!.trim(), Accept: "application/json" }, signal, cache: "no-store", redirect: "error" });
    if (response.status === 204) return reply({ flights: [] });
    if (response.status === 429) return reply({ code: "limit" }, 429);
    if (!response.ok) return reply({ code: "unavailable" }, 503);
    const payload = await boundedWait(boundedJson(response as unknown as Request, 300000), signal);
    return reply({ flights: normalizeFlightMatches(payload, query) });
  } catch { return reply({ code: "unavailable" }, 503); }
}
