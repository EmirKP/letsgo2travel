import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import type { WorkerSystemStatus } from "@/lib/visa-appointments/worker-status";

export const dynamic = "force-dynamic";

function statusResponse(payload: WorkerSystemStatus) {
  return NextResponse.json(payload, {
    headers: { "Cache-Control": "public, max-age=0, s-maxage=20, stale-while-revalidate=30" },
  });
}

export async function GET() {
  const checkedAt = new Date().toISOString();
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return statusResponse({ state: "unknown", checkedAt, lastSeenAt: null, pollIntervalMs: null });
  }

  const { data, error } = await supabase
    .from("visa_worker_heartbeats")
    .select("status,poll_interval_ms,last_seen_at")
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.last_seen_at) {
    return statusResponse({ state: "unknown", checkedAt, lastSeenAt: null, pollIntervalMs: null });
  }

  const pollIntervalMs = Math.min(
    3_600_000,
    Math.max(60_000, Number(data.poll_interval_ms) || 300_000),
  );
  const lastSeenAt = String(data.last_seen_at);
  const lastSeenTime = new Date(lastSeenAt).getTime();
  const offlineAfterMs = Math.max(180_000, pollIntervalMs * 2 + 60_000);
  const fresh = Number.isFinite(lastSeenTime) && Date.now() - lastSeenTime <= offlineAfterMs;
  const state = !fresh
    ? "offline"
    : data.status === "error"
      ? "degraded"
      : "online";

  return statusResponse({ state, checkedAt, lastSeenAt, pollIntervalMs });
}
