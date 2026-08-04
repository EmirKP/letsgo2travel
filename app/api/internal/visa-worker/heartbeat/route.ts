import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const WORKER_STATES = ["starting", "running", "idle", "error"] as const;
type WorkerState = (typeof WORKER_STATES)[number];

function authorized(request: Request) {
  const expected = process.env.VISA_WORKER_SECRET;
  const received = request.headers.get("x-worker-secret");
  return Boolean(expected && received && expected === received);
}

export async function POST(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "Yetkisiz worker." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    workerName?: string;
    status?: WorkerState;
    pollIntervalMs?: number;
    workerVersion?: string;
    startedAt?: string;
    lastError?: string;
  };
  const workerName = String(body.workerName || "").trim().slice(0, 80);
  const status = WORKER_STATES.includes(body.status as WorkerState)
    ? body.status as WorkerState
    : "running";
  const pollIntervalMs = Math.min(
    3_600_000,
    Math.max(60_000, Math.round(Number(body.pollIntervalMs) || 300_000)),
  );
  const parsedStartedAt = body.startedAt ? new Date(body.startedAt) : null;

  if (!workerName) {
    return NextResponse.json({ error: "Worker adı zorunludur." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const { error } = await supabase.from("visa_worker_heartbeats").upsert({
    worker_name: workerName,
    status,
    poll_interval_ms: pollIntervalMs,
    worker_version: String(body.workerVersion || "").slice(0, 40) || null,
    started_at: parsedStartedAt && !Number.isNaN(parsedStartedAt.getTime())
      ? parsedStartedAt.toISOString()
      : now,
    last_seen_at: now,
    last_error: status === "error"
      ? String(body.lastError || "Bilinmeyen worker hatası").slice(0, 500)
      : null,
    updated_at: now,
  }, { onConflict: "worker_name" });

  if (error) {
    return NextResponse.json(
      { error: "Worker canlılık kaydı yazılamadı. Heartbeat SQL kurulumu eksik olabilir." },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, receivedAt: now });
}

