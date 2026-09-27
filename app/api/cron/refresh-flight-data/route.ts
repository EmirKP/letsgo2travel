import { timingSafeEqual } from "node:crypto";
import { flightLookupSettings } from "@/lib/flight-lookup-access";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { runFlightRefreshCron } from "@/lib/flight-refresh-cron";
import { sendApnsLiveActivity } from "@/lib/push/apns";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

/** Prepared endpoint only; intentionally absent from vercel.json schedules. */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET, header = request.headers.get("Authorization") || "";
  const expected = secret ? Buffer.from(`Bearer ${secret}`) : null, supplied = Buffer.from(header);
  if (!expected || expected.length !== supplied.length || !timingSafeEqual(expected, supplied) || new URL(request.url).search) return reply({ code: "unauthorized" }, 401);
  const settings = flightLookupSettings();
  if (process.env.FLIGHT_LOOKUP_BACKGROUND_ENABLED !== "true" || !settings || settings.mode !== "commercial" || !settings.nativeDisplayAllowed
    || !process.env.APNS_KEY_ID || !process.env.APNS_TEAM_ID || !process.env.APNS_PRIVATE_KEY) return reply({ code: "unavailable" }, 503);
  const db = getSupabaseAdmin();
  if (!db) return reply({ code: "unavailable" }, 503);
  try { return reply({ success: true, ...await runFlightRefreshCron(db, settings, sendApnsLiveActivity) }); }
  catch { return reply({ code: "unavailable" }, 503); }
}
