import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSupabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(request: Request) {
  const permissionError = await requireAdmin(request, ["admin", "super_admin"]);
  if (permissionError) return permissionError;

  const supabase = getSupabaseAdmin();
  if (!supabase) return NextResponse.json({ error: "Sunucu yapılandırması eksik." }, { status: 503 });

  const { data, error } = await supabase
    .from("visa_center_pages")
    .select("id,country_name,visa_title,appointment_status,appointment_note,source_note,official_source_url,last_checked_at")
    .order("country_name", { ascending: true });

  if (error) return NextResponse.json({ error: "Vize merkezi kayıtları alınamadı." }, { status: 500 });
  return NextResponse.json({ data: data || [] }, { headers: { "Cache-Control": "private, no-store" } });
}
