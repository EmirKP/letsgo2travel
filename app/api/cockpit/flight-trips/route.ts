import { requireAuthenticatedUser } from "@/lib/authenticated-user";
import { boundedWait } from "@/lib/bounded-wait";
import { boundedJson } from "@/lib/travel-assistant/http";
import { flightLookupSettings, supportsFlightLookupV2 } from "@/lib/flight-lookup-access";
import { verifyFlightReceipt } from "@/lib/flight-selection-receipt";

export const runtime = "nodejs";
export const maxDuration = 20;
const reply = (body: object, status = 200) => Response.json({ protocol: 2, ...body }, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request) {
  const settings = flightLookupSettings();
  if (!settings || settings.mode !== "commercial") return reply({ code: "unavailable" }, 503);
  if (!supportsFlightLookupV2(request)) return reply({ code: "update-required" }, 426);
  try {
    const auth = await boundedWait(requireAuthenticatedUser(request), AbortSignal.timeout(4000));
    if (!auth.ok) { auth.response.headers.set("Cache-Control", "private, no-store"); return auth.response; }
    let body: Record<string, unknown>;
    try { body = await boundedWait(boundedJson(request, 30000), AbortSignal.timeout(3000)) as Record<string, unknown>; }
    catch { return reply({ code: "invalid" }, 400); }
    const selection = verifyFlightReceipt(body?.receipt, auth.user.id, process.env.FLIGHT_LOOKUP_RECEIPT_SECRET!);
    if (!selection) return reply({ code: "selection-expired" }, 409);
    const end = typeof body.endDate === "string" ? body.endDate : "";
    const stamp = Date.parse(`${end}T00:00:00Z`);
    const pnr = typeof body.flightPnr === "string" ? body.flightPnr.trim().toUpperCase() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(end) || !Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0, 10) !== end
      || end < selection.query.date || end < selection.flight.arrivalDate || stamp > Date.now() + 730 * 86400000
      || (pnr && !/^[A-Z0-9-]{3,20}$/.test(pnr)) || (body.appLanguage !== "tr" && body.appLanguage !== "en")
      || !Array.isArray(body.checklistItems) || body.checklistItems.length > 50) return reply({ code: "invalid" }, 400);
    const signal = AbortSignal.timeout(5000);
    const readiness = await boundedWait(auth.supabase.rpc("flight_lookup_retention_ready").abortSignal(signal), signal);
    if (readiness.error || readiness.data !== true) return reply({ code: "unavailable" }, 503);
    const result = await boundedWait(auth.supabase.rpc("create_flight_lookup_trip", {
      p_user: auth.user.id, p_receipt_id: selection.nonce, p_flight_number: selection.query.flightNumber,
      p_start_date: selection.query.date, p_end_date: end, p_flight_pnr: pnr || null,
      p_checklist_items: body.checklistItems, p_app_language: body.appLanguage, p_flight: selection.flight,
      p_fetched_at: selection.flight.fetchedAt, p_expires_at: selection.expiresAt,
    }).abortSignal(signal), signal);
    if (result.error || !result.data) return reply({ code: "unavailable" }, 503);
    return reply({ trip: result.data, flight: selection.flight, expiresAt: selection.expiresAt });
  } catch { return reply({ code: "unavailable" }, 503); }
}
