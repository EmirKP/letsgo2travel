import { getSupabaseAdmin } from "../supabaseAdmin";
import type { WorkerSystemStatus } from "./worker-status";

export function workerHealth(data: { status?: unknown; poll_interval_ms?: unknown; last_seen_at?: unknown } | null, now = new Date()): WorkerSystemStatus {
  const checkedAt = now.toISOString();
  if (!data?.last_seen_at) return { state: "unknown", checkedAt, lastSeenAt: null, pollIntervalMs: null };
  const pollIntervalMs = Math.min(3_600_000, Math.max(60_000, Number(data.poll_interval_ms) || 300_000));
  const lastSeenAt = String(data.last_seen_at), age = now.getTime() - Date.parse(lastSeenAt);
  const fresh = Number.isFinite(age) && age >= -60_000 && age <= Math.max(180_000, pollIntervalMs * 2 + 60_000);
  const state = !fresh ? "offline" : data.status === "running" || data.status === "idle" ? "online" : "degraded";
  return { state, checkedAt, lastSeenAt, pollIntervalMs };
}
export async function getWorkerHealth(): Promise<WorkerSystemStatus> {
  const client = getSupabaseAdmin();
  if (!client) return workerHealth(null);
  try {
    const { data, error } = await client.from("visa_worker_heartbeats").select("status,poll_interval_ms,last_seen_at").order("last_seen_at", { ascending: false }).limit(1).maybeSingle();
    return workerHealth(error ? null : data);
  } catch { return workerHealth(null); }
}
