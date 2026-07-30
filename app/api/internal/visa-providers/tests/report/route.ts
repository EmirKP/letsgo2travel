import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const OUTCOMES = ["accessible", "verification_required", "blocked", "provider_unavailable", "error"] as const;
type Outcome = (typeof OUTCOMES)[number];
const EVIDENCE_BUCKET = "visa-appointment-evidence";

function authorized(request: Request) {
  const expected = process.env.VISA_WORKER_SECRET;
  const received = request.headers.get("x-worker-secret");
  return Boolean(expected && received && expected === received);
}

async function uploadEvidence(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  targetId: string,
  evidenceBase64?: string,
  evidenceMimeType?: string,
) {
  if (!evidenceBase64 || evidenceBase64.length > 2_800_000) return null;
  try {
    const buffer = Buffer.from(evidenceBase64, "base64");
    if (buffer.length < 100 || buffer.length > 2_000_000) return null;
    const contentType = evidenceMimeType === "image/png" ? "image/png" : "image/jpeg";
    const extension = contentType === "image/png" ? "png" : "jpg";
    const path = `provider-tests/${targetId}/${Date.now()}.${extension}`;
    const { error } = await supabase.storage.from(EVIDENCE_BUCKET).upload(path, buffer, {
      contentType,
      cacheControl: "3600",
      upsert: false,
    });
    return error ? null : `storage:${path}`;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Yetkisiz worker." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });

  const body = (await request.json()) as {
    targetId?: string;
    workerName?: string;
    outcome?: Outcome;
    httpStatus?: number;
    finalUrl?: string;
    pageTitle?: string;
    message?: string;
    durationMs?: number;
    evidenceBase64?: string;
    evidenceMimeType?: string;
  };

  if (!body.targetId || !body.outcome || !OUTCOMES.includes(body.outcome)) {
    return NextResponse.json({ error: "Geçersiz sağlayıcı test raporu." }, { status: 400 });
  }

  const evidence = await uploadEvidence(supabase, body.targetId, body.evidenceBase64, body.evidenceMimeType);
  const checkedAt = new Date().toISOString();
  const payload = {
    target_id: body.targetId,
    worker_name: String(body.workerName || "visa-worker").slice(0, 80),
    outcome: body.outcome,
    http_status: Number.isFinite(body.httpStatus) ? body.httpStatus : null,
    final_url: String(body.finalUrl || "").slice(0, 1000) || null,
    page_title: String(body.pageTitle || "").slice(0, 300) || null,
    message: String(body.message || "").slice(0, 1000) || null,
    evidence_url: evidence,
    duration_ms: Number.isFinite(body.durationMs) ? Math.max(0, Math.round(body.durationMs || 0)) : null,
    checked_at: checkedAt,
  };

  const { error: runError } = await supabase.from("visa_provider_test_runs").insert(payload);
  if (runError) return NextResponse.json({ error: "Test sonucu kaydedilemedi." }, { status: 500 });

  const { error } = await supabase.from("visa_provider_test_targets").update({
    queued_at: null,
    locked_until: null,
    locked_by: null,
    last_outcome: body.outcome,
    last_http_status: payload.http_status,
    last_checked_at: checkedAt,
    last_message: payload.message,
    last_final_url: payload.final_url,
    last_title: payload.page_title,
    last_evidence_url: evidence,
  }).eq("id", body.targetId);

  if (error) return NextResponse.json({ error: "Sağlayıcı özeti güncellenemedi." }, { status: 500 });
  return NextResponse.json({ success: true });
}
