import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { requireAdmin } from "@/lib/admin-auth";

export async function PATCH(
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

    const { appointment_status, appointment_note, source_note, official_source_url } = await request.json();
    const officialSourceUrl = String(official_source_url || "").trim();

    if (officialSourceUrl) {
      try {
        const parsed = new URL(officialSourceUrl);
        if (parsed.protocol !== "https:") throw new Error("HTTPS gerekli");
      } catch {
        return NextResponse.json({ error: "Resmî kaynak geçerli bir HTTPS adresi olmalı." }, { status: 400 });
      }
    }

    const { error } = await supabase
      .from('visa_center_pages')
      .update({
        appointment_status,
        appointment_note,
        source_note,
        official_source_url: officialSourceUrl || null,
        last_checked_at: new Date().toISOString()
      })
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: "Güncellenemedi" }, { status: 500 });
    }

    await supabase.from('visa_appointment_updates').insert({
      visa_page_id: id,
      admin_user_id: adminUserId,
      appointment_status,
      appointment_note,
      source_note
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
