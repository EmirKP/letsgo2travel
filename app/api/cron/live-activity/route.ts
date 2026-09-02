import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { sendApnsLiveActivity } from "@/lib/push/apns";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Live Activity push-to-start / bitirme cron'u.
// - Kalkışa ≤3 saat kalan kokpit uçuşları için kullanıcının push-to-start
//   tokenlarına APNs "liveactivity" başlatma push'u gönderir (iOS 17.2+;
//   uygulama KAPALIYKEN de Ada/kilit ekranı aktivitesi başlar).
// - Kalkıştan 1 saat sonra, başlamış aktiviteleri activity_update
//   tokenlarıyla bitirir.
// - Aynı seyahate mükerrer push atılmaz (live_activity_events kaydı).
// - YALNIZ Bearer CRON_SECRET ile çalışır (query secret kabul edilmez).
// - Token değerleri hiçbir log/yanıtta yer almaz.
// Desteklenmeyen cihazlar için uygulama içi başlatma + yerel bildirim
// fallback'i mobil tarafta aynen devam eder.

const LEAD_MS = 3 * 60 * 60 * 1000;
const TAIL_MS = 60 * 60 * 1000;
const BATCH_LIMIT = 20;

function isAuthorizedCron(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return false;
  const authHeader = request.headers.get("authorization") || "";
  if (!authHeader.startsWith("Bearer ")) return false;
  const provided = authHeader.slice(7).trim();
  if (!provided || provided.length !== cronSecret.length) return false;
  let mismatch = 0;
  for (let i = 0; i < cronSecret.length; i += 1) {
    mismatch |= provided.charCodeAt(i) ^ cronSecret.charCodeAt(i);
  }
  return mismatch === 0;
}

type TripRow = {
  id: string;
  user_id: string;
  destination_country: string | null;
  destination_city: string | null;
  departure_at: string | null;
  origin_iata?: string | null;
  destination_iata?: string | null;
};

function tripTitle(trip: TripRow) {
  return [trip.destination_city, trip.destination_country].filter(Boolean).join(", ") || "Yaklaşan uçuş";
}

async function selectTrips(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  fromIso: string,
  toIso: string,
) {
  const base = "id,user_id,destination_country,destination_city,departure_at";
  const withFlight = `${base},origin_iata,destination_iata`;
  const query = (select: string) => supabase
    .from("trips")
    .select(select)
    .gte("departure_at", fromIso)
    .lt("departure_at", toIso)
    .in("status", ["upcoming", "active"])
    .order("departure_at", { ascending: true })
    .limit(BATCH_LIMIT);
  const first = await query(withFlight);
  if (!first.error) return first.data as unknown as TripRow[];
  // 42703: uçuş sütunu migration'ı üretimde henüz yok — IATA'sız devam et.
  if ((first.error as { code?: string }).code === "42703") {
    const legacy = await query(base);
    if (legacy.error) throw new Error("trips sorgusu başarısız");
    return legacy.data as unknown as TripRow[];
  }
  throw new Error("trips sorgusu başarısız");
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET is not configured" }, { status: 500 });
  }
  if (!isAuthorizedCron(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Servis kullanılamıyor." }, { status: 503 });

  const now = Date.now();
  const summary = { startsSent: 0, endsSent: 0, tokensDisabled: 0, skipped: 0, errors: 0 };

  try {
    // -------- 1) BAŞLATMA: kalkışa ≤3 saat kalan uçuşlar ----------------
    const startTrips = await selectTrips(
      supabase,
      new Date(now).toISOString(),
      new Date(now + LEAD_MS).toISOString(),
    );
    for (const trip of startTrips) {
      const departureMs = Date.parse(String(trip.departure_at || ""));
      if (!Number.isFinite(departureMs)) { summary.skipped += 1; continue; }

      const { data: existing } = await supabase
        .from("live_activity_events")
        .select("event")
        .eq("trip_id", trip.id)
        .eq("event", "start")
        .limit(1);
      if (existing?.length) { summary.skipped += 1; continue; }

      const { data: tokens } = await supabase
        .from("live_activity_tokens")
        .select("id,token")
        .eq("user_id", trip.user_id)
        .eq("token_type", "push_to_start")
        .eq("enabled", true)
        .limit(10);
      if (!tokens?.length) { summary.skipped += 1; continue; }

      let anyOk = false;
      for (const row of tokens) {
        const result = await sendApnsLiveActivity(String(row.token), {
          event: "start",
          attributes: {
            tripId: trip.id,
            title: tripTitle(trip),
            originIata: String(trip.origin_iata || ""),
            destinationIata: String(trip.destination_iata || ""),
            deepLink: `letsgo2travel://cockpit?tripId=${trip.id}`,
          },
          departureAtMs: departureMs,
          alert: { title: "Uçuşun yaklaşıyor ✈️", body: `${tripTitle(trip)} uçuşuna 3 saat kaldı.` },
        });
        if (result.ok) anyOk = true;
        else if (result.shouldDisableToken) {
          summary.tokensDisabled += 1;
          await supabase.from("live_activity_tokens")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("id", row.id);
        }
      }
      if (anyOk) {
        summary.startsSent += 1;
        await supabase.from("live_activity_events").upsert({ trip_id: trip.id, event: "start" });
      } else {
        summary.errors += 1;
      }
    }

    // -------- 2) BİTİRME: kalkış + 1 saat geçmiş aktiviteler ------------
    const { data: startedEvents } = await supabase
      .from("live_activity_events")
      .select("trip_id")
      .eq("event", "start")
      .order("sent_at", { ascending: true })
      .limit(BATCH_LIMIT * 4);
    for (const eventRow of startedEvents || []) {
      const tripId = String(eventRow.trip_id);
      const { data: ended } = await supabase
        .from("live_activity_events")
        .select("event")
        .eq("trip_id", tripId)
        .eq("event", "end")
        .limit(1);
      if (ended?.length) continue;

      const { data: tripRows } = await supabase
        .from("trips")
        .select("id,departure_at")
        .eq("id", tripId)
        .limit(1);
      const departureMs = Date.parse(String(tripRows?.[0]?.departure_at || ""));
      const shouldEnd = !tripRows?.length || !Number.isFinite(departureMs) || departureMs + TAIL_MS < now;
      if (!shouldEnd) continue;

      const { data: updateTokens } = await supabase
        .from("live_activity_tokens")
        .select("id,token")
        .eq("trip_id", tripId)
        .eq("token_type", "activity_update")
        .eq("enabled", true)
        .limit(10);
      for (const row of updateTokens || []) {
        const result = await sendApnsLiveActivity(String(row.token), {
          event: "end",
          departureAtMs: Number.isFinite(departureMs) ? departureMs : now,
        });
        if (result.shouldDisableToken) {
          summary.tokensDisabled += 1;
          await supabase.from("live_activity_tokens")
            .update({ enabled: false, updated_at: new Date().toISOString() })
            .eq("id", row.id);
        }
      }
      summary.endsSent += 1;
      await supabase.from("live_activity_events").upsert({ trip_id: tripId, event: "end" });
    }

    return NextResponse.json({ success: true, ...summary }, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch (error) {
    // 42P01: live_activity tabloları üretimde henüz yok (migration bekliyor).
    const code = (error as { code?: string }).code;
    console.error("live_activity_cron_hatasi", { code: code || "unknown" });
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : "Live Activity cron çalıştırılamadı.",
    }, { status: 500 });
  }
}
