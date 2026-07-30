import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const EVIDENCE_BUCKET = "visa-appointment-evidence";

async function signedEvidenceUrl(
  supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>,
  reference: string | null,
) {
  if (!reference) return null;
  if (!reference.startsWith("storage:")) return reference;
  const path = reference.slice("storage:".length);
  const { data, error } = await supabase.storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 600);
  return error ? null : data.signedUrl;
}

export async function GET(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin", "moderator"]);
  if (authError) return authError;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });

  const { data, error } = await supabase
    .from("visa_provider_test_targets")
    .select("id,code,provider_code,provider_name,label,covered_countries,probe_url,official_url,mode,enabled,queued_at,last_outcome,last_http_status,last_checked_at,last_message,last_final_url,last_title,last_evidence_url")
    .order("provider_name", { ascending: true })
    .order("label", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "Sağlayıcı test tabloları kurulmamış olabilir.", detail: error.message }, { status: 500 });
  }

  const rows = await Promise.all((data || []).map(async (row) => ({
    ...row,
    last_evidence_url: await signedEvidenceUrl(supabase, row.last_evidence_url),
  })));

  const stats = {
    total: rows.length,
    queued: rows.filter((row) => Boolean(row.queued_at)).length,
    accessible: rows.filter((row) => row.last_outcome === "accessible").length,
    verification: rows.filter((row) => row.last_outcome === "verification_required").length,
    blocked: rows.filter((row) => row.last_outcome === "blocked").length,
    unavailable: rows.filter((row) => ["provider_unavailable", "error"].includes(row.last_outcome || "")).length,
  };

  return NextResponse.json({ data: rows, stats }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: Request) {
  const authError = await requireAdmin(request, ["admin", "super_admin"]);
  if (authError) return authError;
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Supabase yapılandırılmamış." }, { status: 500 });

  const body = (await request.json().catch(() => ({}))) as { action?: "queue_all" | "queue_one"; targetId?: string };
  const now = new Date().toISOString();

  if (body.action === "queue_all") {
    const { error } = await supabase
      .from("visa_provider_test_targets")
      .update({ queued_at: now, locked_until: null, locked_by: null })
      .eq("enabled", true);
    if (error) return NextResponse.json({ error: "Sağlayıcı testleri kuyruğa alınamadı." }, { status: 500 });
    return NextResponse.json({ message: "Tüm sağlayıcı testleri kuyruğa alındı." });
  }

  if (body.action === "queue_one" && body.targetId) {
    const { error } = await supabase
      .from("visa_provider_test_targets")
      .update({ queued_at: now, locked_until: null, locked_by: null })
      .eq("id", body.targetId);
    if (error) return NextResponse.json({ error: "Sağlayıcı testi kuyruğa alınamadı." }, { status: 500 });
    return NextResponse.json({ message: "Sağlayıcı testi kuyruğa alındı." });
  }

  return NextResponse.json({ error: "Geçersiz işlem." }, { status: 400 });
}
