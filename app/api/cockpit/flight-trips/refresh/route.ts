import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { boundedWait } from "@/lib/bounded-wait";
import { boundedJson } from "@/lib/travel-assistant/http";
import { flightLookupSettings, flightLookupProtocol } from "@/lib/flight-lookup-access";
import { refreshFlight } from "@/lib/flight-refresh-service";

export const runtime = "nodejs";
export const maxDuration = 25;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const reply = (body: object, status = 200) => Response.json({ protocol: 3, ...body }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const settings = flightLookupSettings();
  if (!settings || settings.mode !== "commercial") return reply({ code: "unavailable" }, 503);
  if (flightLookupProtocol(request) !== 3) return reply({ code: "update-required" }, 426);
  try {
    const auth = await boundedWait(requireAuthenticatedUser(request), AbortSignal.timeout(4000));
    if (!auth.ok) { auth.response.headers.set("Cache-Control", "private, no-store"); return auth.response; }
    let input: Record<string, unknown>;
    try { input = await boundedWait(boundedJson(request, 1024), AbortSignal.timeout(3000)) as Record<string, unknown>; }
    catch { return reply({ code: "invalid" }, 400); }
    if (typeof input?.tripId !== "string" || !uuid.test(input.tripId) || typeof input.requestId !== "string" || !uuid.test(input.requestId)) return reply({ code: "invalid" }, 400);
    const result = await refreshFlight(auth.supabase, auth.user.id, input.tripId, input.requestId, settings);
    return reply(result.body, result.status);
  } catch { return reply({ code: "unavailable" }, 503); }
}
