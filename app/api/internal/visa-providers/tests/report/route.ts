import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { authorizedVisaWorker } from "@/lib/visa-appointments/worker-auth";

export const runtime = "nodejs";

const OUTCOMES = ["accessible", "verification_required", "blocked", "provider_unavailable", "error"] as const;
type Outcome = (typeof OUTCOMES)[number];
const EVIDENCE_BUCKET = "visa-appointment-evidence";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function safeHttpsUrl(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString().slice(0, 1000) : null;
  } catch {
    return null;
  }
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
  if (!authorizedVisaWorker(request)) return NextResponse.json({ error: "Yetkisiz worker." }, { status: 401 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as {
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

  if (!body.targetId || !UUID_PATTERN.test(body.targetId) || !body.outcome || !OUTCOMES.includes(body.outcome)) {
    return NextResponse.json({ error: "Geçersiz sağlayıcı test raporu." }, { status: 400 });
  }
  const workerName = String(body.workerName || "").trim().slice(0, 80);
  if (!workerName) {
    return NextResponse.json({ error: "Worker adı zorunludur." }, { status: 400 });
  }

  const { data: target, error: targetError } = await supabase
    .from("visa_provider_test_targets")
    .select("id,enabled,queued_at,locked_until,locked_by")
    .eq("id", body.targetId)
    .maybeSingle();
  if (targetError) return NextResponse.json({ error: "Sağlayıcı hedefi okunamadı." }, { status: 500 });
  if (!target) return NextResponse.json({ error: "Sağlayıcı hedefi bulunamadı." }, { status: 404 });

  const now = new Date();
  const lockExpiresAt = target.locked_until ? new Date(target.locked_until).getTime() : 0;
  if (!target.enabled || !target.queued_at || target.locked_by !== workerName || lockExpiresAt <= now.getTime()) {
    return NextResponse.json(
      { error: "Sağlayıcı testi bu worker tarafından geçerli biçimde kilitlenmemiş." },
      { status: 409 },
    );
  }

  const evidence = await uploadEvidence(supabase, body.targetId, body.evidenceBase64, body.evidenceMimeType);
  const checkedAt = now.toISOString();
  const payload = {
    target_id: body.targetId,
    worker_name: workerName,
    outcome: body.outcome,
    http_status: Number.isFinite(body.httpStatus)
      ? Math.min(599, Math.max(0, Math.round(body.httpStatus || 0)))
      : null,
    final_url: safeHttpsUrl(body.finalUrl),
    page_title: String(body.pageTitle || "").slice(0, 300) || null,
    message: String(body.message || "").slice(0, 1000) || null,
    evidence_url: evidence,
    duration_ms: Number.isFinite(body.durationMs)
      ? Math.min(600_000, Math.max(0, Math.round(body.durationMs || 0)))
      : null,
    checked_at: checkedAt,
  };

  const { data: run, error: runError } = await supabase
    .from("visa_provider_test_runs")
    .insert(payload)
    .select("id")
    .single();
  if (runError) return NextResponse.json({ error: "Test sonucu kaydedilemedi." }, { status: 500 });

  const { data: updatedTarget, error } = await supabase
    .from("visa_provider_test_targets")
    .update({
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
    })
    .eq("id", body.targetId)
    .eq("enabled", true)
    .eq("locked_by", workerName)
    .gt("locked_until", checkedAt)
    .select("id")
    .maybeSingle();

  if (error || !updatedTarget) {
    if (run?.id) {
      await supabase.from("visa_provider_test_runs").delete().eq("id", run.id);
    }
    return NextResponse.json(
      { error: error ? "Sağlayıcı özeti güncellenemedi." : "Sağlayıcı kilidi değişti; eski test sonucu uygulanmadı." },
      { status: error ? 500 : 409 },
    );
  }
  return NextResponse.json({ success: true });
}
