import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "./supabaseAdmin";
import { adminPrincipalFromRequest } from "./admin-auth";

type ReviewResult = { id: string; status: string; evidencePath: string | null };

export async function cleanupReviewedEvidence(supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>, result: ReviewResult) {
  if (!["approved","rejected"].includes(result.status)) return false;
  if (!result.evidencePath) return true;
  try {
    const { error } = await supabase.storage.from("travel-evidence").remove([result.evidencePath]);
    const alreadyMissing = error && (/not.?found|does not exist/i.test(error.message || "") || String(error.status) === "404");
    if (error && !alreadyMissing) return false;
    const { error: clearError } = await supabase.from("travel_verifications")
      .update({ evidence_path: null, proof_deleted_at: new Date().toISOString() })
      .eq("id", result.id).in("status", ["approved", "rejected"]).eq("evidence_path", result.evidencePath);
    return !clearError;
  } catch { return false; }
}

export async function reviewVerification(request: Request, id: string, action: "approve" | "reject") {
  const principal = await adminPrincipalFromRequest(request, ["moderator", "admin", "super_admin"]);
  if (!principal) return NextResponse.json({ error: "Yetkisiz işlem." }, { status: 401 });
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return NextResponse.json({ error: "Geçersiz kayıt kimliği." }, { status: 400 });
  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı kurulamadı." }, { status: 503 });
  const body = await request.json().catch(() => null);
  const note = typeof body?.adminNote === "string" ? body.adminNote.trim() : "";
  if (note.length > 1000 || (action === "reject" && !note)) return NextResponse.json({ error: "Geçerli bir yönetici notu gerekli; red sebebi boş olamaz." }, { status: 400 });
  const { data: verification, error: lookupError } = await supabase.from("travel_verifications")
    .select("id,status,evidence_path").eq("id", id).maybeSingle();
  if (lookupError) return NextResponse.json({ error: "Başvuru okunamadı." }, { status: 500 });
  if (!verification) return NextResponse.json({ error: "Başvuru bulunamadı." }, { status: 404 });
  if (action === "approve" && verification.status === "pending") {
    if (!verification.evidence_path) return NextResponse.json({ error: "Belgesiz başvuru onaylanamaz.", code: "EVIDENCE_MISSING" }, { status: 422 });
    const { error } = await supabase.storage.from("travel-evidence").createSignedUrl(verification.evidence_path, 30);
    if (error) return NextResponse.json({ error: "Başvuru belgesi doğrulanamadı; kayıt değiştirilmedi.", code: "EVIDENCE_PREVIEW_FAILED" }, { status: 422 });
  }
  const { data, error } = await supabase.rpc("review_travel_verification", {
    p_id: id, p_reviewer: principal.subject, p_action: action, p_note: note, p_evidence_path: verification.evidence_path,
  });
  if (error || !data) {
    const missing = error?.code === "PGRST202" || error?.code === "42883";
    const conflict = /review_conflict|unique constraint/i.test(error?.message || "");
    return NextResponse.json({ error: missing ? "Doğrulama için Build 24 veritabanı güncellemesi gerekli." : conflict ? "Başvuru başka bir işlemle güncellendi; listeyi yenile." : "İşlem tamamlanamadı; belge korunuyor.", code: missing ? "REVIEW_SCHEMA_MISSING" : "REVIEW_FAILED" }, { status: missing ? 503 : conflict ? 409 : 500 });
  }
  const cleaned = await cleanupReviewedEvidence(supabase, data as ReviewResult);
  return NextResponse.json({ success: true, cleanupPending: !cleaned });
}
