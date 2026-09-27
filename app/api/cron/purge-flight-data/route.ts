import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { boundedWait } from "@/lib/bounded-wait";

export const runtime = "nodejs";
export const maxDuration = 30;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const provided = request.headers.get("authorization") || "";
  if (!secret) return reply({ ok: false }, 503);
  const expected = Buffer.from(`Bearer ${secret}`), actual = Buffer.from(provided);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return reply({ ok: false }, 401);
  try {
    const admin = getSupabaseAdmin();
    if (!admin) return reply({ ok: false }, 503);
    const signal = AbortSignal.timeout(20000);
    const result = await boundedWait(admin.rpc("purge_expired_trip_flight_data").abortSignal(signal), signal);
    if (result.error || typeof result.data !== "number") return reply({ ok: false }, 503);
    return reply({ ok: true, removed: result.data });
  } catch { return reply({ ok: false }, 503); }
}
