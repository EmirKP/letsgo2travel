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
  if (adminNote.length > 1000) {
    return NextResponse.json({ error: "Yönetici notu en fazla 1000 karakter olabilir." }, { status: 400 });
  }

  const reviewerId = await reviewerIdFromRequest(request, supabase);
  const reviewStartedAt = new Date().toISOString();

  const { data: verification, error: claimError } = await supabase
    .from("travel_verifications")
    .update({ reviewed_by: reviewerId, reviewed_at: reviewStartedAt })
    .eq("id", id)
    .eq("status", "pending")
    .is("reviewed_at", null)
    .select("id,user_id,country_code,country_name,evidence_path")
    .maybeSingle();

  if (claimError) {
    console.error("Verification claim error", claimError);
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
      .eq("reviewed_at", reviewStartedAt);
  };

  try {
    const unlockResult = await supabase.from("user_country_unlocks").upsert({
      user_id: verification.user_id,
      country_code: verification.country_code,
      country_name: verification.country_name,
      verification_id: id,
      is_active: true,
    }, { onConflict: "user_id,country_code" });
    if (unlockResult.error) throw unlockResult.error;

    const permissionResult = await supabase.from("country_experience_permissions").upsert({
      user_id: verification.user_id,
      country_code: verification.country_code,
      can_answer: true,
      can_comment: true,
      can_create_warning: true,
      source_verification_id: id,
    }, { onConflict: "user_id,country_code" });
    if (permissionResult.error) throw permissionResult.error;

    const { data: existingPoint, error: pointLookupError } = await supabase
      .from("user_points_log")
      .select("id")
      .eq("user_id", verification.user_id)
      .eq("action_type", "country_verified")
      .eq("related_id", id)
      .maybeSingle();
    if (pointLookupError) throw pointLookupError;
    if (!existingPoint) {
      const pointResult = await supabase.from("user_points_log").insert({
        user_id: verification.user_id,
        action_type: "country_verified",
        points: 100,
        country_code: verification.country_code,
        related_id: id,
      });
      if (pointResult.error) throw pointResult.error;
    }

    const countryBadgeResult = await supabase.from("user_badges").upsert({
      user_id: verification.user_id,
      badge_key: "country_verified",
      badge_label: "Ülke Doğrulandı",
      country_code: verification.country_code,
    }, { onConflict: "user_id,badge_key,country_code" });
    if (countryBadgeResult.error) throw countryBadgeResult.error;

    const { data: travelerBadge, error: badgeLookupError } = await supabase
      .from("user_badges")
      .select("id")
      .eq("user_id", verification.user_id)
      .eq("badge_key", "belgeli_gezgin")
      .limit(1)
      .maybeSingle();
    if (badgeLookupError) throw badgeLookupError;
    if (!travelerBadge) {
      const badgeResult = await supabase.from("user_badges").insert({
        user_id: verification.user_id,
        badge_key: "belgeli_gezgin",
        badge_label: "Belgeli Gezgin",
      });
      if (badgeResult.error) throw badgeResult.error;
    }

    const { count: verifiedCountryCount, error: countError } = await supabase
      .from("user_country_unlocks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", verification.user_id)
      .eq("is_active", true);
    if (countError) throw countError;

    const scoreResult = await supabase.from("user_trust_scores").upsert({
      user_id: verification.user_id,
      verified_country_count: verifiedCountryCount || 0,
      updated_at: reviewStartedAt,
    });
    if (scoreResult.error) throw scoreResult.error;

    const { data: completed, error: completeError } = await supabase
      .from("travel_verifications")
      .update({
        status: "approved",
        admin_note: adminNote || null,
        reviewed_by: reviewerId,
        reviewed_at: reviewStartedAt,
      })
      .eq("id", id)
      .eq("status", "pending")
      .eq("reviewed_at", reviewStartedAt)
      .select("id")
      .maybeSingle();
    if (completeError || !completed) throw completeError || new Error("Doğrulama durumu güncellenemedi.");

    if (verification.evidence_path) {
      const { error: removeError } = await supabase.storage
        .from("travel-evidence")
        .remove([verification.evidence_path]);
      if (removeError) {
        console.error("Approved evidence cleanup error", removeError);
        return NextResponse.json(
          { error: "Başvuru onaylandı ancak özel belge silinemedi. İşlemi yöneticinin tekrar kontrol etmesi gerekiyor." },
          { status: 500 },
        );
      }

      const { error: clearPathError } = await supabase
        .from("travel_verifications")
        .update({ evidence_path: null })
        .eq("id", id);
      if (clearPathError) console.error("Approved evidence path cleanup error", clearPathError);
    }

    const auditResult = await supabase.from("admin_audit_logs").insert({
      admin_user_id: reviewerId,
      action: "approve_verification",
      target_type: "travel_verifications",
      target_id: id,
      note: adminNote || null,
    });
    if (auditResult.error) console.error("Verification audit log error", auditResult.error);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Approve verification error", error);
    await releaseClaim();
    return NextResponse.json({ error: "Onay işlemi tamamlanamadı; başvuru beklemede bırakıldı." }, { status: 500 });
  }
}
