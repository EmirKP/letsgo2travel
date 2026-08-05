import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizedVisaWorker } from "@/lib/visa-appointments/worker-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authorizedVisaWorker(request)) {
    return NextResponse.json({ error: "Yetkisiz worker." }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase yapilandirilmamis." },
      { status: 500 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    workerName?: string;
    status?: string;
    pollIntervalMs?: number;
    workerVersion?: string;
    startedAt?: string;
  };

  const workerName = String(body.workerName || "visa-worker").slice(0, 80);
  const pollIntervalMs = Math.max(
    60000,
    Number(body.pollIntervalMs) || 60000
  );

  const { error } = await supabase
    .from("visa_worker_heartbeats")
    .upsert(
      {
        worker_name: workerName,
        status: String(body.status || "online").slice(0, 30),
        poll_interval_ms: pollIntervalMs,
        worker_version: String(body.workerVersion || "1.0.0").slice(0, 30),
        started_at: body.startedAt || new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "worker_name" }
    );

  if (error) {
    return NextResponse.json(
      { error: "Heartbeat kaydedilemedi.", detail: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
