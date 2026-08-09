import { NextResponse } from "next/server";
import { authorizedFlightWorker } from "@/lib/flights/server/worker-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authorizedFlightWorker(request)) {
    return NextResponse.json({ error: "Yetkisiz worker." }, { status: 401 });
  }
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 503 });

  const body = (await request.json().catch(() => ({}))) as { workerName?: unknown; limit?: unknown };
  const workerName = String(body.workerName || "").trim();
  const limit = Math.min(10, Math.max(1, Number(body.limit) || 2));
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(workerName)) {
    return NextResponse.json({ error: "Worker adı geçersiz." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("claim_flight_search_jobs", {
    p_worker_name: workerName,
    p_limit: limit,
  });
  if (error) {
    return NextResponse.json(
      { error: "Uçuş görevleri alınamadı. Faz 1 migration'ını kontrol edin." },
      { status: 503 },
    );
  }

  return NextResponse.json(
    { data: Array.isArray(data) ? data : [] },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

