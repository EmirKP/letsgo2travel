import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/admin-auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authError = await requireAdmin(request);
    if (authError) return authError;

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "DB error" }, { status: 500 });

    const authHeader = request.headers.get("Authorization");
    let adminUserId = null;
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) adminUserId = user.id;
    }

    const resolvedParams = await params;
    const { id } = resolvedParams;

    const body = await request.json();
    const adminNote = body.adminNote || null;

    // Get verification details
    const { data: verification, error: fetchError } = await supabase
      .from("travel_verifications")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !verification) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }

    if (verification.status === 'approved') {
      return NextResponse.json({ error: "Kayıt zaten onaylanmış." }, { status: 400 });
    }

    // 1. Update verification
    await supabase
      .from("travel_verifications")
      .update({
        status: 'approved',
        admin_note: adminNote,
        reviewed_by: adminUserId,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", id);

    // 2. Add to user_country_unlocks
    await supabase
      .from("user_country_unlocks")
      .upsert({
        user_id: verification.user_id,
        country_code: verification.country_code,
        country_name: verification.country_name,
        verification_id: id
      }, { onConflict: 'user_id, country_code' });

    // 3. Add permissions
    await supabase
      .from("country_experience_permissions")
      .upsert({
        user_id: verification.user_id,
        country_code: verification.country_code,
        can_answer: true,
        can_comment: true,
        can_create_warning: true,
        source_verification_id: id
      }, { onConflict: 'user_id, country_code' });

    // 4. Points & Badges
    await supabase.from("user_points_log").insert({
      user_id: verification.user_id,
      action_type: 'country_verified',
      points: 100,
      country_code: verification.country_code,
      related_id: id
    });

    await supabase.from("user_badges").upsert([
      { user_id: verification.user_id, badge_key: 'belgeli_gezgin', badge_label: 'Belgeli Gezgin' },
      { user_id: verification.user_id, badge_key: 'country_verified', badge_label: 'Ülke Doğrulandı', country_code: verification.country_code }
    ], { onConflict: 'user_id, badge_key, country_code' });

    // 5. Trust score update
    const { data: currentScore } = await supabase
      .from("user_trust_scores")
      .select("verified_country_count")
      .eq("user_id", verification.user_id)
      .maybeSingle();

    await supabase.from("user_trust_scores").upsert({
      user_id: verification.user_id,
      verified_country_count: (currentScore?.verified_country_count || 0) + 1,
      updated_at: new Date().toISOString()
    });

    // 6. Audit Log
    await supabase.from("admin_audit_logs").insert({
      admin_user_id: adminUserId,
      action: 'approve_verification',
      target_type: 'travel_verifications',
      target_id: id,
      note: adminNote
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Approve error", err);
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
