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
    const adminNote = body.adminNote;

    if (!adminNote) {
      return NextResponse.json({ error: "Red sebebi (admin notu) zorunludur." }, { status: 400 });
    }

    const { data: verification, error: fetchError } = await supabase
      .from("travel_verifications")
      .select("*")
      .eq("id", id)
      .single();

    if (fetchError || !verification) {
      return NextResponse.json({ error: "Kayıt bulunamadı." }, { status: 404 });
    }

    await supabase
      .from("travel_verifications")
      .update({
        status: 'rejected',
        admin_note: adminNote,
        reviewed_by: adminUserId,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", id);

    await supabase.from("admin_audit_logs").insert({
      admin_user_id: adminUserId,
      action: 'reject_verification',
      target_type: 'travel_verifications',
      target_id: id,
      note: adminNote
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
