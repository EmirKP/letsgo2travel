import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizedVisaWorker } from "@/lib/visa-appointments/worker-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!authorizedVisaWorker(request)) return NextResponse.json({ error: "Yetkisiz worker." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { workerName?: string; limit?: number };
  const workerName = String(body.workerName || "visa-worker").slice(0, 80);
  const limit = Math.min(5, Math.max(1, Number(body.limit) || 2));
  const { data, error } = await supabase.rpc("claim_visa_provider_tests", {
    p_worker_name: workerName,
    p_limit: limit,
  });
  if (error) return NextResponse.json({ error: "Sağlayıcı testleri alınamadı.", detail: error.message }, { status: 500 });
  return NextResponse.json({ data: data || [] });
}
