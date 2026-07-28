import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

const OUTCOMES = ["no_slots", "slot_found", "verification_required", "provider_unavailable", "error"] as const;
type Outcome = (typeof OUTCOMES)[number];

function authorized(request: Request) {
  const expected = process.env.VISA_WORKER_SECRET;
  const received = request.headers.get("x-worker-secret");
  return Boolean(expected && received && expected === received);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Yetkisiz worker." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });

  const body = (await request.json()) as {
    trackId?: string;
    workerName?: string;
    outcome?: Outcome;
    message?: string;
    availableDates?: string[];
    evidenceUrl?: string;
  };
  if (!body.trackId || !body.outcome || !OUTCOMES.includes(body.outcome)) return NextResponse.json({ error: "Geçersiz rapor." }, { status: 400 });

  const now = new Date();
  const next = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
  const nextStatus = body.outcome === "slot_found"
    ? "match_found"
    : body.outcome === "verification_required"
      ? "verification_required"
      : body.outcome === "error"
        ? "error"
        : "active";

  const { data: track } = await supabase.from("visa_appointment_tracks").select("id,user_id,error_count").eq("id", body.trackId).maybeSingle();
  if (!track) return NextResponse.json({ error: "Takip bulunamadı." }, { status: 404 });

  await supabase.from("visa_appointment_check_logs").insert({
    track_id: track.id,
    worker_name: String(body.workerName || "visa-worker").slice(0, 80),
    outcome: body.outcome,
    message: String(body.message || "").slice(0, 1000) || null,
    available_dates: Array.isArray(body.availableDates) ? body.availableDates.slice(0, 20) : [],
    evidence_url: body.evidenceUrl ? String(body.evidenceUrl).slice(0, 1000) : null,
    checked_at: now.toISOString(),
  });

  if (body.outcome === "slot_found") {
    await supabase.from("visa_appointment_matches").insert({
      track_id: track.id,
      user_id: track.user_id,
      available_dates: Array.isArray(body.availableDates) ? body.availableDates.slice(0, 20) : [],
      provider_message: String(body.message || "").slice(0, 1000) || null,
      evidence_url: body.evidenceUrl ? String(body.evidenceUrl).slice(0, 1000) : null,
      expires_at: new Date(now.getTime() + 10 * 60 * 1000).toISOString(),
    });
  }

  const { error } = await supabase.from("visa_appointment_tracks").update({
    status: nextStatus,
    last_checked_at: now.toISOString(),
    next_check_at: nextStatus === "active" ? next : null,
    last_result: String(body.message || body.outcome).slice(0, 500),
    error_count: body.outcome === "error" ? Number(track.error_count || 0) + 1 : 0,
    locked_until: null,
    locked_by: null,
  }).eq("id", track.id);

  if (error) return NextResponse.json({ error: "Takip sonucu kaydedilemedi." }, { status: 500 });
  return NextResponse.json({ success: true });
}
