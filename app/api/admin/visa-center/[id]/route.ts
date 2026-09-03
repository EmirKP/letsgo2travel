import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";
import { adminPrincipalFromRequest } from "@/lib/admin-auth";
import { APPOINTMENT_STATUS_INFO, type AppointmentStatus } from "@/lib/visa/appointmentStatus";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const principal = await adminPrincipalFromRequest(request, ["admin", "super_admin"]);
    if (!principal) return NextResponse.json({ error: "Yetkisiz işlem. Yetkiniz bulunmuyor." }, { status: 401 });

    const supabase = getSupabaseAdmin();
    if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 503 });

    const resolvedParams = await params;
    const { id } = resolvedParams;
    if (!UUID_PATTERN.test(id)) return NextResponse.json({ error: "Geçersiz kayıt kimliği." }, { status: 400 });

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Geçersiz istek gövdesi." }, { status: 400 });
    const appointmentStatus = String(body.appointment_status || "") as AppointmentStatus;
    const appointmentNote = String(body.appointment_note || "").trim();
    const sourceNote = String(body.source_note || "").trim();
    if (!Object.hasOwn(APPOINTMENT_STATUS_INFO, appointmentStatus)) {
      return NextResponse.json({ error: "Geçersiz randevu durumu." }, { status: 400 });
    }
    if (appointmentNote.length > 2000 || sourceNote.length > 2000) {
      return NextResponse.json({ error: "Not alanları en fazla 2.000 karakter olabilir." }, { status: 400 });
    }
    const officialSourceUrl = String(body.official_source_url || "").trim();
    if (officialSourceUrl.length > 2048) {
      return NextResponse.json({ error: "Resmî kaynak adresi çok uzun." }, { status: 400 });
    }

    if (officialSourceUrl) {
      try {
        const parsed = new URL(officialSourceUrl);
        if (parsed.protocol !== "https:") throw new Error("HTTPS gerekli");
      } catch {
        return NextResponse.json({ error: "Resmî kaynak geçerli bir HTTPS adresi olmalı." }, { status: 400 });
      }
    }

    const { data, error } = await supabase
      .from('visa_center_pages')
      .update({
        appointment_status: appointmentStatus,
        appointment_note: appointmentNote || null,
        source_note: sourceNote || null,
        official_source_url: officialSourceUrl || null,
        last_checked_at: new Date().toISOString()
      })
      .eq('id', id)
      .select("id")
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ error: "Güncellenemedi" }, { status: 500 });
    }

    await supabase.from('visa_appointment_updates').insert({
      visa_page_id: id,
      admin_user_id: principal.subject,
      appointment_status: appointmentStatus,
      appointment_note: appointmentNote || null,
      source_note: sourceNote || null
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Sunucu hatası" }, { status: 500 });
  }
}
