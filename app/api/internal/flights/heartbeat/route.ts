import { NextResponse } from "next/server";
import { authorizedFlightWorker } from "@/lib/flights/server/worker-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const STATUSES = new Set(["starting", "running", "idle", "error", "stopping"]);

export async function POST(request: Request) {
  if (!authorizedFlightWorker(request)) {
    return NextResponse.json({ error: "Yetkisiz worker." }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const workerName = String(body.workerName || "").trim();
  const status = String(body.status || "idle");
  const pollIntervalMs = Math.min(3_600_000, Math.max(1_000, Number(body.pollIntervalMs) || 5_000));
  const startedAt = String(body.startedAt || "");
  const parsedStartedAt = new Date(startedAt);
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(workerName) || !STATUSES.has(status) || Number.isNaN(parsedStartedAt.getTime())) {
    return NextResponse.json({ error: "Heartbeat verisi geçersiz." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("flight_worker_heartbeats").upsert({
    worker_name: workerName,
    worker_version: String(body.workerVersion || "").slice(0, 40) || null,
    status,
    poll_interval_ms: pollIntervalMs,
    started_at: parsedStartedAt.toISOString(),
    last_seen_at: now,
    last_error: String(body.lastError || "").slice(0, 500) || null,
    updated_at: now,
  }, { onConflict: "worker_name" });
  if (error) return NextResponse.json({ error: "Worker durumu yazılamadı." }, { status: 503 });
  return NextResponse.json({ ok: true });
}

