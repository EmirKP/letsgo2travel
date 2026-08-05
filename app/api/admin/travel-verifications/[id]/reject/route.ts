import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/admin-auth";
import { adminSessionFromRequest } from "@/lib/admin-session";

const ADMIN_ROLES = ["moderator", "admin", "super_admin"];
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function reviewerIdFromRequest(request: Request, supabase: NonNullable<ReturnType<typeof getSupabaseAdmin>>) {
  const signedSession = await adminSessionFromRequest(request);
  if (signedSession?.subject && signedSession.subject !== "legacy-admin") return signedSession.subject;

  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const { data } = await supabase.auth.getUser(authHeader.slice(7).trim());
  return data.user?.id || null;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const authError = await requireAdmin(request, ADMIN_ROLES);
  if (authError) return authError;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Veritabanı bağlantısı kurulamadı." }, { status: 500 });

  const { id } = await params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Geçersiz kayıt kimliği." }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const adminNote = typeof body.adminNote === "string" ? body.adminNote.trim() : "";
  if (!adminNote) {
    return NextResponse.json({ error: "Red sebebi zorunludur." }, { status: 400 });
  }
  if (adminNote.length > 1000) {
    return NextResponse.json({ error: "Red sebebi en fazla 1000 karakter olabilir." }, { status: 400 });
  }

  const reviewerId = await reviewerIdFromRequest(request, supabase);
  const reviewedAt = new Date().toISOString();
  const { data: verification, error: claimError } = await supabase
    .from("travel_verifications")
    .update({
      reviewed_by: reviewerId,
      reviewed_at: reviewedAt,
    })
    .eq("id", id)
    .eq("status", "pending")
    .is("reviewed_at", null)
    .select("id,evidence_path")
    .maybeSingle();

  if (claimError) {
    console.error("Reject verification claim error", claimError);
    return NextResponse.json({ error: "Başvuru inceleme için kilitlenemedi." }, { status: 500 });
  }
  if (!verification) {
    return NextResponse.json({ error: "Başvuru daha önce işlenmiş veya başka bir yönetici tarafından inceleniyor." }, { status: 409 });
  }

  const releaseClaim = async () => {
    await supabase
      .from("travel_verifications")
      .update({ reviewed_by: null, reviewed_at: null })
      .eq("id", id)
      .eq("status", "pending")
      .eq("reviewed_at", reviewedAt);
  };

  try {
    if (verification.evidence_path) {
      const { error: removeError } = await supabase.storage
        .from("travel-evidence")
        .remove([verification.evidence_path]);
      if (removeError) throw new Error("Özel belge silinemedi.");

      const { error: clearPathError } = await supabase
        .from("travel_verifications")
        .update({ evidence_path: null, proof_deleted_at: reviewedAt })
        .eq("id", id)
        .eq("status", "pending")
        .eq("reviewed_at", reviewedAt);
      if (clearPathError) throw clearPathError;
    }

    const { data: completed, error: completeError } = await supabase
      .from("travel_verifications")
      .update({
        status: "rejected",
        admin_note: adminNote,
        reviewed_by: reviewerId,
        reviewed_at: reviewedAt,
      })
      .eq("id", id)
      .eq("status", "pending")
      .eq("reviewed_at", reviewedAt)
      .select("id")
      .maybeSingle();
    if (completeError || !completed) throw completeError || new Error("Red durumu güncellenemedi.");

    const auditResult = await supabase.from("admin_audit_logs").insert({
      admin_user_id: reviewerId,
      action: "reject_verification",
      target_type: "travel_verifications",
      target_id: id,
      note: adminNote,
    });
    if (auditResult.error) console.error("Verification audit log error", auditResult.error);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Reject verification error", error);
    await releaseClaim();
    return NextResponse.json({ error: "Red işlemi tamamlanamadı; başvuru beklemede bırakıldı." }, { status: 500 });
  }
}
